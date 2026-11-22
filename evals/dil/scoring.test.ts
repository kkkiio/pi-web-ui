import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";
import { chromium } from "@playwright/test";
import { DIL_CASES } from "./cases.ts";
import { IDEAL_ANSWERS } from "./ideal.ts";
import { DilEvalScorer } from "./render-scoring.ts";
import { type DilCase, scoreCase } from "./scoring.ts";
import { assessSvgLayout } from "./svg-judge.ts";

const example: DilCase = {
  id: "diagram",
  category: "Flow",
  prompt: "Show two states and their relation.",
  why: "A diagram makes the relationship visible.",
  checks: [
    { id: "labeledConcepts", atLeast: 2 },
    { id: "visibleConnections" },
    { id: "flowDirection" },
    { id: "colorDistinction" },
  ],
};

test("parser diagnostics fail on a malformed DIL answer", () => {
  const result = scoreCase(example, "<box gap={2}>\n  <row>\n    <badge color=");
  assert.equal(result.checks[0].id, "parseClean");
  assert.equal(result.checks[0].pass, false);
});

test("SVG text bounds and readability can pass or fail independently", async () => {
  for (const verdict of [
    {
      svgTextWithinBoxes: { pass: true, reason: "文字均在方框内。" },
      svgTextReadability: { pass: false, reason: "Worker 框里的深色文字在黑底上难以辨认。" },
    },
    {
      svgTextWithinBoxes: { pass: true, reason: "文字均在方框内。" },
      svgTextReadability: { pass: false, reason: "框内各行间距不足，难以辨认。" },
    },
    {
      svgTextWithinBoxes: { pass: false, reason: "待处理标签有几个字伸出方框。" },
      svgTextReadability: { pass: true, reason: "节点和各行文字间距清楚。" },
    },
  ]) {
    const checks = await assessSvgLayout(example.prompt, async () => JSON.stringify(verdict));
    assert.deepEqual(
      checks.map(({ id, pass }) => [id, pass]),
      [
        ["svgTextWithinBoxes", verdict.svgTextWithinBoxes.pass],
        ["svgTextReadability", verdict.svgTextReadability.pass],
      ],
    );
  }
});

const scorer = new DilEvalScorer("");
after(() => scorer.close());
const skip = existsSync(chromium.executablePath()) ? false : "Playwright Chromium is unavailable";

test("the reference answers pass when rendered and the quiz sends each selected answer", { skip }, async () => {
  for (const scenario of DIL_CASES) {
    const result = await scorer.score(scenario, IDEAL_ANSWERS[scenario.id], undefined, null);
    const missed = result.checks.filter(({ pass }) => pass !== true);
    assert.deepEqual(missed, [], scenario.id);
  }
});

const svg = `<svg viewBox="0 0 250 60">
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0 0 L8 4 L0 8 Z" fill="currentColor"/>
  </marker></defs>
  <g transform="translate(5 10)">
    <rect width="70" height="40" fill="#bfdbfe"/>
    <text x="13" y="25">待处理</text>
  </g>
  <line x1="75" y1="30" x2="163" y2="30" stroke="currentColor" markerEnd="url(#arrow)"/>
  <rect x="165" y="10" width="80" height="40" fill="#fecaca"/>
  <text x="176" y="35">已完成</text>
</svg>`;

test("a DIL layout and an SVG diagram satisfy the same flow and color checks", { skip }, async () => {
  const box = `<row align="center" gap={3}>
    <box padding={2} background="#bfdbfe"><text>待处理</text></box>
    <icon name="arrow-right"/>
    <box padding={2} background="#fecaca"><text>已完成</text></box>
  </row>`;
  for (const source of [box, svg]) {
    const result = await scorer.score(example, source, undefined, null);
    assert.deepEqual(
      result.checks.filter(({ pass }) => pass === false),
      [],
    );
    assert.equal(result.score, 100);
    assert.equal(result.unscored, source === svg ? 2 : 0);
  }
});

test("proportion bars in repeated rows can distinguish components by color", { skip }, async () => {
  const scenario = DIL_CASES.find(({ id }) => id === "pi-system-prompt-construct");
  assert.ok(scenario);
  const chart = `<box border gap={2}>
  <row align="center" gap={2}>
    <text>项目上下文</text>
    <box height="8px" width="140px" background="surface-tertiary" clip>
      <box background="#16a34a" height="100%" width="90%"/>
    </box>
  </row>
  <row align="center" gap={2}>
    <text>工具定义</text>
    <box height="8px" width="60px" background="surface-tertiary" clip>
      <box background="#0284c7" height="100%" width="60%"/>
    </box>
  </row>
</box>`;
  const distinct = await scorer.score(scenario, chart, undefined, null);
  assert.equal(distinct.checks.find(({ id }) => id === "colorDistinction")?.pass, true);

  const matching = await scorer.score(scenario, chart.replace("#0284c7", "#16a34a"), undefined, null);
  assert.equal(matching.checks.find(({ id }) => id === "colorDistinction")?.pass, false);
});

test("SVG coverage follows the visible paint of nodes, connectors, and arrowheads", { skip }, async () => {
  const scenarios = [
    [
      svg.replace('fill="#bfdbfe"', 'fill="#bfdbfe" fillOpacity={0}'),
      ["labeledConcepts", "visibleConnections", "flowDirection", "colorDistinction"],
    ],
    [svg.replace('fill="#bfdbfe"', 'fill="#bfdbfe" fillOpacity="0.04" stroke="currentColor"'), ["colorDistinction"]],
    [
      svg.replace('stroke="currentColor" markerEnd=', 'stroke="currentColor" strokeOpacity={0} markerEnd='),
      ["visibleConnections", "flowDirection"],
    ],
    [svg.replace('fill="currentColor"/>', 'fill="currentColor" fillOpacity={0}/>'), ["flowDirection"]],
    [
      svg.replace('y="35">已完成', 'y="35" fillOpacity={0}>已完成'),
      ["labeledConcepts", "visibleConnections", "flowDirection"],
    ],
  ] as const;
  for (const [chart, missed] of scenarios) {
    const result = await scorer.score(example, chart, undefined, null);
    assert.deepEqual(
      result.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
      missed,
    );
  }
});

test("a line between labeled shapes can show a relationship without direction", { skip }, async () => {
  const result = await scorer.score(example, svg.replace(' markerEnd="url(#arrow)"', ""), undefined, null);
  assert.deepEqual(
    result.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    ["flowDirection"],
  );
});

test("the shape of an SVG arrowhead determines whether its line shows direction", { skip }, async () => {
  const square = svg.replace("M0 0 L8 4 L0 8 Z", "M0 0 H8 V8 H0 Z");
  const squareResult = await scorer.score(example, square, undefined, null);
  assert.deepEqual(
    squareResult.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    ["flowDirection"],
  );

  const drawn = svg
    .replace(' markerEnd="url(#arrow)"', "")
    .replace("</svg>", '<polygon points="159,27 165,30 159,33" fill="currentColor"/></svg>');
  const drawnResult = await scorer.score(example, drawn, undefined, null);
  assert.deepEqual(
    drawnResult.checks.filter(({ pass }) => pass === false),
    [],
  );
});

test("labeled SVG boundaries can show containment", { skip }, async () => {
  const scenario: DilCase = { ...example, checks: [{ id: "labeledConcepts", atLeast: 2 }, { id: "nestedBoundaries" }] };
  const nested = `<svg viewBox="0 0 150 120">
    <rect x="1" y="1" width="120" height="100" fill="none" stroke="currentColor"/>
    <text x="8" y="17">宿主进程</text>
    <g transform="translate(12 24)">
      <rect width="90" height="55" fill="none" stroke="currentColor"/>
      <text x="9" y="25">隔离运行时</text>
    </g>
  </svg>`;
  const result = await scorer.score(scenario, nested, undefined, null);
  assert.deepEqual(
    result.checks.filter(({ pass }) => pass === false),
    [],
  );
  const transparent = await scorer.score(
    scenario,
    nested.replace('stroke="currentColor"', 'stroke="currentColor" strokeOpacity={0}'),
    undefined,
    null,
  );
  assert.deepEqual(
    transparent.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    ["labeledConcepts", "nestedBoundaries"],
  );
  const shifted = await scorer.score(scenario, nested.replace("translate(12 24)", "translate(50 24)"), undefined, null);
  assert.deepEqual(
    shifted.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    ["nestedBoundaries"],
  );
});

test("a missing judge verdict does not lower the score", { skip }, async () => {
  const result = await scorer.score(example, svg, undefined, async (screenshots) => {
    assert.equal(screenshots.length, 1);
    throw new Error("Judge unavailable");
  });
  assert.equal(result.score, 100);
  assert.equal(result.unscored, 2);
  assert.ok(result.checks.some(({ pass, detail }) => pass === null && detail === "Judge unavailable"));
});

test("an optional SVG check can fail while the other passes", { skip }, async () => {
  const result = await scorer.score(example, svg, undefined, (screenshots) => {
    assert.equal(screenshots.length, 1);
    return assessSvgLayout(example.prompt, async () => ({
      svgTextWithinBoxes: { pass: true, reason: "文字均在方框内。" },
      svgTextReadability: { pass: false, reason: "待处理标签紧贴左边框。" },
    }));
  });
  assert.equal(result.unscored, 0);
  assert.deepEqual(
    result.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    ["svgTextReadability"],
  );
});

test("fenced DIL does not produce visual evidence", { skip }, async () => {
  const result = await scorer.score(example, `\`\`\`html\n${svg}\n\`\`\``, undefined, null);
  assert.equal(result.dilNodes, 0);
  assert.deepEqual(
    result.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    example.checks.map(({ id }) => id),
  );
});

test("errors caught by the DIL runtime affect render scoring", { skip }, async () => {
  const result = await scorer.score(example, "<text>{undefined.missing}</text>", undefined, null);
  assert.equal(result.checks.find(({ id }) => id === "parseClean")?.pass, true);
  assert.equal(result.checks.find(({ id }) => id === "renderClean")?.pass, false);
});

test("a submit control that ignores one answer fails the interactive check", { skip }, async () => {
  const quiz = DIL_CASES.find(({ id }) => id === "quiz");
  assert.ok(quiz);
  const source = IDEAL_ANSWERS.quiz.replace("+ second)", "+ first)");
  assert.notEqual(source, IDEAL_ANSWERS.quiz);
  const result = await scorer.score(quiz, source, undefined, null);
  assert.deepEqual(
    result.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    ["submitSelectedAnswers"],
  );
});

test("numeric radio values can submit labels alongside numbered questions", { skip }, async () => {
  const quiz = DIL_CASES.find(({ id }) => id === "quiz");
  assert.ok(quiz);
  const source = `{@body const choices = ["原子性", "一致性", "隔离性"]}
{@body const [first, setFirst] = DIL.useState(0)}
{@body const [second, setSecond] = DIL.useState(0)}
<box>
  <text>第 1 题</text>
  <radio-group value={first} onChange={setFirst}>
    {#each choices as choice, index}<radio value={index}>{choice}</radio>{/each}
  </radio-group>
  <text>第 2 题</text>
  <radio-group value={second} onChange={setSecond}>
    {#each choices as choice, index}<radio value={index}>{choice}</radio>{/each}
  </radio-group>
  <button
    onClick={() => GenUI.issueNewTurn("第 1 题：" + choices[first] + "；第 2 题：" + choices[second])}
  >提交答案</button>
</box>`;

  const result = await scorer.score(quiz, source, undefined, null);
  assert.deepEqual(
    result.checks.filter(({ pass }) => pass !== true),
    [],
  );
  const fixedAnswer = source.replace("choices[first]", "choices[0]");
  const incomplete = await scorer.score(quiz, fixedAnswer, undefined, null);
  assert.deepEqual(
    incomplete.checks.filter(({ pass }) => pass === false).map(({ id }) => id),
    ["submitSelectedAnswers"],
  );
});
