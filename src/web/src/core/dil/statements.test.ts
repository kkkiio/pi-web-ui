import assert from "node:assert/strict";
import test from "node:test";
import { findStateDeclarations, splitStatements, stateKeys } from "./index.ts";

test("splits {@body} statements only at top-level semicolons", () => {
  assert.deepEqual(splitStatements('const a = {x:1;}; const b = "a;b"'), ["const a = {x:1;}", 'const b = "a;b"']);
  assert.deepEqual(splitStatements(" const a = 1 ; "), ["const a = 1"]);
  assert.deepEqual(splitStatements(""), []);
});

test("extracts useState declarations with their semantic key", () => {
  const declarations = findStateDeclarations([
    'const [tab, setTab] = DIL.useState("overview")',
    "const [count, setCount] = useState(0, {key: 'count'})",
    "const [items] = DIL.useState([], {key: 'items'})",
    "const derived = tab.length",
  ]);

  assert.deepEqual(
    declarations.map((declaration) => [declaration.name, declaration.setter, declaration.initial]),
    [
      ["tab", "setTab", '"overview"'],
      ["count", "setCount", "0"],
      ["items", null, "[]"],
    ],
  );
  assert.deepEqual(stateKeys(["const [a, setA] = DIL.useState({x: 1, y: 2})"]), ["a"]);
});
