(async function bootstrapPrintView() {
  const status = document.getElementById("status");
  const retryButton = document.getElementById("retryButton");
  const jobKey = new URLSearchParams(window.location.search).get("job");

  if (!jobKey) {
    status.textContent = "Missing print job. Start the PDF export again from ChatArchive.";
    return;
  }

  try {
    const stored = await chrome.storage.local.get(jobKey);
    const job = stored[jobKey];

    await chrome.storage.local.remove(jobKey);

    if (!job?.content || !job.filename) {
      throw new Error("Print job expired before the PDF view loaded.");
    }

    document.open();
    document.write(job.content);
    document.close();
    installPrintControls();
    scheduleAutoPrint();
  } catch (error) {
    status.textContent = error.message || "Unable to prepare the PDF export.";
    retryButton.style.display = "inline-flex";
    retryButton.addEventListener("click", () => window.location.reload(), { once: true });
  }
})();

function installPrintControls() {
  const printNow = () => {
    try {
      window.focus();
      window.print();
    } catch {
      // Ignore and leave the manual buttons visible.
    }
  };

  document.querySelectorAll("[data-print-trigger='true']").forEach((button) => {
    button.addEventListener("click", printNow);
  });

  const floatingButton = document.createElement("button");
  floatingButton.type = "button";
  floatingButton.textContent = "Print / Save as PDF";
  floatingButton.className = "chatarchive-print-button";
  floatingButton.style.position = "fixed";
  floatingButton.style.right = "20px";
  floatingButton.style.bottom = "20px";
  floatingButton.style.zIndex = "9999";
  floatingButton.style.border = "none";
  floatingButton.style.borderRadius = "999px";
  floatingButton.style.background = "#185adb";
  floatingButton.style.color = "#ffffff";
  floatingButton.style.padding = "12px 18px";
  floatingButton.style.font = "600 14px/1.2 Inter, Segoe UI, sans-serif";
  floatingButton.style.cursor = "pointer";
  floatingButton.style.boxShadow = "0 14px 36px rgba(15, 23, 42, 0.18)";
  floatingButton.addEventListener("click", printNow);
  document.body.appendChild(floatingButton);

  const printMedia = document.createElement("style");
  printMedia.textContent = "@media print { .chatarchive-print-button { display: none !important; } }";
  document.head.appendChild(printMedia);
}

function scheduleAutoPrint() {
  const printNow = () => {
    try {
      window.focus();
      window.print();
    } catch {
      // Ignore and allow manual retry.
    }
  };

  const launch = () => window.setTimeout(printNow, 180);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(launch);
    return;
  }

  launch();
}
