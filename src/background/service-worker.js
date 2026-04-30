const INJECTED_FILES = [
  "src/content/namespace.js",
  "src/content/utils.js",
  "src/content/platforms.js",
  "src/content/extractor.js",
  "src/content/exporters.js",
  "src/content/runner.js"
];

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (!tab?.id || !tab.url?.startsWith("http")) {
    return;
  }

  if (command === "stop-and-save-export") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "CHAT_ARCHIVE_STOP_AND_SAVE"
      });
    } catch {
      // Ignore
    }
    return;
  }

  if (command === "copy-chat-to-clipboard") {
    async function requestClipboardCopy() {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "CHAT_ARCHIVE_COPY_TO_CLIPBOARD",
        format: "md",
        options: { includeMetadata: true }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Unable to copy chat.");
      }
    }

    try {
      await requestClipboardCopy();
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: INJECTED_FILES
        });
        await requestClipboardCopy();
      } catch (err) {
        console.error("Failed to copy chat via shortcut:", err);
      }
    }
  }
});
