#!/usr/bin/env node
// Сжимает JSON-отчёт Lighthouse в читаемую сводку и список кандидатов в находки.
// Ключ находки (`lighthouse:<audit id>`) стабилен между прогонами: по нему агент
// ищет уже существующую задачу и не создаёт дубликат.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CATEGORY_IDS = ["performance", "accessibility", "best-practices", "seo"];
const SCORE_THRESHOLD = 0.9;
const MAX_CANDIDATES = 5;
const MAX_DESCRIPTION = 240;

function normalizeDescription(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DESCRIPTION);
}

function scoreText(score) {
  if (typeof score !== "number") return "n/a";
  return String(Math.round(score * 100));
}

function candidateValue(audit) {
  if (audit.displayValue) return audit.displayValue;
  if (audit.scoreDisplayMode === "binary") return "не выполнено";
  return `${scoreText(audit.score)}/100`;
}

function collectCandidates(report) {
  const seen = new Set();
  const candidates = [];

  for (const categoryId of CATEGORY_IDS) {
    const refs = report.categories?.[categoryId]?.auditRefs;
    if (!Array.isArray(refs)) continue;

    const fromCategory = [];
    for (const ref of refs) {
      if (!ref?.id || !ref.weight) continue;
      if (seen.has(ref.id)) continue;

      const audit = report.audits?.[ref.id];
      if (!audit) continue;
      if (!["numeric", "binary"].includes(audit.scoreDisplayMode)) continue;
      if (typeof audit.score !== "number" || audit.score >= SCORE_THRESHOLD) continue;

      seen.add(ref.id);
      fromCategory.push({
        key: `lighthouse:${ref.id}`,
        id: ref.id,
        category: categoryId,
        title: audit.title || ref.id,
        score: audit.score,
        weight: ref.weight,
        displayValue: candidateValue(audit),
        description: normalizeDescription(audit.description),
        numericValue: typeof audit.numericValue === "number" ? audit.numericValue : null,
      });
    }

    fromCategory.sort(
      (a, b) => a.score - b.score || b.weight - a.weight || a.id.localeCompare(b.id),
    );
    candidates.push(...fromCategory);
  }

  return candidates.slice(0, MAX_CANDIDATES);
}

function renderReport(report, candidates) {
  const lines = [
    "# Сводка Lighthouse",
    "",
    `- Запрошенный URL: ${report.requestedUrl || "n/a"}`,
    `- Итоговый URL: ${report.finalUrl || "n/a"}`,
    `- Версия Lighthouse: ${report.lighthouseVersion || "n/a"}`,
    `- Время отчёта: ${report.fetchTime || "n/a"}`,
    "",
    "## Оценки",
    "",
    "| Категория | Оценка |",
    "| :--- | ---: |",
  ];

  for (const categoryId of CATEGORY_IDS) {
    const category = report.categories?.[categoryId];
    if (!category) continue;
    lines.push(`| ${category.title || categoryId} | ${scoreText(category.score)} |`);
  }

  lines.push("", "## Кандидаты в находки", "");

  if (candidates.length === 0) {
    lines.push("Кандидатов нет: все оценки не ниже порога 0.9.");
  } else {
    for (const candidate of candidates) {
      lines.push(`### ${candidate.title}`, "");
      lines.push(`- Audit key: \`${candidate.key}\``);
      lines.push(`- Категория: ${candidate.category}`);
      lines.push(`- Оценка: ${scoreText(candidate.score)}/100`);
      lines.push(`- Значение: ${candidate.displayValue}`);
      if (candidate.description) lines.push(`- Описание: ${candidate.description}`);
      lines.push("");
    }
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function buildFindings(report, candidates) {
  return {
    url: report.requestedUrl || null,
    finalUrl: report.finalUrl || null,
    fetchTime: report.fetchTime || null,
    lighthouseVersion: report.lighthouseVersion || null,
    categories: Object.fromEntries(
      CATEGORY_IDS.flatMap((id) => {
        const category = report.categories?.[id];
        return category ? [[id, { title: category.title, score: category.score }]] : [];
      }),
    ),
    candidates,
  };
}

function parseArgs(argv) {
  const args = { input: undefined, outDir: "audit" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out-dir") {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--out-dir=")) {
      args.outDir = arg.slice("--out-dir=".length);
    } else if (!args.input) {
      args.input = arg;
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }
  if (!args.input) {
    throw new Error(
      "Использование: node scripts/audit/summarize.mjs <lighthouse-report.json> [--out-dir <dir>]",
    );
  }
  return args;
}

function summarize(report) {
  if (!report || typeof report !== "object" || !report.audits || !report.categories) {
    throw new Error("Это не JSON-отчёт Lighthouse: нет audits/categories");
  }
  const candidates = collectCandidates(report);
  return {
    candidates,
    report: renderReport(report, candidates),
    findings: buildFindings(report, candidates),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(readFileSync(resolve(args.input), "utf8"));
  const result = summarize(report);

  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });
  const reportPath = resolve(outDir, "report.md");
  const findingsPath = resolve(outDir, "findings.json");
  writeFileSync(reportPath, result.report);
  writeFileSync(findingsPath, `${JSON.stringify(result.findings, null, 2)}\n`);

  process.stdout.write(`report: ${reportPath}\n`);
  process.stdout.write(`findings: ${findingsPath} (${result.candidates.length})\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export { collectCandidates, renderReport, summarize };
