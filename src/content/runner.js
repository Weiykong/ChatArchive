(function registerRunner(globalScope) {
  if (globalScope.__CHAT_ARCHIVE_RUNNER_INSTALLED__) {
    return;
  }

  globalScope.__CHAT_ARCHIVE_RUNNER_INSTALLED__ = true;

  const app = globalScope.ChatArchive;
  let currentSession = null;

  async function startExport(format, options = {}, control = app.extractor.createStopController()) {
    const extraction = await app.extractor.extractConversation(document, control);
    const payload = app.exporters.buildExportPayload(
      format,
      extraction.adapter,
      extraction.messages,
      {
        ...options,
        strategyId: extraction.strategyId,
        source: extraction.source,
        partial: extraction.partial
      }
    );

    app.exporters.triggerDownload(payload);

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

  if (!globalScope.chrome?.runtime?.onMessage) {
    return;
  }

  globalScope.chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  });
})(window);
