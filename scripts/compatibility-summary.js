const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const fixtureDirectory = path.join(root, "tests", "fixtures");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const fixtures = fs
  .readdirSync(fixtureDirectory)
  .filter((fileName) => fileName.endsWith(".html"))
  .sort();

const lines = [
  "# Compatibility Summary",
  "",
  `- Version: ${packageJson.version}`,
  `- Fixture count: ${fixtures.length}`,
  "",
  "## Fixtures",
  ...fixtures.map((fixture) => `- ${fixture}`)
];

const output = lines.join("\n") + "\n";
process.stdout.write(output);
