import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const workflowPath = ".github/workflows/scheduled-audit.yml";
const agentPath = ".opencode/agents/lighthouse-auditor.md";
const configPath = ".opencode/audit.json";
const errors = [];

function read(file) {
  try {
    return readFileSync(resolve(root, file), "utf8");
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return "";
  }
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

const workflow = read(workflowPath);
const agent = read(agentPath);
const auditConfig = (() => {
  try {
    return JSON.parse(read(configPath));
  } catch {
    return null;
  }
})();

check(
  /^name:\s*scheduled-audit\s*$/m.test(workflow),
  `${workflowPath}: name должен быть scheduled-audit`,
);
check(/^on:\s*$/m.test(workflow), `${workflowPath}: нет блока on`);
check(/^\s{2}schedule:\s*$/m.test(workflow), `${workflowPath}: нет schedule`);
check(/^\s{2}workflow_dispatch:\s*$/m.test(workflow), `${workflowPath}: нет workflow_dispatch`);

const cron = workflow.match(/^\s*-\s*cron:\s*["']?([^"'\n]+?)["']?\s*$/m);
if (!cron) {
  errors.push(`${workflowPath}: нет cron из пяти полей`);
} else {
  const fields = cron[1].trim().split(/\s+/);
  check(
    fields.length === 5,
    `${workflowPath}: cron должен содержать 5 полей, получено ${fields.length}`,
  );
  if (fields.length === 5) {
    const [minute, hour] = fields;
    check(
      !/[*,\-/]/.test(minute) && !/[*,\-/]/.test(hour),
      `${workflowPath}: расписание должно быть не чаще раза в сутки: минута и час — фиксированные числа`,
    );
  }
}

check(
  /^\s*timezone:\s*["']?Europe\/Moscow["']?\s*(?:#.*)?$/m.test(workflow),
  `${workflowPath}: рядом с cron нужен timezone: Europe/Moscow`,
);
check(
  /^permissions:\s*\{\}\s*$/m.test(workflow),
  `${workflowPath}: на уровне workflow нужен permissions: {}`,
);

const timeout = workflow.match(/^\s*timeout-minutes:\s*([0-9]+)\s*$/m);
check(Boolean(timeout), `${workflowPath}: нет timeout-minutes`);
if (timeout) {
  check(
    Number(timeout[1]) > 0 && Number(timeout[1]) <= 60,
    `${workflowPath}: timeout-minutes должен быть 1..60`,
  );
}

check(/^\s*concurrency:\s*$/m.test(workflow), `${workflowPath}: нет concurrency`);
check(
  /^\s*group:\s*lighthouse-audit\s*$/m.test(workflow),
  `${workflowPath}: concurrency.group должен быть lighthouse-audit`,
);
check(
  /^\s*cancel-in-progress:\s*false\s*$/m.test(workflow),
  `${workflowPath}: cancel-in-progress должен быть false: параллельные аудиты ждут друг друга`,
);

check(
  /^\s*contents:\s*read\s*(?:#.*)?$/m.test(workflow),
  `${workflowPath}: job должен иметь contents: read`,
);
check(
  /^\s*id-token:\s*write\s*(?:#.*)?$/m.test(workflow),
  `${workflowPath}: нужен id-token: write для OIDC`,
);
check(
  /^\s*issues:\s*write\s*(?:#.*)?$/m.test(workflow),
  `${workflowPath}: job должен иметь issues: write`,
);
check(
  !/^\s*contents:\s*write\s*$/m.test(workflow),
  `${workflowPath}: contents: write не нужен — агент не меняет код`,
);
check(
  !/^\s*pull-requests:\s*write\s*$/m.test(workflow),
  `${workflowPath}: pull-requests: write не нужен — агент не открывает PR`,
);
check(
  /^\s*persist-credentials:\s*false\s*$/m.test(workflow),
  `${workflowPath}: checkout должен быть с persist-credentials: false`,
);
check(
  /opencode\/github@[0-9a-f]{40}\b/.test(workflow),
  `${workflowPath}: действие OpenCode должно быть закреплено по SHA`,
);
check(
  /OPENCODE_CONFIG:\s*\$\{\{\s*github\.workspace\s*\}\}\/\.opencode\/audit\.json/.test(workflow),
  `${workflowPath}: агент аудита должен выбираться через OPENCODE_CONFIG=.opencode/audit.json`,
);
check(/^\s*prompt:\s*\|/m.test(workflow), `${workflowPath}: у агента должен быть prompt`);
check(
  /^\s*retention-days:\s*[0-9]+\s*$/m.test(workflow),
  `${workflowPath}: у артефакта должен быть retention-days`,
);
check(!/pull_request_target/.test(workflow), `${workflowPath}: pull_request_target запрещён`);

check(
  auditConfig?.default_agent === "lighthouse-auditor",
  `${configPath}: default_agent должен быть lighthouse-auditor`,
);
check(/^mode:\s*primary\s*$/m.test(agent), `${agentPath}: mode должен быть primary`);
check(/^permission:\s*$/m.test(agent), `${agentPath}: нужен блок permission (формат OpenCode V1)`);
check(/^\s{2}edit:\s*deny\s*$/m.test(agent), `${agentPath}: edit должен быть запрещён`);
check(
  /^\s{2}external_directory:\s*allow\s*$/m.test(agent),
  `${agentPath}: нужен external_directory: allow для чтения отчёта`,
);
check(
  /"gh issue create \*":\s*allow/.test(agent),
  `${agentPath}: gh issue create должен быть разрешён`,
);

if (errors.length > 0) {
  process.stderr.write(
    `audit config check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write("audit config check passed\n");
}
