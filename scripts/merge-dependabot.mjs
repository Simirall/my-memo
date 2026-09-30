import { setTimeout } from "node:timers/promises";

export default async function mergeDependabot({
  github,
  context,
  core,
  sleep = setTimeout,
  now = Date.now,
}) {
  const repo = context.repo;
  const trigger = context.payload.workflow_run;
  const manual = context.eventName === "workflow_dispatch";
  const numbers = trigger?.pull_requests?.map((pr) => pr.number) ?? [];
  const number = manual
    ? Number(context.payload.inputs?.pr_number)
    : numbers.length === 1
      ? numbers[0]
      : null;
  if (!Number.isSafeInteger(number) || number < 1) return;
  const args = { ...repo, pull_number: number };
  const getPr = async () => (await github.rest.pulls.get(args)).data;
  const eligible = (pr) =>
    pr.user.login === "dependabot[bot]" &&
    pr.base.ref === "main" &&
    pr.head.repo?.full_name === `${repo.owner}/${repo.repo}` &&
    !pr.draft;
  let pr = await getPr();
  if (!eligible(pr)) return;

  const dispatch = async (ref) => {
    const { data } = await github.rest.actions.createWorkflowDispatch({
      ...repo,
      workflow_id: "verify.yml",
      ref,
      // このAPIバージョンでは起動したrun IDが返る。別実行との取り違えを防ぐ。
      headers: { "X-GitHub-Api-Version": "2026-03-10" },
    });
    if (!Number.isSafeInteger(data?.workflow_run_id)) {
      throw new Error("Verify dispatch did not return a run ID.");
    }
    core.info(`Verify: ${data.html_url}`);
    return data.workflow_run_id;
  };
  if (pr.state !== "open") {
    if (pr.merged && manual) await dispatch("main");
    return;
  }

  const { data: workflow } = await github.rest.actions.getWorkflow({
    ...repo,
    workflow_id: "verify.yml",
  });
  let verifiedSha = null;
  if (!manual) {
    const { data: run } = await github.rest.actions.getWorkflowRun({
      ...repo,
      run_id: trigger.id,
    });
    if (
      run.workflow_id !== workflow.id ||
      run.event !== "pull_request" ||
      run.status !== "completed" ||
      run.conclusion !== "success" ||
      run.head_sha !== pr.head.sha
    )
      return;
    verifiedSha = run.head_sha;
  }
  const expectedSha = pr.head.sha;
  const deadline = now() + 50 * 60 * 1000;
  const pause = async () => {
    if (now() >= deadline)
      throw new Error("Dependabot verification timed out.");
    await sleep(15000);
  };

  while (now() < deadline) {
    pr = await getPr();
    if (!eligible(pr) || pr.state !== "open" || pr.head.sha !== expectedSha) {
      core.info(`PR #${number} changed or closed; stopping.`);
      return;
    }
    if (pr.mergeable == null) {
      await pause();
      continue;
    }
    if (!pr.mergeable || pr.mergeable_state === "behind") {
      const command = pr.mergeable ? "rebase" : "recreate";
      const marker = `<!-- dependabot-${command}:${expectedSha}:${pr.base.sha} -->`;
      const comments = await github.paginate(github.rest.issues.listComments, {
        ...repo,
        issue_number: number,
        per_page: 100,
      });
      if (!comments.some((comment) => comment.body?.includes(marker))) {
        await github.rest.issues.createComment({
          ...repo,
          issue_number: number,
          body: `@dependabot ${command}\n\n${marker}`,
        });
      }
      core.info(
        `PR #${number}: requested ${command}; waiting for a new PR Verify.`,
      );
      return;
    }
    if (verifiedSha !== expectedSha) {
      // workflow_dispatchのチェックはRulesetを満たさない。元のPR実行を再実行する。
      const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...repo,
        workflow_id: workflow.id,
        event: "pull_request",
        head_sha: expectedSha,
        per_page: 100,
      });
      const previous = runs
        .filter(
          (run) =>
            run.head_sha === expectedSha &&
            run.event === "pull_request" &&
            run.pull_requests?.some((pull) => pull.number === number),
        )
        .sort((a, b) => b.run_number - a.run_number)[0];
      if (!previous)
        throw new Error("No PR Verify found for the current commit.");
      const runId = previous.id;
      let attempt = previous.run_attempt;
      if (previous.status === "completed") {
        await github.rest.actions.reRunWorkflow({ ...repo, run_id: runId });
        attempt++;
      }
      while (true) {
        await pause();
        pr = await getPr();
        if (!eligible(pr) || pr.state !== "open" || pr.head.sha !== expectedSha)
          return;
        const { data: run } = await github.rest.actions.getWorkflowRun({
          ...repo,
          run_id: runId,
        });
        if (
          run.workflow_id !== workflow.id ||
          run.event !== "pull_request" ||
          run.head_sha !== expectedSha ||
          !run.pull_requests?.some((pull) => pull.number === number)
        ) {
          throw new Error("PR Verify does not match the expected PR commit.");
        }
        if (run.run_attempt < attempt || run.status !== "completed") continue;
        if (run.conclusion !== "success")
          throw new Error(`Verify ${runId}: ${run.conclusion}`);
        verifiedSha = expectedSha;
        break;
      }
      // テスト中のhead変更とmainの前進を再確認する。
      continue;
    }
    try {
      const { data } = await github.rest.pulls.merge({
        ...args,
        merge_method: "squash",
        sha: verifiedSha,
      });
      if (!data.merged) throw new Error(data.message || "PR was not merged.");
    } catch (error) {
      // 並行PRのマージでmainが進んだ場合だけ、更新・再検証へ戻る。
      if (error.status === 405 && (await getPr()).mergeable_state === "behind")
        continue;
      throw error;
    }
    await dispatch("main");
    return;
  }
  throw new Error("Dependabot verification timed out.");
}
