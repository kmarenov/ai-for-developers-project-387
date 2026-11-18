import assert from "node:assert/strict";
import test from "node:test";

import { collectBudget, evaluateBudget } from "./agent-budget.mjs";

const PR = 15;
const CURRENT_RUN = 999;
const MAX_RUNS = 3;

function run(id, overrides = {}) {
  return {
    id,
    displayTitle: `opencode #${PR}`,
    event: "issue_comment",
    runAttempt: 1,
    conclusion: "success",
    ...overrides,
  };
}

function jobs({ model = "success", budget = "success" } = {}) {
  return [
    { name: "budget", conclusion: budget },
    { name: "opencode", conclusion: model },
  ];
}

function evaluate(runs, jobsByRunId) {
  return evaluateBudget({
    runs,
    jobsByRunId,
    prNumber: PR,
    currentRunId: CURRENT_RUN,
    maxRuns: MAX_RUNS,
  });
}

test("no admitted runs: allowed", () => {
  assert.deepEqual(evaluate([], {}), {
    count: 0,
    allowed: true,
    reason: "",
  });
});

test("three admitted runs block the next request", () => {
  const runs = [run(1), run(2), run(3)];

  assert.deepEqual(
    evaluate(runs, {
      1: jobs(),
      2: jobs(),
      3: jobs(),
    }),
    { count: 3, allowed: false, reason: "limit_exhausted" },
  );
});

test("runs skipped by the trusted author or command filter do not count", () => {
  const runs = [run(1), run(2)];
  const jobsByRunId = {
    1: jobs({ model: "skipped" }),
    2: jobs({ model: "skipped" }),
  };

  assert.equal(evaluate(runs, jobsByRunId).count, 0);
});

test("runs blocked by the limit do not count themselves", () => {
  const runs = [run(1), run(2)];
  const jobsByRunId = {
    1: jobs(),
    2: jobs({ model: "skipped" }),
  };

  assert.deepEqual(evaluate(runs, jobsByRunId), {
    count: 1,
    allowed: true,
    reason: "",
  });
});

test("a cancelled run after the budget job still consumes an attempt", () => {
  const runs = [run(1, { conclusion: "cancelled" })];
  const jobsByRunId = {
    1: jobs({ model: "skipped" }),
  };

  assert.equal(evaluate(runs, jobsByRunId).count, 1);
});

test("re-run attempts count separately", () => {
  const runs = [run(1, { runAttempt: 2 })];

  assert.equal(evaluate(runs, { 1: jobs() }).count, 2);
});

test("other pull requests and issue events do not count", () => {
  const runs = [run(1, { displayTitle: "opencode #16" }), run(2, { event: "issues" }), run(3)];

  assert.equal(
    evaluate(runs, {
      1: jobs(),
      2: jobs(),
      3: jobs(),
    }).count,
    1,
  );
});

test("the current run does not count itself", () => {
  const runs = [run(CURRENT_RUN)];

  assert.equal(evaluate(runs, { [CURRENT_RUN]: jobs() }).count, 0);
});

test("collectBudget fetches jobs only for matching runs", () => {
  const calls = [];
  const exec = (args) => {
    calls.push(args);

    if (args.includes("--slurp")) {
      return [
        {
          workflow_runs: [run(1), run(2, { displayTitle: "opencode #16" }), run(CURRENT_RUN)],
        },
      ];
    }

    if (args.some((arg) => arg.includes("/runs/1/jobs"))) {
      return { jobs: jobs() };
    }

    throw new Error(`unexpected gh call: ${args.join(" ")}`);
  };

  const result = collectBudget({
    repo: "kmarenov/ai-for-developers-project-387",
    prNumber: PR,
    currentRunId: CURRENT_RUN,
    maxRuns: MAX_RUNS,
    exec,
  });

  assert.deepEqual(result, { count: 1, allowed: true, reason: "" });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].some((arg) => arg.includes("/runs/1/jobs")));
});
