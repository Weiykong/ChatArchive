(function registerRunner(globalScope) {
  const app = globalScope.ChatArchive;
  const runnerVersion = app.version || "1.13.0";
  if (globalScope.__CHAT_ARCHIVE_RUNNER_INSTALLED__ === runnerVersion) {
    return;
  }

  if (
    globalScope.__CHAT_ARCHIVE_RUNNER_HANDLER__
    && globalScope.chrome?.runtime?.onMessage?.removeListener
  ) {
    globalScope.chrome.runtime.onMessage.removeListener(globalScope.__CHAT_ARCHIVE_RUNNER_HANDLER__);
  }

  globalScope.__CHAT_ARCHIVE_RUNNER_INSTALLED__ = runnerVersion;
  let currentSession = null;

  function buildSummary(extraction, format, payload, options = {}) {
    return {
      platform: extraction.adapter.displayName,
      messageCount: extraction.messages.length,
      strategyId: extraction.strategyId,
      source: extraction.source || "dom",
      partial: Boolean(extraction.partial),
      confidence: app.extractor.estimateConfidence(extraction),
      format,
      filename: payload.filename,
      metadataIncluded: options.includeMetadata !== false,
      diagnostics: extraction.diagnostics || {}
    };
  }

  async function buildExportResult(format, options = {}, control = app.extractor.createStopController()) {
    const internalOptions = {
      ...options,
      onProgress: (progress) => {
        globalScope.chrome.runtime.sendMessage({
          type: "CHAT_ARCHIVE_PROGRESS",
          progress
        }).catch(() => {
          // Popup might be closed, ignore.
        });
      }
    };
    const extraction = await app.extractor.extractConversation(document, control, internalOptions);
    const payload = app.exporters.buildExportPayload(
      format,
      extraction.adapter,
      extraction.messages,
      {
        ...options,
        strategyId: extraction.strategyId,
        source: extraction.source,
        partial: extraction.partial,
        title: extraction.title
      }
    );

    return {
      payload,
      summary: buildSummary(extraction, format, payload, options)
    };
  }

  async function startExport(format, options = {}, control = app.extractor.createStopController()) {
    const result = await buildExportResult(format, options, control);
    app.exporters.triggerDownload(result.payload);
    return result.summary;
  }

  async function buildExportPayload(format, options = {}, control = app.extractor.createStopController()) {
    return buildExportResult(format, options, control);
  }

  async function copyToClipboard(format, options = {}, control = app.extractor.createStopController()) {
    const result = await buildExportResult(format, options, control);
    return {
      content: result.payload.content,
      summary: result.summary
    };
  }

  async function writeClipboardText(text) {
    if (globalScope.navigator?.clipboard?.writeText) {
      await globalScope.navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Clipboard write is not available on this page.");
    }
  }

  async function copyDirectlyToClipboard(format, options = {}, control = app.extractor.createStopController()) {
    const result = await buildExportResult(format, options, control);
    await writeClipboardText(result.payload.content);
    return result.summary;
  }

  if (!globalScope.chrome?.runtime?.onMessage) {
    return;
  }

  const messageHandler = (message, sender, sendResponse) => {
    if (message?.type === "CHAT_ARCHIVE_COPY") {
      if (currentSession || globalScope.__CHAT_ARCHIVE_RUNNING__) {
        sendResponse({ ok: false, error: "Export already running on this page." });
        return undefined;
      }

      globalScope.__CHAT_ARCHIVE_RUNNING__ = true;
      currentSession = {
        format: message.format,
        options: message.options || {},
        control: app.extractor.createStopController()
      };

      copyToClipboard(message.format, message.options || {}, currentSession.control)
        .then((result) => {
          globalScope.__CHAT_ARCHIVE_LAST_RUN__ = result.summary;
          globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = null;
          sendResponse({ ok: true, content: result.content, summary: result.summary });
        })
        .catch((error) => {
          globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = error.message;
          sendResponse({ ok: false, error: error.message || "Copy failed." });
        })
        .finally(() => {
          globalScope.__CHAT_ARCHIVE_RUNNING__ = false;
          currentSession = null;
        });
      return true;
    }

    if (message?.type === "CHAT_ARCHIVE_BUILD_EXPORT") {
      if (currentSession || globalScope.__CHAT_ARCHIVE_RUNNING__) {
        sendResponse({ ok: false, error: "Export already running on this page." });
        return undefined;
      }

      globalScope.__CHAT_ARCHIVE_RUNNING__ = true;
      currentSession = {
        format: message.format,
        options: message.options || {},
        control: app.extractor.createStopController()
      };

      buildExportPayload(message.format, message.options || {}, currentSession.control)
        .then((result) => {
          globalScope.__CHAT_ARCHIVE_LAST_RUN__ = result.summary;
          globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = null;
          sendResponse({ ok: true, payload: result.payload, summary: result.summary });
        })
        .catch((error) => {
          globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = error.message;
          sendResponse({ ok: false, error: error.message || "Export failed." });
        })
        .finally(() => {
          globalScope.__CHAT_ARCHIVE_RUNNING__ = false;
          currentSession = null;
        });
      return true;
    }

    if (message?.type === "CHAT_ARCHIVE_COPY_TO_CLIPBOARD") {
      if (currentSession || globalScope.__CHAT_ARCHIVE_RUNNING__) {
        sendResponse({ ok: false, error: "Export already running on this page." });
        return undefined;
      }

      globalScope.__CHAT_ARCHIVE_RUNNING__ = true;
      currentSession = {
        format: message.format,
        options: message.options || {},
        control: app.extractor.createStopController()
      };

      copyDirectlyToClipboard(message.format, message.options || {}, currentSession.control)
        .then((summary) => {
          globalScope.__CHAT_ARCHIVE_LAST_RUN__ = summary;
          globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = null;
          sendResponse({ ok: true, summary });
        })
        .catch((error) => {
          globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = error.message;
          sendResponse({ ok: false, error: error.message || "Clipboard copy failed." });
        })
        .finally(() => {
          globalScope.__CHAT_ARCHIVE_RUNNING__ = false;
          currentSession = null;
        });
      return true;
    }

    if (message?.type === "CHAT_ARCHIVE_GET_LAST_REPORT") {
      sendResponse({
        ok: true,
        summary: globalScope.__CHAT_ARCHIVE_LAST_RUN__ || null,
        error: globalScope.__CHAT_ARCHIVE_LAST_ERROR__ || null
      });
      return undefined;
    }

    if (message?.type === "CHAT_ARCHIVE_STOP_AND_SAVE") {
      if (!currentSession) {
        sendResponse({ ok: false, error: "No export is currently running." });
        return undefined;
      }

      currentSession.control.stopRequested = true;
      currentSession.control.stopAndSaveRequested = true;
      sendResponse({ ok: true });
      return undefined;
    }

    if (message?.type === "CHAT_ARCHIVE_GET_STATUS") {
      sendResponse({
        ok: true,
        running: Boolean(currentSession),
        summary: globalScope.__CHAT_ARCHIVE_LAST_RUN__ || null,
        error: globalScope.__CHAT_ARCHIVE_LAST_ERROR__ || null
      });
      return undefined;
    }

    if (message?.type !== "CHAT_ARCHIVE_START") {
      return undefined;
    }

    if (currentSession || globalScope.__CHAT_ARCHIVE_RUNNING__) {
      sendResponse({ ok: false, error: "Export already running on this page." });
      return undefined;
    }

    globalScope.__CHAT_ARCHIVE_RUNNING__ = true;
    globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = null;
    currentSession = {
      format: message.format,
      options: message.options || {},
      control: app.extractor.createStopController()
    };

    startExport(message.format, message.options || {}, currentSession.control)
      .then((summary) => {
        globalScope.__CHAT_ARCHIVE_LAST_RUN__ = summary;
        globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = null;
        sendResponse({ ok: true, summary });
      })
      .catch((error) => {
        globalScope.__CHAT_ARCHIVE_LAST_ERROR__ = error.message;
        sendResponse({ ok: false, error: error.message || "Export failed." });
      })
      .finally(() => {
        globalScope.__CHAT_ARCHIVE_RUNNING__ = false;
        currentSession = null;
      });

    return true;
  };

  globalScope.__CHAT_ARCHIVE_RUNNER_HANDLER__ = messageHandler;
  globalScope.chrome.runtime.onMessage.addListener(messageHandler);
})(window);
