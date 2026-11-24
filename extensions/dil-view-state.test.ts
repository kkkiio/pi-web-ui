import assert from "node:assert/strict";
import test from "node:test";
import { parseDilViewState } from "./dil-view-state.ts";

test("reads a saved card snapshot with nested slots", () => {
  const snapshot = {
    root: {
      choice: "B",
      revealed: true,
      count: 2,
      checklist: [[1], [], [0, 2]],
      notes: { first: "MIDI device", second: null },
    },
  };

  assert.deepEqual(parseDilViewState(JSON.parse(JSON.stringify(snapshot))), snapshot);
  assert.deepEqual(parseDilViewState({ root: {} }), { root: {} });
});

test("rejects state outside the saved snapshot format", () => {
  const invalid = [
    null,
    { choice: "B" },
    { root: [] },
    { root: { number: Infinity } },
    { root: { note: undefined } },
    { root: { created: new Date() } },
  ];

  for (const value of invalid) assert.equal(parseDilViewState(value), undefined);
});

test("rejects overly large or deeply nested values", () => {
  let nested: unknown = "leaf";
  for (let depth = 0; depth < 17; depth++) nested = { value: nested };

  const invalid = [
    { root: { nested } },
    { root: { text: "a".repeat(1_000_000) } },
    { root: { items: Array<boolean>(40_000).fill(false) } },
    { root: Object.fromEntries(Array.from({ length: 20_000 }, (_, index) => [String(index), null])) },
  ];

  for (const value of invalid) assert.equal(parseDilViewState(value), undefined);
});
