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
const PRINT_JOB_PREFIX = "chatArchivePrintJob:";
const DEFAULT_RUNTIME_HINT =
  "DOM scrolling can slow down or pause in a background tab. Use Stop & Save or <code>Ctrl/Command+Shift+S</code> to keep partial progress.";
const PDF_RUNTIME_HINT =
  "PDF export opens a print-ready view in a new tab. Use the browser print dialog's <code>Save as PDF</code> option to keep the final file.";
const TEMPLATE_TOKENS = [
  { id: "tplPlatform", token: "{platform}" },
  { id: "tplTitle", token: "{title}" },
  { id: "tplDate", token: "{date}" },
  { id: "tplTime", token: "{time}" },
  { id: "tplSource", token: "{source}" },
  { id: "tplStrategy", token: "{strategy}" },
  { id: "tplCount", token: "{count}" }
];

document.addEventListener("DOMContentLoaded", async () => {
  const exportButton = document.getElementById("exportBtn");
  const copyButton = document.getElementById("copyBtn");
  const stopButton = document.getElementById("stopBtn");
  const copyReportButton = document.getElementById("copyReportBtn");
  const reportIssueButton = document.getElementById("reportIssueBtn");
  const refreshStatusButton = document.getElementById("refreshStatusBtn");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsPanel = document.getElementById("settingsPanel");
  const formatSelect = document.getElementById("formatSelect");
  const includeMetadata = document.getElementById("includeMetadata");
  const filenameTemplateInput = document.getElementById("filenameTemplate");
  const templatePreview = document.getElementById("templatePreview");
  const messageLimitInput = document.getElementById("messageLimit");
  const scrollSpeedInput = document.getElementById("scrollSpeed");
  const progressBar = document.getElementById("progressBar");
  const statusContainer = document.getElementById("statusContainer");
  const statusText = document.getElementById("status");
  const supportText = document.getElementById("siteSupport");
  const runtimeHint = document.getElementById("runtimeHint");
  const diagnosticsPanel = document.getElementById("diagnosticsPanel");
  const diagPlatform = document.getElementById("diagPlatform");
  const diagSource = document.getElementById("diagSource");
  const diagStrategy = document.getElementById("diagStrategy");
  const diagMessages = document.getElementById("diagMessages");
  const diagConfidence = document.getElementById("diagConfidence");
  const diagFormat = document.getElementById("diagFormat");
  const diagFile = document.getElementById("diagFile");
  const templateCheckboxes = TEMPLATE_TOKENS.map(({ id, token }) => ({
    token,
    element: document.getElementById(id)
  })).filter(({ element }) => element);

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

  // Load saved settings
  const settings = await chrome.storage.local.get([
    "exportFormat",
    "includeMetadata",
    "filenameTemplate",
    "messageLimit",
    "scrollSpeed",
    "settingsPanelOpen"
  ]);

  if (settings.exportFormat) {
    formatSelect.value = settings.exportFormat;
  }
  if (settings.includeMetadata !== undefined) {
    includeMetadata.checked = settings.includeMetadata;
  }
  if (settings.filenameTemplate) {
    filenameTemplateInput.value = settings.filenameTemplate;
  }
  if (settings.messageLimit !== undefined) {
    messageLimitInput.value = settings.messageLimit;
  }
  if (settings.scrollSpeed !== undefined) {
    scrollSpeedInput.value = settings.scrollSpeed;
  }
  if (settings.settingsPanelOpen) {
    settingsToggle.classList.add("open");
    settingsPanel.classList.add("open");
  }

  if (filenameTemplateInput.value) {
    syncTemplateCheckboxes(filenameTemplateInput.value);
    renderTemplatePreview(filenameTemplateInput.value);
  } else {
    syncTemplateFromCheckboxes();
  }

  updateFormatActions();
  updateReportActions();

  function persistSettings() {
    chrome.storage.local.set({
      exportFormat: formatSelect.value,
      includeMetadata: includeMetadata.checked,
      filenameTemplate: filenameTemplateInput.value,
      messageLimit: messageLimitInput.value,
      scrollSpeed: scrollSpeedInput.value,
      settingsPanelOpen: settingsPanel.classList.contains("open")
    });
  }

  [includeMetadata, messageLimitInput, scrollSpeedInput].forEach((el) => {
    el.addEventListener("change", () => {
      persistSettings();
    });
  });

  formatSelect.addEventListener("change", () => {
    updateFormatActions();
    persistSettings();
  });

  templateCheckboxes.forEach(({ element }) => {
    element.addEventListener("change", () => {
      syncTemplateFromCheckboxes();
      persistSettings();
    });
  });

  settingsToggle.addEventListener("click", () => {
    settingsToggle.classList.toggle("open");
    settingsPanel.classList.toggle("open");
    persistSettings();
  });

  if (!tab?.id || !tab.url?.startsWith("http")) {
    exportButton.disabled = true;
    if (copyButton) copyButton.disabled = true;
    statusText.textContent = "Open a supported website first.";
    return;
  }

  // Listen for progress updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CHAT_ARCHIVE_PROGRESS") {
      const { messageCount } = message.progress;
      statusText.textContent = `Scanning... (${messageCount} messages)`;
    }
  });

  async function injectScripts() {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: INJECTED_FILES
    });
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

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const selectedFormat = formatSelect.value;
      if (selectedFormat === "pdf") {
        statusText.textContent = "Clipboard copy is not available for PDF export.";
        return;
      }
      const exportOptions = {
        includeMetadata: includeMetadata.checked,
        filenameTemplate: filenameTemplateInput.value,
        messageLimit: Number.parseInt(messageLimitInput.value, 10) || 0,
        scrollSpeed: Number.parseInt(scrollSpeedInput.value, 10) || 200
      };

      exportButton.disabled = true;
      copyButton.disabled = true;
      stopButton.disabled = false;
      refreshStatusButton.disabled = true;
      progressBar.style.display = "block";
      statusContainer.classList.add("loading");
      statusText.textContent = "Preparing extractor…";

      try {
        exportRunning = true;
        await injectScripts();

        statusText.textContent = "Extracting chat…";

        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "CHAT_ARCHIVE_COPY",
          format: selectedFormat,
          options: exportOptions
        });

        if (!response?.ok) {
          throw new Error(response?.error || "Unable to copy chat.");
        }

        await navigator.clipboard.writeText(response.content);
        
        progressBar.style.display = "none";
        statusContainer.classList.remove("loading");
        lastReport = buildDebugReport({
          host: currentHost,
          summary: response.summary,
          options: exportOptions,
          status: "success"
        });
        renderDiagnostics(response.summary);
        exportButton.disabled = false;
        copyButton.disabled = false;
        refreshStatusButton.disabled = false;
        exportRunning = false;
        stopButton.disabled = true;
        updateReportActions();
        statusText.textContent = "Copied to clipboard!";
      } catch (error) {
        statusText.textContent = error.message || "Copy failed.";
        exportButton.disabled = false;
        copyButton.disabled = false;
        stopButton.disabled = true;
        progressBar.style.display = "none";
        statusContainer.classList.remove("loading");
        exportRunning = false;
      }
    });
  }

  exportButton.addEventListener("click", async () => {
    const selectedFormat = formatSelect.value;
    const exportOptions = {
      includeMetadata: includeMetadata.checked,
      filenameTemplate: filenameTemplateInput.value,
      messageLimit: Number.parseInt(messageLimitInput.value, 10) || 0,
      scrollSpeed: Number.parseInt(scrollSpeedInput.value, 10) || 200
    };

    exportButton.disabled = true;
    if (copyButton) copyButton.disabled = true;
    stopButton.disabled = false;
    refreshStatusButton.disabled = true;
    progressBar.style.display = "block";
    statusContainer.classList.add("loading");
    statusText.textContent = "Preparing extractor…";

    try {
      exportRunning = true;
      await injectScripts();

      statusText.textContent = selectedFormat === "pdf" ? "Preparing PDF…": "Starting export…";

      const response = await chrome.tabs.sendMessage(
        tab.id,
        selectedFormat === "pdf"
          ? {
              type: "CHAT_ARCHIVE_BUILD_EXPORT",
              format: selectedFormat,
              options: exportOptions
            }
          : {
              type: "CHAT_ARCHIVE_START",
              format: selectedFormat,
              options: exportOptions
            }
      );

      if (!response?.ok) {
        throw new Error(response?.error || "Unable to start export.");
      }

      if (selectedFormat === "pdf") {
        await openPdfPrintView(response.payload);
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
      exportButton.disabled = false;
      if (copyButton) copyButton.disabled = false;
      refreshStatusButton.disabled = false;
      exportRunning = false;
      stopButton.disabled = true;
      updateFormatActions();
      updateReportActions();
      statusText.textContent = selectedFormat === "pdf"
        ? response.summary.partial
          ? "Partial PDF opened in print view."
          : "Print-ready PDF view opened."
        : response.summary.partial
          ? "Partial export saved."
          : "Export completed.";
    } catch (error) {
      lastReport = buildDebugReport({
        host: currentHost,
        error: error.message || "Export failed.",
        options: exportOptions,
        status: "failed"
      });
      exportButton.disabled = false;
      if (copyButton) copyButton.disabled = false;
      stopButton.disabled = true;
      refreshStatusButton.disabled = false;
      progressBar.style.display = "none";
      statusContainer.classList.remove("loading");
      exportRunning = false;
      updateFormatActions();
      updateReportActions();
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
      await injectScripts();

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
            includeMetadata: includeMetadata.checked,
            filenameTemplate: filenameTemplateInput.value,
            messageLimit: Number.parseInt(messageLimitInput.value, 10) || 0,
            scrollSpeed: Number.parseInt(scrollSpeedInput.value, 10) || 200
          },
          status: response.error ? "failed" : "success"
        });
        updateReportActions();
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

  async function openPdfPrintView(payload) {
    const jobKey = `${PRINT_JOB_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await chrome.storage.local.set({
      [jobKey]: {
        createdAt: Date.now(),
        filename: payload.filename,
        content: payload.content
      }
    });
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`src/print/print.html?job=${encodeURIComponent(jobKey)}`)
    });
  }

  function updateFormatActions() {
    const isPdf = formatSelect.value === "pdf";
    exportButton.textContent = isPdf ? "Save as PDF" : "Export Chat";
    runtimeHint.innerHTML = isPdf ? PDF_RUNTIME_HINT : DEFAULT_RUNTIME_HINT;

    if (copyButton) {
      copyButton.title = isPdf ? "Clipboard copy is disabled for PDF exports." : "";
      if (!exportRunning) {
        copyButton.disabled = isPdf;
      }
    }
  }

  function updateReportActions() {
    const hasReport = Boolean(lastReport);
    copyReportButton.disabled = !hasReport;
    reportIssueButton.disabled = !hasReport;
  }

  function syncTemplateFromCheckboxes() {
    const enabledTokens = {
      platform: isTokenEnabled("{platform}"),
      title: isTokenEnabled("{title}"),
      date: isTokenEnabled("{date}"),
      time: isTokenEnabled("{time}"),
      source: isTokenEnabled("{source}"),
      strategy: isTokenEnabled("{strategy}"),
      count: isTokenEnabled("{count}")
    };
    const leadingParts = [];
    const trailingParts = [];

    if (enabledTokens.platform) {
      leadingParts.push("[{platform}]");
    }

    if (enabledTokens.title) {
      leadingParts.push("{title}");
    }

    if (enabledTokens.date) {
      trailingParts.push("{date}");
    }
    if (enabledTokens.time) {
      trailingParts.push("{time}");
    }
    if (enabledTokens.source) {
      trailingParts.push("{source}");
    }
    if (enabledTokens.strategy) {
      trailingParts.push("{strategy}");
    }
    if (enabledTokens.count) {
      trailingParts.push("{count}");
    }

    let template = leadingParts.join(" ").trim();
    if (trailingParts.length > 0) {
      template = template
        ? `${template} - ${trailingParts.join(" - ")}`
        : trailingParts.join(" - ");
    }

    if (!template) {
      template = "{title}";
      syncTemplateCheckboxes(template);
    }

    filenameTemplateInput.value = template;
    renderTemplatePreview(template);
  }

  function syncTemplateCheckboxes(template) {
    templateCheckboxes.forEach(({ token, element }) => {
      element.checked = template.includes(token);
    });
  }

  function renderTemplatePreview(template) {
    templatePreview.textContent = template;
  }

  function isTokenEnabled(token) {
    return templateCheckboxes.find((entry) => entry.token === token)?.element.checked;
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
