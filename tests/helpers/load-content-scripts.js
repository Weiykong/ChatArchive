const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const { getContentFilePaths } = require("../../scripts/content-files");

function loadFixture(fixturePath, url) {
  const html = fs.readFileSync(fixturePath, "utf8");
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "outside-only"
  });

  const context = dom.getInternalVMContext();

  getContentFilePaths(process.cwd()).forEach((filePath) => {
    const script = new vm.Script(fs.readFileSync(filePath, "utf8"), {
      filename: filePath
    });

    script.runInContext(context);
  });

  return dom;
}

module.exports = {
  loadFixture
};
