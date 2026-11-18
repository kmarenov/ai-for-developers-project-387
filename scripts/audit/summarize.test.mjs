import assert from "node:assert/strict";
import test from "node:test";

import { collectCandidates, renderReport, summarize } from "./summarize.mjs";

function audit(id, overrides = {}) {
  return {
    id,
    title: id,
    description: "",
    score: 0,
    scoreDisplayMode: "numeric",
    ...overrides,
  };
}

function report(overrides = {}) {
  return {
    lighthouseVersion: "13.6.0",
    requestedUrl: "https://example.test/",
    finalUrl: "https://example.test/",
    fetchTime: "2026-11-18T00:00:00.000Z",
    categories: {
      performance: {
        id: "performance",
        title: "Performance",
        score: 0.42,
        auditRefs: [
          { id: "largest-contentful-paint", weight: 25 },
          { id: "first-contentful-paint", weight: 10 },
          { id: "unused-javascript", weight: 0 },
        ],
      },
      accessibility: {
        id: "accessibility",
        title: "Accessibility",
        score: 0.9,
        auditRefs: [
          { id: "color-contrast", weight: 1 },
          { id: "image-alt", weight: 1 },
        ],
      },
    },
    audits: {
      "largest-contentful-paint": audit("largest-contentful-paint", {
        title: "Largest Contentful Paint",
        description: "LCP measures when the largest element is painted.",
        score: 0.1,
        displayValue: "6.8 s",
        numericValue: 6800,
      }),
      "first-contentful-paint": audit("first-contentful-paint", {
        title: "First Contentful Paint",
        score: 0.8,
        displayValue: "2.1 s",
        numericValue: 2100,
      }),
      "unused-javascript": audit("unused-javascript", {
        title: "Reduce unused JavaScript",
        score: 0.2,
      }),
      "color-contrast": audit("color-contrast", {
        title: "Background and foreground colors",
        score: 0,
        scoreDisplayMode: "binary",
      }),
      "image-alt": audit("image-alt", {
        title: "Image elements have alt text",
        score: 1,
        scoreDisplayMode: "binary",
      }),
      "manual-check": audit("manual-check", {
        title: "Manual check",
        score: null,
        scoreDisplayMode: "manual",
      }),
    },
    ...overrides,
  };
}

test("candidates come from weighted failing audits, performance first", () => {
  const candidates = collectCandidates(report());

  assert.deepEqual(
    candidates.map((candidate) => candidate.key),
    [
      "lighthouse:largest-contentful-paint",
      "lighthouse:first-contentful-paint",
      "lighthouse:color-contrast",
    ],
  );
  assert.equal(candidates[0].displayValue, "6.8 s");
  assert.equal(candidates[2].displayValue, "не выполнено");
});

test("report exposes stable Audit key lines for the agent", () => {
  const text = renderReport(report(), collectCandidates(report()));

  assert.match(text, /Audit key: `lighthouse:largest-contentful-paint`/);
  assert.match(text, /\| Performance \| 42 \|/);
  assert.doesNotMatch(text, /unused-javascript/);
});

test("a clean report has no candidates", () => {
  const clean = report({
    categories: {
      performance: {
        id: "performance",
        title: "Performance",
        score: 0.99,
        auditRefs: [{ id: "largest-contentful-paint", weight: 25 }],
      },
    },
    audits: {
      "largest-contentful-paint": audit("largest-contentful-paint", {
        score: 0.95,
        displayValue: "1.8 s",
      }),
    },
  });

  const result = summarize(clean);

  assert.equal(result.candidates.length, 0);
  assert.match(result.report, /Кандидатов нет/);
  assert.deepEqual(result.findings.candidates, []);
});

test("a non-Lighthouse JSON is rejected", () => {
  assert.throws(() => summarize({}), /не JSON-отчёт Lighthouse/);
});
