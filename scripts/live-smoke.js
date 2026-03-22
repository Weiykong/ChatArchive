const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { getContentFilePaths } = require("./content-files");
const {
  assessExtraction,
  buildLiveSmokeSummary,
  getTargetConfigs,
  sanitizeName
} = require("./live-smoke-utils");

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const artifactRoot = path.join(root, process.env.SMOKE_ARTIFACT_DIR || "artifacts/live-smoke");
const scriptSources = getContentFilePaths(root).map((filePath) => fs.readFileSync(filePath, "utf8"));

async function writeArtifacts(page, targetDirectory, result, exportPayload) {
  fs.mkdirSync(targetDirectory, { recursive: true });

  if (page) {
    await page.screenshot({
      path: path.join(targetDirectory, "page.png"),
      fullPage: true
    });
    fs.writeFileSync(path.join(targetDirectory, "page.html"), await page.content(), "utf8");
  }

  if (result) {
    fs.writeFileSync(
      path.join(targetDirectory, "report.json"),
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    );
  }

  if (exportPayload?.content) {
    fs.writeFileSync(path.join(targetDirectory, exportPayload.filename), exportPayload.content, "utf8");
  }
}

async function loadExporterIntoPage(page) {
  for (const scriptSource of scriptSources) {
    await page.evaluate(scriptSource);
  }
}

async function extractFromPage(page) {
  return page.evaluate(async () => {
    const result = await window.ChatArchive.extractor.extractConversation(document);
    const confidence = result.messages.length
      ? Math.max(0.2, Math.min(0.99, (result.score / result.messages.length) / 14))
      : 0;
    const authors = Array.from(new Set(result.messages.map((message) => message.author)));
    const payload = window.ChatArchive.exporters.buildExportPayload(
      "md",
      result.adapter,
      result.messages,
      {
        includeMetadata: true,
        strategyId: result.strategyId,
        source: result.source,
        partial: result.partial
      }
    );

    return {
      extraction: {
        adapterId: result.adapter.id,
        displayName: result.adapter.displayName,
        strategyId: result.strategyId,
        source: result.source || "dom",
        partial: Boolean(result.partial),
        messageCount: result.messages.length,
        authors,
        confidence,
        diagnostics: result.diagnostics || {},
        currentUrl: window.location.href,
        title: document.title.trim(),
        sampleMessages: result.messages.slice(0, 3)
      },
      exportPayload: {
        filename: payload.filename,
        content: payload.content
      }
    };
  });
}

async function runTarget(browser, target) {
  const result = {
    id: target.id,
    displayName: target.displayName,
    status: target.status
  };

  if (!target.enabled) {
    result.skipReason = target.skipReason;
    return result;
  }

  const targetDirectory = path.join(artifactRoot, sanitizeName(target.displayName));
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 1200
    }
  });
  let page;

  try {
    if (target.cookies.length > 0) {
      await context.addCookies(target.cookies);
    }

    page = await context.newPage();
    await page.goto(target.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    try {
      await page.waitForLoadState("networkidle", {
        timeout: 15000
      });
    } catch {}

    await page.waitForTimeout(Number.parseInt(process.env.SMOKE_WAIT_MS || "3000", 10));
    await loadExporterIntoPage(page);

    const pageResult = await extractFromPage(page);
    result.extraction = pageResult.extraction;
    result.url = target.url;

    const assessment = assessExtraction(target, pageResult.extraction);
    result.status = assessment.status;
    result.failureReason = assessment.failureReason;

    await writeArtifacts(page, targetDirectory, result, pageResult.exportPayload);
    return result;
  } catch (error) {
    result.status = "failed";
    result.url = target.url;
    result.failureReason = error instanceof Error ? error.message : String(error);
    await writeArtifacts(page, targetDirectory, result, null);
    fs.writeFileSync(path.join(targetDirectory, "error.txt"), `${result.failureReason}\n`, "utf8");
    return result;
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });

  const targets = getTargetConfigs(process.env);
  if (!targets.some((target) => target.enabled)) {
    const summary = buildLiveSmokeSummary(targets, packageJson.version);
    fs.writeFileSync(path.join(artifactRoot, "summary.md"), summary, "utf8");
    fs.writeFileSync(path.join(artifactRoot, "results.json"), JSON.stringify(targets, null, 2) + "\n", "utf8");
    process.stdout.write(summary);
    return;
  }

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const results = [];
    for (const target of targets) {
      // Run sequentially to keep artifact directories deterministic and reduce session cross-talk.
      results.push(await runTarget(browser, target));
    }

    const summary = buildLiveSmokeSummary(results, packageJson.version);
    fs.writeFileSync(path.join(artifactRoot, "summary.md"), summary, "utf8");
    fs.writeFileSync(path.join(artifactRoot, "results.json"), JSON.stringify(results, null, 2) + "\n", "utf8");
    process.stdout.write(summary);

    if (results.some((result) => result.status === "failed")) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
