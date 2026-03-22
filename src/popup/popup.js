const INJECTED_FILES = [
  "src/content/namespace.js",
  "src/content/utils.js",
  "src/content/platforms.js",
  "src/content/extractor.js",
  "src/content/exporters.js",
  "src/content/runner.js"
];

const SUPPORTED_HOSTS = {
  "chatgpt.com": "ChatGPT",
  "gemini.google.com": "Gemini",
  "chat.deepseek.com": "DeepSeek",
  "grok.com": "Grok",
  "perplexity.ai": "Perplexity",
  "claude.ai": "Claude"
};

const REPOSITORY_ISSUES_URL = "https://github.com/weiyuankong/ChatArchive/issues/new";

document.addEventListener("DOMContentLoaded", async () => {
  const exportButton = document.getElementById("exportBtn");
  const stopButton = document.getElementById("stopBtn");
  const copyReportButton = document.getElementById("copyReportBtn");
  const reportIssueButton = document.getElementById("reportIssueBtn");
  const refreshStatusButton = document.getElementById("refreshStatusBtn");
  const formatSelect = document.getElementById("formatSelect");
  const includeMetadata = document.getElementById("includeMetadata");
  const progressBar = document.getElementById("progressBar");
  const statusContainer = document.getElementById("statusContainer");
  const statusText = document.getElementById("status");
  const supportText = document.getElementById("siteSupport");
  const diagnosticsPanel = document.getElementById("diagnosticsPanel");
  const diagPlatform = document.getElementById("diagPlatform");
  const diagSource = document.getElementById("diagSource");
  const diagStrategy = document.getElementById("diagStrategy");
  const diagMessages = document.getElementById("diagMessages");
  const diagConfidence = document.getElementById("diagConfidence");
  const diagFormat = document.getElementById("diagFormat");
  const diagFile = document.getElementById("diagFile");

  let lastReport = null;
  let exportRunning = false;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentHost = getHostName(tab?.url);
  const supportedName = currentHost && SUPPORTED_HOSTS[currentHost];

  if (supportedName) {
    supportText.textContent = `Detected site: ${supportedName}`;
  } else if (currentHost) {
    supportText.textContent = `Detected site: ${currentHost}`;
  }

  if (!tab?.id || !tab.url?.startsWith("http")) {
    exportButton.disabled = true;
    statusText.textContent = "Open a supported website first.";
    return;
  }

  copyReportButton.addEventListener("click", async () => {
    if (!lastReport) {
      return;
    }

    await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
    statusText.textContent = "Debug report copied.";
  });

  reportIssueButton.addEventListener("click", async () => {
    if (!lastReport) {
      return;
    }

    const issueUrl = buildIssueUrl(lastReport);
    await chrome.tabs.create({ url: issueUrl });
  });

  stopButton.addEventListener("click", async () => {
    if (!exportRunning) {
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CHAT_ARCHIVE_STOP_AND_SAVE"
    });

    if (response?.ok) {
      statusText.textContent = "Stop requested. Saving current progress…";
      stopButton.disabled = true;
    }
  });

  refreshStatusButton.addEventListener("click", async () => {
    await refreshRunStatus();
  });

  exportButton.addEventListener("click", async () => {
    const selectedFormat = formatSelect.value;
    const exportOptions = {
      includeMetadata: includeMetadata.checked
    };

    exportButton.disabled = true;
    stopButton.disabled = false;
    refreshStatusButton.disabled = true;
    copyReportButton.disabled = true;
    reportIssueButton.disabled = true;
    progressBar.style.display = "block";
    statusContainer.classList.add("loading");
    statusText.textContent = "Injecting extractor…";

    try {
      exportRunning = true;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: INJECTED_FILES
      });

      statusText.textContent = "Starting export…";

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "CHAT_ARCHIVE_START",
        format: selectedFormat,
        options: exportOptions
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Unable to start export.");
      }

      progressBar.style.display = "none";
      statusContainer.classList.remove("loading");
      lastReport = buildDebugReport({
        host: currentHost,
        summary: response.summary,
        options: exportOptions,
        status: "success"
      });
      renderDiagnostics(response.summary);
      copyReportButton.disabled = false;
      reportIssueButton.disabled = false;
      exportButton.disabled = false;
      refreshStatusButton.disabled = false;
      exportRunning = false;
      stopButton.disabled = true;
      statusText.textContent = response.summary.partial ? "Partial export saved." : "Export completed.";
    } catch (error) {
      lastReport = buildDebugReport({
        host: currentHost,
        error: error.message || "Export failed.",
        options: exportOptions,
        status: "failed"
      });
      exportButton.disabled = false;
      stopButton.disabled = true;
      refreshStatusButton.disabled = false;
      copyReportButton.disabled = false;
      reportIssueButton.disabled = false;
      progressBar.style.display = "none";
      statusContainer.classList.remove("loading");
      exportRunning = false;
      statusText.textContent = error.message || "Export failed.";
    }
  });

  function renderDiagnostics(summary) {
    diagnosticsPanel.style.display = "block";
    diagPlatform.textContent = summary.platform;
    diagSource.textContent = summary.source;
    diagStrategy.textContent = summary.strategyId;
    diagMessages.textContent = summary.partial
      ? `${summary.messageCount} (partial)`
      : String(summary.messageCount);
    diagConfidence.textContent = `${Math.round(summary.confidence * 100)}%`;
    diagFormat.textContent = summary.format;
    diagFile.textContent = summary.filename;
  }

  async function refreshRunStatus() {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: INJECTED_FILES
      });

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "CHAT_ARCHIVE_GET_STATUS"
      });

      if (!response?.ok) {
        return;
      }

      exportRunning = Boolean(response.running);
      stopButton.disabled = !exportRunning;
      refreshStatusButton.disabled = false;

      if (response.summary) {
        renderDiagnostics(response.summary);
        lastReport = buildDebugReport({
          host: currentHost,
          summary: response.summary,
          options: {
            includeMetadata: includeMetadata.checked
          },
          status: response.error ? "failed" : "success"
        });
        copyReportButton.disabled = false;
        reportIssueButton.disabled = false;
      }

      if (response.running) {
        statusText.textContent = "Export still running.";
      } else if (response.error) {
        statusText.textContent = response.error;
      }
    } catch {
      // Ignore pages where the runner is not yet injected.
    }
  }
});

function getHostName(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function buildDebugReport({ host, summary, error, options, status }) {
  return {
    status,
    host,
    options,
    exportedAt: new Date().toISOString(),
    summary: summary || null,
    error: error || null
  };
}

function buildIssueUrl(report) {
  const titlePrefix = report.status === "failed" ? "Broken export" : "Export quality issue";
  const platform = report.summary?.platform || report.host || "unknown platform";
  const title = `${titlePrefix}: ${platform}`;
  const body = [
    "## What happened",
    report.error ? report.error : "Export completed, but the output needs review.",
    "",
    "## Debug report",
    "```json",
    JSON.stringify(report, null, 2),
    "```"
  ].join("\n");

  const params = new URLSearchParams({
    template: "broken-export.yml",
    title,
    body
  });

  return `${REPOSITORY_ISSUES_URL}?${params.toString()}`;
}
