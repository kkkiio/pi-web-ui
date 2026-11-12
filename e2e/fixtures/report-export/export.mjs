import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const output = process.argv[2];
const target = join(output, "reports/summary.csv");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, "item,total\norders,42\n");
