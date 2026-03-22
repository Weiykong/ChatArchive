const path = require("node:path");

const CONTENT_FILES = [
  "src/content/namespace.js",
  "src/content/utils.js",
  "src/content/platforms.js",
  "src/content/extractor.js",
  "src/content/exporters.js"
];

function getContentFilePaths(root = process.cwd()) {
  return CONTENT_FILES.map((relativePath) => path.join(root, relativePath));
}

module.exports = {
  CONTENT_FILES,
  getContentFilePaths
};
