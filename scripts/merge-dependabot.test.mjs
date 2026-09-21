import assert from "node:assert/strict";
import { test } from "node:test";
import mergeDependabot from "./merge-dependabot.mjs";

function scenario() {
  let time = 0;
  const state = {
    pr: {
      user: { login: "dependabot[bot]" },
      base: { ref: "main" },
      head: {
        sha: "old",
        ref: "dependabot/npm/test",
        repo: { full_name: "owner/repo" },
      },
      draft: false,
      state: "open",
      mergeable: true,
      mergeable_state: "clean",
    },
    run: {
      workflow_id: 1,
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      head_sha: "old",
    },
    dispatched: [],
    merged: [],
    updated: [],
    comments: [],
    childConclusion: "success",
  };
  const context = {
    repo: { owner: "owner", repo: "repo" },
    eventName: "workflow_run",
    payload: { workflow_run: { id: 10, pull_requests: [{ number: 27 }] } },
  };
  const github = {
    rest: {
      pulls: {
        get: async () => ({ data: structuredClone(state.pr) }),
        updateBranch: async (args) => {
          state.updated.push(args.expected_head_sha);
          state.pr.head.sha = "updated";
          state.pr.mergeable_state = "clean";
        },
        merge: async (args) => {
          state.merged.push(args.sha);
          state.pr.state = "closed";
          state.pr.merged = true;
          return { data: { merged: true } };
        },
      },
      actions: {
        getWorkflow: async () => ({ data: { id: 1 } }),
        getWorkflowRun: async ({ run_id }) => ({
          data:
            run_id === 10
              ? state.run
              : {
                  workflow_id: 1,
                  event: "workflow_dispatch",
                  status: "completed",
                  conclusion: state.childConclusion,
                  head_sha: state.dispatched.find((run) => run.id === run_id)
                    .sha,
                  head_branch: state.pr.head.ref,
                },
        }),
        createWorkflowDispatch: async ({ ref }) => {
          const id = 20 + state.dispatched.length;
          state.dispatched.push({ ref, id, sha: state.pr.head.sha });
          return {
            data: {
              workflow_run_id: id,
              html_url: `https://example.com/${id}`,
            },
          };
        },
      },
      issues: {
        listComments: async () => ({
          data: state.comments.map((body) => ({ body })),
        }),
        createComment: async ({ body }) => {
          state.comments.push(body);
        },
      },
    },
  };
  const execute = () =>
    mergeDependabot({
      github,
      context,
      core: { info() {} },
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    });
  return { state, context, github, execute };
}

test("成功した現在のSHAだけをマージしmainを明示検証する", async () => {
  const s = scenario();
  await s.execute();
  assert.deepEqual(s.state.merged, ["old"]);
  assert.deepEqual(
    s.state.dispatched.map((run) => run.ref),
    ["main"],
  );
});

test("古いPRを更新し、新しいSHAの検証成功後にマージする", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  await s.execute();
  assert.deepEqual(s.state.updated, ["old"]);
  assert.deepEqual(s.state.merged, ["updated"]);
  assert.deepEqual(
    s.state.dispatched.map((run) => run.ref),
    ["dependabot/npm/test", "main"],
  );
});

test("対象外PR・古いSHA・不成功の実行では変更しない", async () => {
  for (const change of [
    (s) => {
      s.pr.user.login = "human";
    },
    (s) => {
      s.pr.base.ref = "other";
    },
    (s) => {
      s.pr.draft = true;
    },
    (s) => {
      s.pr.head.repo.full_name = "fork/repo";
    },
    (s) => {
      s.run.head_sha = "stale";
    },
    (s) => {
      s.run.workflow_id = 2;
    },
    (s) => {
      s.run.conclusion = "failure";
    },
  ]) {
    const s = scenario();
    change(s.state);
    await s.execute();
    assert.deepEqual(
      [s.state.updated, s.state.merged, s.state.dispatched],
      [[], [], []],
    );
  }
});

test("更新後のテスト失敗ではマージもmain検証も実行しない", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  s.state.childConclusion = "failure";
  await assert.rejects(s.execute(), /Verify 20: failure/);
  assert.deepEqual(s.state.merged, []);
  assert.equal(s.state.dispatched.length, 1);
});

test("検証中にPRのheadが変わった場合は停止する", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  const getRun = s.github.rest.actions.getWorkflowRun;
  s.github.rest.actions.getWorkflowRun = async (args) => {
    const result = await getRun(args);
    if (args.run_id !== 10) s.state.pr.head.sha = "someone-else";
    return result;
  };
  await s.execute();
  assert.deepEqual(s.state.merged, []);
});

test("別SHAの明示実行は成功しても受け入れない", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  const getRun = s.github.rest.actions.getWorkflowRun;
  s.github.rest.actions.getWorkflowRun = async (args) => {
    const result = await getRun(args);
    if (args.run_id !== 10) result.data.head_sha = "wrong";
    return result;
  };
  await assert.rejects(s.execute(), /does not match/);
  assert.deepEqual(s.state.merged, []);
});

test("マージ直前にmainが進んだ場合は更新と検証をやり直す", async () => {
  const s = scenario();
  const merge = s.github.rest.pulls.merge;
  s.github.rest.pulls.merge = async (args) => {
    if (args.sha === "old") {
      s.state.pr.mergeable_state = "behind";
      throw Object.assign(new Error("Required verify"), { status: 405 });
    }
    return merge(args);
  };
  await s.execute();
  assert.deepEqual(s.state.merged, ["updated"]);
});

test("競合時は同じSHAにつき一度だけDependabotへ再作成を依頼する", async () => {
  const conflict = scenario();
  conflict.state.pr.mergeable = false;
  await conflict.execute();
  await conflict.execute();
  assert.deepEqual(conflict.state.comments, [
    "@dependabot recreate\n\n<!-- dependabot-recreate:old -->",
  ]);
  assert.deepEqual(conflict.state.merged, []);
});

test("他のRuleset違反・待機超過は停止する", async () => {
  const blocked = scenario();
  blocked.github.rest.pulls.merge = async () => {
    throw Object.assign(new Error("Ruleset"), { status: 405 });
  };
  await assert.rejects(blocked.execute(), /Ruleset/);
  const pending = scenario();
  pending.state.pr.mergeable = null;
  await assert.rejects(pending.execute(), /timed out/);
});

test("main検証の起動失敗後は二重マージせず手動復旧できる", async () => {
  const s = scenario();
  const dispatch = s.github.rest.actions.createWorkflowDispatch;
  s.github.rest.actions.createWorkflowDispatch = async () => {
    throw new Error("dispatch unavailable");
  };
  await assert.rejects(s.execute(), /unavailable/);
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  s.github.rest.actions.createWorkflowDispatch = dispatch;
  await s.execute();
  assert.deepEqual(s.state.merged, ["old"]);
  assert.deepEqual(
    s.state.dispatched.map((run) => run.ref),
    ["main"],
  );
});

test("未マージPRの手動復旧では必ず新しく検証する", async () => {
  const s = scenario();
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  await s.execute();
  assert.deepEqual(
    s.state.dispatched.map((run) => run.ref),
    ["dependabot/npm/test", "main"],
  );
  assert.deepEqual(s.state.merged, ["old"]);
});
