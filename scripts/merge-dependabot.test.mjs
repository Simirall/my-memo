import assert from "node:assert/strict";
import { test } from "node:test";
import mergeDependabot from "./merge-dependabot.mjs";

function scenario() {
  let time = 0;
  const state = {
    mainSha: "base",
    behindBy: 0,
    onSleep() {},
    pr: {
      user: { login: "dependabot[bot]" },
      base: { ref: "main", sha: "base" },
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
      id: 10,
      run_number: 1,
      run_attempt: 1,
      pull_requests: [{ number: 27 }],
      workflow_id: 1,
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      head_sha: "old",
    },
    dispatched: [],
    merged: [],
    updated: [],
    rerun: false,
    comments: [],
    childConclusion: "success",
  };
  const context = {
    repo: { owner: "owner", repo: "repo" },
    eventName: "workflow_run",
    payload: { workflow_run: { id: 10, pull_requests: [{ number: 27 }] } },
  };
  const github = {
    paginate: async (method, args) => {
      const { data } = await method(args);
      return data.workflow_runs ?? data;
    },
    rest: {
      repos: {
        compareCommits: async () => ({
          data: {
            base_commit: { sha: state.mainSha },
            behind_by: state.behindBy,
          },
        }),
      },
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
        listWorkflowRuns: async () => ({
          data: { workflow_runs: [structuredClone(state.run)] },
        }),
        reRunWorkflow: async () => {
          state.rerun = true;
        },
        getWorkflowRun: async () => ({
          data: state.rerun
            ? {
                ...state.run,
                run_attempt: 2,
                conclusion: state.childConclusion,
              }
            : structuredClone(state.run),
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
        await state.onSleep();
      },
    });
  return { state, context, github, execute };
}

function completeUpdate(s, sha = "updated") {
  s.state.pr.head.sha = sha;
  s.state.pr.mergeable = true;
  s.state.pr.mergeable_state = "clean";
  s.state.behindBy = 0;
  s.state.rerun = false;
  s.state.run = { ...s.state.run, id: s.state.run.id + 1, head_sha: sha };
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

test("古いPRはリベース後のPR検証が成功するまでキューを保持してマージする", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  s.state.behindBy = 1;
  s.state.onSleep = () => {
    if (s.state.comments.length && s.state.pr.head.sha === "old")
      completeUpdate(s);
  };
  await s.execute();
  assert.deepEqual(s.state.updated, []);
  assert.deepEqual(s.state.merged, ["updated"]);
  assert.equal(s.state.rerun, false);
  assert.deepEqual(s.state.comments, [
    "@dependabot rebase\n\n<!-- dependabot-rebase:old:base -->",
  ]);
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

test("再実行したPR検証の失敗ではマージもmain検証も実行しない", async () => {
  const s = scenario();
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  s.state.childConclusion = "failure";
  await assert.rejects(s.execute(), /Verify 10: failure/);
  assert.deepEqual(s.state.merged, []);
  assert.equal(s.state.dispatched.length, 0);
});

test("検証中にPRのheadが変わった場合は停止する", async () => {
  const s = scenario();
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  const getRun = s.github.rest.actions.getWorkflowRun;
  s.github.rest.actions.getWorkflowRun = async (args) => {
    const result = await getRun(args);
    if (s.state.rerun) s.state.pr.head.sha = "someone-else";
    return result;
  };
  await s.execute();
  assert.deepEqual(s.state.merged, []);
});

test("別SHAのPR再検証は成功しても受け入れない", async () => {
  const s = scenario();
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  const getRun = s.github.rest.actions.getWorkflowRun;
  s.github.rest.actions.getWorkflowRun = async (args) => {
    const result = await getRun(args);
    if (s.state.rerun) result.data.head_sha = "wrong";
    return result;
  };
  await assert.rejects(s.execute(), /does not match/);
  assert.deepEqual(s.state.merged, []);
});

test("マージ直前のmain更新で405となっても更新後の検証までやり直す", async () => {
  const s = scenario();
  const merge = s.github.rest.pulls.merge;
  s.github.rest.pulls.merge = async (args) => {
    if (args.sha === "old") {
      // GitHubのPR状態がcleanのままでもmainの前進を検出する。
      s.state.mainSha = "new-base";
      s.state.behindBy = 1;
      throw Object.assign(new Error("Required verify"), { status: 405 });
    }
    return merge(args);
  };
  s.state.onSleep = () => {
    if (s.state.comments.length && s.state.pr.head.sha === "old")
      completeUpdate(s);
  };
  await s.execute();
  assert.deepEqual(s.state.merged, ["updated"]);
  assert.equal(s.state.comments.length, 1);
  assert.match(s.state.comments[0], /old:new-base/);
});

test("競合時は同じSHAにつき一度だけDependabotへ再作成を依頼する", async () => {
  const conflict = scenario();
  conflict.state.pr.mergeable = false;
  await assert.rejects(conflict.execute(), /timed out/);
  await assert.rejects(conflict.execute(), /timed out/);
  assert.deepEqual(conflict.state.comments, [
    "@dependabot recreate\n\n<!-- dependabot-recreate:old:base -->",
  ]);
  assert.deepEqual(conflict.state.merged, []);
});

test("更新後のPR検証がまだ作られていない場合は古い実行を使わず待つ", async () => {
  const s = scenario();
  s.state.behindBy = 1;
  const listRuns = s.github.rest.actions.listWorkflowRuns;
  let lists = 0;
  s.github.rest.actions.listWorkflowRuns = async () => {
    lists++;
    return lists === 1 ? { data: { workflow_runs: [] } } : listRuns();
  };
  s.state.onSleep = () => {
    if (s.state.comments.length && s.state.pr.head.sha === "old")
      completeUpdate(s);
  };
  await s.execute();
  assert.ok(lists >= 2);
  assert.deepEqual(s.state.merged, ["updated"]);
});

test("更新後のPR検証に失敗した場合はキューを解放しマージしない", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  s.state.behindBy = 1;
  s.state.onSleep = () => {
    if (s.state.pr.head.sha !== "old") return;
    completeUpdate(s);
    s.state.run.conclusion = "failure";
  };
  await assert.rejects(s.execute(), /Verify 11: failure/);
  assert.deepEqual(s.state.merged, []);
  assert.deepEqual(s.state.dispatched, []);
  assert.equal(s.state.rerun, false);
});

test("更新後の検証中にmainが再び進んだ場合も最新mainまで追従する", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  s.state.behindBy = 1;
  s.state.onSleep = () => {
    if (s.state.pr.head.sha === "old") completeUpdate(s, "first");
    else if (s.state.comments.length === 2 && s.state.pr.head.sha === "first")
      completeUpdate(s, "second");
  };
  const getRun = s.github.rest.actions.getWorkflowRun;
  s.github.rest.actions.getWorkflowRun = async (args) => {
    const result = await getRun(args);
    if (args.run_id === 11) {
      s.state.mainSha = "new-base";
      s.state.behindBy = 1;
    }
    return result;
  };
  await s.execute();
  assert.deepEqual(s.state.merged, ["second"]);
  assert.equal(s.state.comments.length, 2);
  assert.match(s.state.comments[1], /first:new-base/);
});

test("PR状態がbehindのままでも最新mainを含むheadは不要な更新を依頼しない", async () => {
  const s = scenario();
  s.state.pr.mergeable_state = "behind";
  await s.execute();
  assert.deepEqual(s.state.comments, []);
  assert.deepEqual(s.state.merged, ["old"]);
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

test("未マージPRの手動復旧ではPR検証を再実行してマージする", async () => {
  const s = scenario();
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  await s.execute();
  assert.equal(s.state.rerun, true);
  assert.deepEqual(
    s.state.dispatched.map((run) => run.ref),
    ["main"],
  );
  assert.deepEqual(s.state.merged, ["old"]);
});

test("実行中のPR検証は二重起動せず完了を待つ", async () => {
  const s = scenario();
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  s.state.run.status = "in_progress";
  s.github.rest.actions.getWorkflowRun = async () => ({
    data: { ...s.state.run, status: "completed" },
  });
  await s.execute();
  assert.equal(s.state.rerun, false);
  assert.deepEqual(s.state.merged, ["old"]);
});

test("手動復旧ではworkflow_dispatch・別PR・古いSHAの検証を使わない", async () => {
  for (const change of [
    (run) => {
      run.event = "workflow_dispatch";
    },
    (run) => {
      run.pull_requests = [{ number: 99 }];
    },
    (run) => {
      run.head_sha = "stale";
    },
  ]) {
    const s = scenario();
    s.context.eventName = "workflow_dispatch";
    s.context.payload = { inputs: { pr_number: "27" } };
    change(s.state.run);
    await assert.rejects(s.execute(), /No PR Verify/);
    assert.deepEqual(s.state.merged, []);
  }
});

test("再実行前の成功を再実行完了と取り違えない", async () => {
  const s = scenario();
  s.context.eventName = "workflow_dispatch";
  s.context.payload = { inputs: { pr_number: "27" } };
  s.github.rest.actions.getWorkflowRun = async () => ({ data: s.state.run });
  await assert.rejects(s.execute(), /timed out/);
  assert.deepEqual(s.state.merged, []);
});
