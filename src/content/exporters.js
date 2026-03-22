(function registerExporters(globalScope) {
  const app = globalScope.ChatArchive;
  const { normalizeWhitespace, slugifyTitle } = app.utils;

  function createMetadata(adapter, options = {}) {
    const now = new Date();
    return {
      title: document.title || "Untitled conversation",
      source: globalScope.location.href,
      exportedAt: now.toISOString(),
      platform: adapter.displayName,
      tags: ["ai-chat-export", adapter.id, "conversation"],
      strategy: options.strategyId || null,
      extractionSource: options.source || "dom",
      partial: Boolean(options.partial),
      messageCount: options.messageCount || 0
    };
  }

  function buildFrontmatterLines(metadata) {
    return [
      "---",
      `title: "${metadata.title.replace(/"/g, '\\"')}"`,
      `source: ${metadata.source}`,
      `exported_at: ${metadata.exportedAt}`,
      `platform: ${metadata.platform}`,
      `strategy: ${metadata.strategy || "unknown"}`,
      `extraction_source: ${metadata.extractionSource}`,
      `partial: ${metadata.partial ? "true" : "false"}`,
      `message_count: ${metadata.messageCount}`,
      `tags: [${metadata.tags.map((tag) => `"${tag}"`).join(", ")}]`,
      "---"
    ];
  }

  function toMarkdown(metadata, messages, options = {}) {
    const sections = [
      ...(options.includeMetadata ? [...buildFrontmatterLines(metadata), ""] : [])
    ];

    messages.forEach((message) => {
      sections.push(`### ${message.author}`);
      sections.push(message.content);
      sections.push("");
      sections.push("---");
      sections.push("");
    });

    return sections.join("\n").trim() + "\n";
  }

  function toObsidianMarkdown(metadata, messages, options = {}) {
    const sections = options.includeMetadata ? [...buildFrontmatterLines(metadata), ""] : [];
    sections.push(`# ${metadata.title}`);
    sections.push("");
    sections.push(`- Platform: ${metadata.platform}`);
    sections.push(`- Extraction source: ${metadata.extractionSource}`);
    sections.push(`- Partial export: ${metadata.partial ? "yes" : "no"}`);
    sections.push(`- Exported: ${metadata.exportedAt}`);
    sections.push(`- Source: ${metadata.source}`);
    sections.push("");

    messages.forEach((message) => {
      sections.push(`## ${message.author}`);
      sections.push(message.content);
      sections.push("");
    });

    return sections.join("\n").trim() + "\n";
  }

  function toText(metadata, messages, options = {}) {
    const lines = options.includeMetadata
      ? [
          `${metadata.title}`,
          `${metadata.platform} | ${metadata.exportedAt}`,
          `${metadata.source}`,
          ""
        ]
      : [];

    messages.forEach((message) => {
      lines.push(`--- ${message.author} ---`);
      lines.push(message.content);
      lines.push("");
    });

    return normalizeWhitespace(lines.join("\n")) + "\n";
  }

  function toJson(metadata, messages) {
    return JSON.stringify(
      {
        metadata,
        messages
      },
      null,
      2
    );
  }

  function buildExportPayload(format, adapter, messages, options = {}) {
    const metadata = createMetadata(adapter, {
      strategyId: options.strategyId,
      source: options.source,
      partial: options.partial,
      messageCount: messages.length
    });
    const normalizedMessages = messages.map((message) => ({
      author: message.author,
      content: message.content
    }));

    const serializers = {
      md: toMarkdown,
      obsidian: toObsidianMarkdown,
      txt: toText,
      json: toJson
    };

    const serializer = serializers[format] || serializers.md;
    const content = serializer(metadata, normalizedMessages, options);
    const dateSlug = metadata.exportedAt.slice(0, 10);
    const fileExtension = format === "obsidian" ? "md" : format;
    const filename = `[${adapter.displayName}] ${slugifyTitle(metadata.title) || "Export"} - ${dateSlug}.${fileExtension}`;
    const mimeType = {
      md: "text/markdown;charset=utf-8",
      obsidian: "text/markdown;charset=utf-8",
      txt: "text/plain;charset=utf-8",
      json: "application/json;charset=utf-8"
    }[format] || "text/plain;charset=utf-8";

    return {
      content,
      filename,
      metadata,
      mimeType
    };
  }

  function triggerDownload(payload) {
    const blob = new Blob([payload.content], { type: payload.mimeType });
    const url = globalScope.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = payload.filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();

    globalScope.setTimeout(() => {
      anchor.remove();
      globalScope.URL.revokeObjectURL(url);
    }, 100);
  }

  app.exporters = {
    buildExportPayload,
    triggerDownload
  };
})(window);
