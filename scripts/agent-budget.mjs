#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const WORKFLOW_FILE = "opencode.yml";
const COMMENT_EVENTS = new Set(["issue_comment", "pull_request_review_comment"]);

/**
 * Counts admitted agent runs for one pull request.
 *
 * A run is admitted when the model job started (its conclusion is not
 * `skipped`). A run cancelled after the budget job succeeded but before the
 * model job started also consumes an attempt. Runs skipped by the trusted
 * author/command filter and runs blocked by the limit do not.
 */
export function evaluateBudget({ runs, jobsByRunId, prNumber, currentRunId, maxRuns }) {
  const expectedTitle = `opencode #${prNumber}`;
  let count = 0;

  for (const run of runs) {
    if (String(run.id) === String(currentRunId)) continue;
    if (run.displayTitle !== expectedTitle) continue;
    if (!COMMENT_EVENTS.has(run.event)) continue;

    const jobs = jobsByRunId[run.id] ?? [];
    const modelStarted = jobs.some(
      (job) => job.name === "opencode" && job.conclusion !== "skipped",
    );
    const cancelledBeforeModel =
      run.conclusion === "cancelled" &&
      jobs.some((job) => job.name === "budget" && job.conclusion === "success") &&
      !modelStarted;

    if (!modelStarted && !cancelledBeforeModel) continue;

    count += Math.max(1, Number(run.runAttempt) || 1);
  }

  return {
    count,
    allowed: count < maxRuns,
    reason: count < maxRuns ? "" : "limit_exhausted",
  };
}

/**
 * The Actions REST API returns snake_case, while evaluateBudget uses a small
 * camelCase shape. Normalise once so the tests can exercise both.
 */
export function normalizeRun(run) {
  return {
    id: run.id,
    displayTitle: run.display_title ?? run.displayTitle ?? "",
    event: run.event,
    runAttempt: run.run_attempt ?? run.runAttempt ?? 1,
    conclusion: run.conclusion,
  };
}

function ghJson(args) {
  const output = execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return JSON.parse(output);
}

/** Fetches the workflow history and the jobs of each candidate run. */
export function collectBudget({ repo, prNumber, currentRunId, maxRuns, exec = ghJson }) {
  const pages = exec([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=100`,
  ]);

  const runs = pages.flatMap((page) => page.workflow_runs ?? []).map(normalizeRun);
  const expectedTitle = `opencode #${prNumber}`;
  const candidates = runs.filter(
    (run) =>
      String(run.id) !== String(currentRunId) &&
      run.displayTitle === expectedTitle &&
      COMMENT_EVENTS.has(run.event),
  );

  const jobsByRunId = {};
  for (const run of candidates) {
    const payload = exec(["api", `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`]);
    jobsByRunId[run.id] = payload.jobs ?? [];
  }

  return evaluateBudget({
    runs: candidates,
    jobsByRunId,
    prNumber,
    currentRunId,
    maxRuns,
  });
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--")) continue;

    const key = flag.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${flag}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo;
  const prNumber = args.pr;
  const currentRunId = args["current-run"];
  const maxRuns = Number(args.max);

  if (!repo || !prNumber || !currentRunId || !Number.isFinite(maxRuns)) {
    throw new Error(
      "usage: agent-budget.mjs --repo <owner/name> --pr <n> --current-run <id> --max <n>",
    );
  }

  const result = collectBudget({ repo, prNumber, currentRunId, maxRuns });

  console.log(`allowed=${result.allowed}`);
  console.log(`reason=${result.reason}`);
  console.log(`count=${result.count}`);
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`agent-budget: ${error instanceof Error ? error.message : String(error)}`);
    console.log("allowed=false");
    console.log("reason=infra");
    console.log("count=0");
  }
}
