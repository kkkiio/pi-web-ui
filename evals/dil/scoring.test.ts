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
  for (const scenario of DIL_CASES) {
    const { id } = scenario;
    const answer = IDEAL_ANSWERS[id];
    assert.ok(answer, `missing example for ${id}`);
    const result = scoreCase(scenario, answer);
    const failed = result.checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.label}`);
    assert.deepEqual(failed, [], `${id} missed checks: ${failed.join("\n")}`);
    assert.equal(result.score, 100, `${id} scored ${result.score}%`);
  }
});

test("positive cases fail on plain prose", () => {
  for (const scenario of DIL_CASES) {
    const result = scoreCase(scenario, PROSE);
    assert.ok(result.score < 50, `${scenario.id} should not pass on prose, scored ${result.score}%`);
    assert.equal(result.dilNodes, 0);
  }
});

test("a streamed prefix is parsed, not crashed", () => {
  const result = scoreCase(dilCase("codemode-sandbox"), "<box gap={2}>\n  <row>\n    <badge color=");
  assert.equal(result.diagnostics.length > 0, true);
  assert.ok(result.score >= 0);
});

test("fenced DIL does not count as DIL", () => {
  const fenced = `\`\`\`jsx\n<box padding={2}><row><badge>边界</badge></row></box>\n\`\`\``;
  const result = scoreCase(dilCase("codemode-sandbox"), fenced);
  assert.equal(result.dilNodes, 0);
  assert.ok(result.score < 50);
});
