(function initializeExporterNamespace(globalScope) {
  if (globalScope.ChatArchive) {
    return;
  }

  globalScope.ChatArchive = {
    version: "1.11.0"
  };
})(window);
