(function initializeExporterNamespace(globalScope) {
  const existing = globalScope.ChatArchive || {};
  globalScope.ChatArchive = {
    ...existing,
    version: "1.13.0"
  };
})(window);
