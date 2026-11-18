/**
 * The scorer's own tests: no network, no model.
 *
 * Each case gets a hand-written "ideal" answer that must pass every check, and a plain
 * prose answer that must fail the positive cases and pass the negative control. That
 * proves the checks are satisfiable and discriminating before any live run is trusted —
 * a checker that can never pass is the most common way an eval lies.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { DIL_CASES } from "./cases.ts";
import { IDEAL_ANSWERS } from "./ideal.ts";
import { type DilCase, scoreCase } from "./scoring.ts";

const PROSE = `这个问题可以从几个角度解释。首先是直觉层面，其次是工程权衡，最后是结论。\n\n- 第一点\n- 第二点\n\n总的来说，需要根据场景选择。`;

function dilCase(id: string): DilCase {
  const found = DIL_CASES.find((item) => item.id === id);
  assert.ok(found, `missing case ${id}`);
  return found;
}

test("every case is satisfied by a hand-written ideal answer", () => {
  for (const [id, answer] of Object.entries(IDEAL_ANSWERS)) {
    const result = scoreCase(dilCase(id), answer);
    const failed = result.checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.label}`);
    assert.deepEqual(failed, [], `${id} missed checks: ${failed.join("\n")}`);
    assert.equal(result.score, 100, `${id} scored ${result.score}%`);
  }
});

test("the negative control rejects DIL and accepts plain Markdown", () => {
  const negative = dilCase("restraint-refactor");
  const prose = scoreCase(negative, PROSE);
  assert.equal(prose.checks.find((check) => check.id === "no-dil")?.pass, true);
  assert.equal(prose.checks.find((check) => check.id === "fence")?.pass, false);

  const overTriggered = `${PROSE}\n\n<box padding={2}><text>结论</text></box>`;
  const result = scoreCase(negative, overTriggered);
  assert.equal(result.checks.find((check) => check.id === "no-dil")?.pass, false);

  // The two-sentence control has no fence requirement — a short answer is the pass.
  const closure = scoreCase(dilCase("restraint-closure"), IDEAL_ANSWERS["restraint-closure"]);
  assert.equal(closure.score, 100);
});

test("positive cases fail on plain prose", () => {
  for (const id of ["flow", "comparison", "proportions", "states"]) {
    const result = scoreCase(dilCase(id), PROSE);
    assert.ok(result.score < 50, `${id} should not pass on prose, scored ${result.score}%`);
    assert.equal(result.dilNodes, 0);
  }
});

test("a streamed prefix is parsed, not crashed", () => {
  const result = scoreCase(dilCase("flow"), "<box gap={2}>\n  <row>\n    <badge color=");
  assert.equal(result.diagnostics.length > 0, true);
  assert.ok(result.score >= 0);
});

test("fenced DIL does not count as DIL", () => {
  const fenced = `\`\`\`jsx\n<box padding={2}><row><badge>边界</badge></row></box>\n\`\`\``;
  const result = scoreCase(dilCase("flow"), fenced);
  assert.equal(result.dilNodes, 0);
  assert.ok(result.score < 50);
});
