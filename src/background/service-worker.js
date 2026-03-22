chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "stop-and-save-export") {
    return;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "CHAT_ARCHIVE_STOP_AND_SAVE"
    });
  } catch {
    // Ignore tabs that do not have the exporter injected.
  }
});
