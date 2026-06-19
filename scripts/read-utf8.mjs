import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];

if (!target) {
  console.error("Usage: node scripts/read-utf8.mjs <file>");
  process.exit(1);
}

const resolved = path.resolve(process.cwd(), target);
const content = fs.readFileSync(resolved, "utf8");
process.stdout.write(content);
