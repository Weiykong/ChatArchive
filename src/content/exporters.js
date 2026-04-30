(function registerExporters(globalScope) {
  const app = globalScope.ChatArchive;
  const { normalizeWhitespace, slugifyTitle, firstMatch, firstMatchDeep } = app.utils;
  const LINK_TOKEN_PREFIX = "__CHAT_ARCHIVE_LINK_TOKEN__";

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (match) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[match])
    );
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function sanitizeFilenameSegment(value) {
    return normalizeWhitespace(String(value || ""))
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/_+/g, "_")
      .trim();
  }

  function escapeCsvField(value) {
    const text = String(value ?? "");
    if (!/[",\n]/.test(text)) {
      return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
  }

  function isGenericTitle(title, adapter) {
    const normalizedTitle = normalizeWhitespace(String(title || ""));
    if (!normalizedTitle) {
      return true;
    }

    if (normalizedTitle.toLowerCase() === adapter.displayName.toLowerCase()) {
      return true;
    }

    return Array.isArray(adapter.titleIgnorePatterns)
      && adapter.titleIgnorePatterns.some((pattern) => pattern.test(normalizedTitle));
  }

  function isWeakDerivedTitle(title, adapter) {
    const normalizedTitle = normalizeWhitespace(String(title || ""));
    if (!normalizedTitle) {
      return true;
    }

    if (isGenericTitle(normalizedTitle, adapter)) {
      return true;
    }

    return /^(said|you said|copilot said)$/i.test(normalizedTitle);
  }

  function scoreDerivedTitleCandidate(title, author, adapter) {
    const normalizedTitle = normalizeWhitespace(String(title || ""));
    if (!normalizedTitle || isWeakDerivedTitle(normalizedTitle, adapter)) {
      return -Infinity;
    }

    if (
      /^(in english|english here|en français ici|en francais ici|comment this)$/i.test(normalizedTitle)
      || /^answer in english\b/i.test(normalizedTitle)
      || /^play with [^?]+\??$/i.test(normalizedTitle)
    ) {
      return -Infinity;
    }

    let score = Math.min(normalizedTitle.length, 160);
    const normalizedAuthor = normalizeWhitespace(author || "").toLowerCase();

    if (
      normalizedAuthor === normalizeWhitespace(adapter.userLabel || "").toLowerCase()
      || normalizedAuthor === "you"
      || normalizedAuthor === "user"
    ) {
      score += 40;
    }

    if (normalizedTitle.length < 12) {
      score -= 80;
    } else if (normalizedTitle.length < 24) {
      score -= 25;
    }

    if (normalizedTitle.length > 140) {
      score -= 35;
    }

    if (/[?.!]/.test(normalizedTitle)) {
      score += 10;
    }

    return score;
  }

  function deriveTitleFromMessages(messages, adapter) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return "";
    }

    let bestCandidate = "";
    let bestScore = -Infinity;

    messages.forEach((candidate) => {
      const content = normalizeWhitespace(candidate?.content || "");
      if (!content) {
        return;
      }

      const firstParagraph = normalizeWhitespace(content.split(/\n{2,}/)[0] || content);
      const condensed = firstParagraph.replace(/\s+/g, " ").trim();
      const score = scoreDerivedTitleCandidate(condensed, candidate?.author, adapter);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = condensed;
      }
    });

    if (!bestCandidate || !Number.isFinite(bestScore)) {
      return "";
    }

    return bestCandidate.length > 120 ? `${bestCandidate.slice(0, 117).trimEnd()}...` : bestCandidate;
  }

  function renderInlineRichText(value) {
    const tokens = [];
    let tokenized = String(value ?? "").replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, label, url) => {
        const token = `${LINK_TOKEN_PREFIX}${tokens.length}__`;
        tokens.push(
          `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`
        );
        return token;
      }
    );

    tokenized = escapeHtml(tokenized).replace(/`([^`\n]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

    tokens.forEach((linkHtml, index) => {
      const token = `${LINK_TOKEN_PREFIX}${index}__`;
      tokenized = tokenized.replace(token, linkHtml);
    });

    return tokenized;
  }

  function isOrderedListItem(line) {
    return /^\d+\.\s+/.test(line);
  }

  function isUnorderedListItem(line) {
    return /^[-*]\s+/.test(line);
  }

  function isSpecialBlockStart(line) {
    return /^```/.test(line)
      || /^#{1,6}\s+/.test(line)
      || /^>\s?/.test(line)
      || isOrderedListItem(line)
      || isUnorderedListItem(line)
      || /^---$/.test(line.trim());
  }

  function renderParagraph(lines) {
    return `<p>${lines.map((line) => renderInlineRichText(line)).join("<br>")}</p>`;
  }

  function renderQuoteBlock(lines) {
    const quoteContent = lines.map((line) => line.replace(/^>\s?/, ""));
    const paragraphs = [];
    let current = [];

    quoteContent.forEach((line) => {
      if (!line.trim()) {
        if (current.length) {
          paragraphs.push(renderParagraph(current));
          current = [];
        }
        return;
      }

      current.push(line);
    });

    if (current.length) {
      paragraphs.push(renderParagraph(current));
    }

    return `<blockquote>${paragraphs.join("")}</blockquote>`;
  }

  function renderListBlock(lines, ordered) {
    const tag = ordered ? "ol" : "ul";
    const items = [];
    let currentItem = null;

    lines.forEach((line) => {
      const pattern = ordered ? /^\d+\.\s+(.*)$/ : /^[-*]\s+(.*)$/;
      const match = line.match(pattern);

      if (match) {
        currentItem = [match[1]];
        items.push(currentItem);
        return;
      }

      if (currentItem && /^\s{2,}\S/.test(line)) {
        currentItem.push(line.trim());
      }
    });

    return `<${tag}>${items.map((item) => `<li>${item.map((part) => renderInlineRichText(part)).join("<br>")}</li>`).join("")}</${tag}>`;
  }

  function renderMessageContent(content) {
    const normalizedContent = String(content ?? "").replace(/\r\n?/g, "\n");
    const lines = normalizedContent.split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (/^```/.test(line)) {
        const language = (line.slice(3).trim() || "").replace(/[^\w+-]/g, "");
        const codeLines = [];
        index += 1;

        while (index < lines.length && !/^```/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }

        if (index < lines.length) {
          index += 1;
        }

        const languageLabel = language ? `<div class="code-language">${escapeHtml(language)}</div>` : "";
        blocks.push(
          `<section class="code-block">${languageLabel}<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></section>`
        );
        continue;
      }

      if (/^#{1,6}\s+/.test(line)) {
        const [, hashes, headingText] = line.match(/^(#{1,6})\s+(.*)$/);
        blocks.push(`<h${hashes.length}>${renderInlineRichText(headingText)}</h${hashes.length}>`);
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quoteLines = [];

        while (index < lines.length && (lines[index].trim() === "" || /^>\s?/.test(lines[index]))) {
          quoteLines.push(lines[index]);
          index += 1;
        }

        blocks.push(renderQuoteBlock(quoteLines));
        continue;
      }

      if (isUnorderedListItem(line) || isOrderedListItem(line)) {
        const ordered = isOrderedListItem(line);
        const listLines = [];

        while (
          index < lines.length
          && (
            lines[index].trim() === ""
            || (ordered ? isOrderedListItem(lines[index]) : isUnorderedListItem(lines[index]))
            || /^\s{2,}\S/.test(lines[index])
          )
        ) {
          if (lines[index].trim()) {
            listLines.push(lines[index]);
          }
          index += 1;
        }

        blocks.push(renderListBlock(listLines, ordered));
        continue;
      }

      if (/^---$/.test(line.trim())) {
        blocks.push("<hr>");
        index += 1;
        continue;
      }

      const paragraphLines = [line];
      index += 1;

      while (index < lines.length && lines[index].trim() && !isSpecialBlockStart(lines[index])) {
        paragraphLines.push(lines[index]);
        index += 1;
      }

      blocks.push(renderParagraph(paragraphLines));
    }

    return blocks.join("\n");
  }

  function getMessageTone(author) {
    const normalized = String(author || "").trim().toLowerCase();
    if (normalized === "you" || normalized === "user") {
      return "user";
    }

    return "assistant";
  }

  function buildDocumentStyles(renderTarget) {
    const isPrint = renderTarget === "pdf";

    return `
      :root {
        color-scheme: light;
        --page-bg: ${isPrint ? "#e9eef4" : "#eef3f8"};
        --paper-bg: #ffffff;
        --text: #1f2937;
        --muted: #5b6472;
        --line: #d9e2ec;
        --panel: #f6f8fb;
        --accent: #185adb;
        --assistant-accent: #0f766e;
        --user-surface: #edf4ff;
        --assistant-surface: #f3faf7;
        --shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
      }

      * { box-sizing: border-box; }

      html {
        font-size: 16px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        margin: 0;
        background: var(--page-bg);
        color: var(--text);
        font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
        line-height: 1.65;
        padding: ${isPrint ? "24px" : "40px 24px"};
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      .print-toolbar {
        position: sticky;
        top: 16px;
        z-index: 10;
        display: ${isPrint ? "flex" : "none"};
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        max-width: 920px;
        margin: 0 auto 18px;
        padding: 12px 16px;
        border-radius: 14px;
        border: 1px solid rgba(24, 90, 219, 0.12);
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(14px);
        box-shadow: 0 14px 36px rgba(15, 23, 42, 0.08);
      }

      .print-toolbar button {
        border: none;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font: inherit;
        font-weight: 600;
        padding: 10px 16px;
        cursor: pointer;
      }

      .print-toolbar span {
        font-size: 0.92rem;
        color: var(--muted);
      }

      .document-shell {
        max-width: 920px;
        margin: 0 auto;
        background: var(--paper-bg);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .document-header {
        padding: 44px 48px 28px;
        background:
          radial-gradient(circle at top right, rgba(24, 90, 219, 0.14), transparent 40%),
          linear-gradient(160deg, #f8fbff 0%, #ffffff 60%);
        border-bottom: 1px solid var(--line);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(24, 90, 219, 0.08);
        color: var(--accent);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .document-title {
        margin: 0;
        font-size: 2rem;
        line-height: 1.12;
        letter-spacing: -0.03em;
      }

      .document-subtitle {
        margin: 12px 0 0;
        max-width: 680px;
        color: var(--muted);
      }

      .metadata-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-top: 24px;
      }

      .metadata-card {
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.86);
      }

      .metadata-label {
        display: block;
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .metadata-value {
        margin: 0;
        font-size: 0.98rem;
        overflow-wrap: anywhere;
      }

      .conversation {
        padding: 28px 28px 40px;
      }

      .conversation-heading {
        margin: 0 0 18px;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .message-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .message {
        border: 1px solid var(--line);
        border-left-width: 5px;
        border-radius: 20px;
        padding: 20px 22px;
        background: var(--panel);
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .message-user {
        border-left-color: var(--accent);
        background: var(--user-surface);
      }

      .message-assistant {
        border-left-color: var(--assistant-accent);
        background: var(--assistant-surface);
      }

      .message-meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .message-author {
        font-size: 1rem;
        font-weight: 700;
      }

      .message-role {
        color: var(--muted);
        font-size: 0.84rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .message-content > :first-child {
        margin-top: 0;
      }

      .message-content > :last-child {
        margin-bottom: 0;
      }

      .message-content p,
      .message-content ul,
      .message-content ol,
      .message-content blockquote,
      .message-content pre,
      .message-content hr {
        margin: 0 0 14px;
      }

      .message-content h1,
      .message-content h2,
      .message-content h3,
      .message-content h4,
      .message-content h5,
      .message-content h6 {
        margin: 22px 0 12px;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }

      .message-content h1 { font-size: 1.5rem; }
      .message-content h2 { font-size: 1.3rem; }
      .message-content h3 { font-size: 1.15rem; }

      .message-content ul,
      .message-content ol {
        padding-left: 22px;
      }

      .message-content li + li {
        margin-top: 8px;
      }

      .message-content blockquote {
        padding: 14px 16px;
        border-left: 4px solid rgba(24, 90, 219, 0.28);
        border-radius: 0 14px 14px 0;
        background: rgba(24, 90, 219, 0.05);
        color: #344054;
      }

      .code-block {
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 16px;
        background: #0f172a;
        color: #e2e8f0;
        overflow: hidden;
      }

      .code-language {
        padding: 10px 14px 0;
        color: #8da2c0;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .message-content pre {
        margin: 0;
        padding: 14px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SFMono-Regular", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
        font-size: 0.88rem;
        line-height: 1.5;
      }

      .message-content code {
        font-family: "SFMono-Regular", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
      }

      .message-content p code,
      .message-content li code,
      .message-content blockquote code {
        padding: 0.15em 0.35em;
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.07);
        font-size: 0.92em;
      }

      .message-content hr {
        border: none;
        border-top: 1px solid var(--line);
      }

      .footer-note {
        padding: 0 28px 28px;
        color: var(--muted);
        font-size: 0.84rem;
      }

      @page {
        size: auto;
        margin: 14mm;
      }

      @media print {
        body {
          background: #ffffff;
          padding: 0;
        }

        .print-toolbar {
          display: none !important;
        }

        .document-shell {
          max-width: none;
          border: none;
          border-radius: 0;
          box-shadow: none;
        }

        .document-header {
          padding-top: 0;
        }

        .message {
          box-shadow: none;
        }
      }

      @media (max-width: 720px) {
        body {
          padding: 16px;
        }

        .document-header,
        .conversation,
        .footer-note {
          padding-left: 20px;
          padding-right: 20px;
        }

        .document-title {
          font-size: 1.65rem;
        }

        .print-toolbar {
          margin-bottom: 12px;
          padding: 12px;
        }
      }
    `;
  }

  function renderMetadataCard(label, value) {
    return `<div class="metadata-card"><span class="metadata-label">${escapeHtml(label)}</span><p class="metadata-value">${value}</p></div>`;
  }

  function createMetadata(adapter, options = {}) {
    const now = new Date();

    let title = normalizeWhitespace(options.title || "");

    if (!title && adapter.titleSelectors) {
      for (const selector of adapter.titleSelectors) {
        const titleElement = firstMatch(document, selector) || firstMatchDeep(document, [selector]);
        const candidateTitle = normalizeWhitespace(titleElement?.textContent || titleElement?.innerText);
        if (!isGenericTitle(candidateTitle, adapter)) {
          title = candidateTitle;
          break;
        }
      }
    }

    if (isGenericTitle(title, adapter)) {
      const documentTitle = normalizeWhitespace(document.title || "");
      title = isGenericTitle(documentTitle, adapter) ? "" : documentTitle;
    }

    if (!title) {
      title = deriveTitleFromMessages(options.messages, adapter);
    }

    if (!title) {
      title = "Untitled conversation";
    }

    return {
      title,
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

  function toCsv(metadata, messages, options = {}) {
    const baseHeaders = ["index", "author", "content"];
    const metadataHeaders = options.includeMetadata
      ? [
          "platform",
          "source",
          "strategy",
          "partial",
          "exported_at",
          "title",
          "conversation_url"
        ]
      : [];
    const headers = [...baseHeaders, ...metadataHeaders];
    const rows = [headers.join(",")];

    messages.forEach((message, index) => {
      const row = [index + 1, message.author, message.content];
      if (options.includeMetadata) {
        row.push(
          metadata.platform,
          metadata.extractionSource,
          metadata.strategy || "unknown",
          metadata.partial ? "true" : "false",
          metadata.exportedAt,
          metadata.title,
          metadata.source
        );
      }

      rows.push(row.map((value) => escapeCsvField(value)).join(","));
    });

    return rows.join("\n") + "\n";
  }

  function toHtml(metadata, messages, options = {}) {
    const renderTarget = options.renderTarget || "html";
    const styles = buildDocumentStyles(renderTarget);
    const documentTitle = options.documentTitle || metadata.title;
    const toolbar = renderTarget === "pdf"
      ? `  <div class="print-toolbar">
    <button type="button" class="print-trigger" data-print-trigger="true">Print / Save as PDF</button>
    <span>Print-ready layout generated locally by ChatArchive.</span>
  </div>
`
      : "";
    const metadataCards = [
      renderMetadataCard("Platform", escapeHtml(metadata.platform)),
      renderMetadataCard("Messages", escapeHtml(String(metadata.messageCount))),
      renderMetadataCard("Exported", escapeHtml(metadata.exportedAt))
    ];

    if (options.includeMetadata) {
      metadataCards.push(
        renderMetadataCard(
          "Source",
          `<a href="${escapeAttribute(metadata.source)}" target="_blank" rel="noreferrer noopener">${escapeHtml(metadata.source)}</a>`
        )
      );
      metadataCards.push(renderMetadataCard("Extraction", escapeHtml(metadata.extractionSource)));
      metadataCards.push(renderMetadataCard("Strategy", escapeHtml(metadata.strategy || "unknown")));
    }

    const messageMarkup = messages.map((message) => {
      const tone = getMessageTone(message.author);
      const roleLabel = tone === "user" ? "Prompt" : "Response";
      return `      <article class="message message-${tone}">
        <div class="message-meta">
          <div class="message-author">${escapeHtml(message.author)}</div>
          <div class="message-role">${roleLabel}</div>
        </div>
        <div class="message-content">
${renderMessageContent(message.content).split("\n").map((line) => `          ${line}`).join("\n")}
        </div>
      </article>`;
    }).join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle)}</title>
  <style>${styles}</style>
</head>
<body>
${toolbar}  <main class="document-shell">
    <header class="document-header">
      <div class="eyebrow">${escapeHtml(metadata.platform)} Conversation Export</div>
      <h1 class="document-title">${escapeHtml(metadata.title)}</h1>
      <p class="document-subtitle">A clean, print-friendly rendering of the captured conversation with structured message blocks and preserved formatting.</p>
      <section class="metadata-grid">
        ${metadataCards.join("\n        ")}
      </section>
    </header>
    <section class="conversation">
      <h2 class="conversation-heading">Transcript</h2>
      <div class="message-list">
${messageMarkup}
      </div>
    </section>
    <footer class="footer-note">Generated locally by ChatArchive. Content stays in the browser context unless you explicitly share it.</footer>
  </main>
</body>
</html>`;
  }

  function buildFilename(adapter, metadata, format, options = {}) {
    const dateSlug = metadata.exportedAt.slice(0, 10);
    const timeSlug = metadata.exportedAt.slice(11, 19).replace(/:/g, "-");
    const fileExtension = format === "obsidian" ? "md" : format;
    const tokenValues = {
      platform: adapter.displayName,
      title: slugifyTitle(metadata.title) || "Export",
      date: dateSlug,
      time: timeSlug,
      source: metadata.extractionSource || "dom",
      strategy: metadata.strategy || "unknown",
      count: String(metadata.messageCount || 0)
    };

    const fallbackName = `[${adapter.displayName}] ${tokenValues.title} - ${dateSlug}`;
    const templateName = options.filenameTemplate
      ? options.filenameTemplate.replace(/\{(\w+)\}/g, (_, token) => tokenValues[token] || "")
      : fallbackName;
    const sanitizedName = sanitizeFilenameSegment(templateName) || sanitizeFilenameSegment(fallbackName);
    const filename = sanitizedName.endsWith(`.${fileExtension}`)
      ? sanitizedName
      : `${sanitizedName}.${fileExtension}`;

    return {
      filename,
      fileExtension
    };
  }

  function buildExportPayload(format, adapter, messages, options = {}) {
    const metadata = createMetadata(adapter, {
      strategyId: options.strategyId,
      source: options.source,
      partial: options.partial,
      messageCount: messages.length,
      title: options.title,
      messages
    });
    const normalizedMessages = messages.map((message) => ({
      author: message.author,
      content: message.content
    }));

    const serializers = {
      md: toMarkdown,
      obsidian: toObsidianMarkdown,
      txt: toText,
      json: toJson,
      csv: toCsv,
      html: toHtml,
      pdf: (pdfMetadata, pdfMessages, pdfOptions) =>
        toHtml(pdfMetadata, pdfMessages, {
          ...pdfOptions,
          renderTarget: "pdf"
        })
    };

    const serializer = serializers[format] || serializers.md;
    const { filename } = buildFilename(adapter, metadata, format, options);
    const content = serializer(metadata, normalizedMessages, {
      ...options,
      documentTitle: filename.replace(/\.[^.]+$/, "")
    });

    const mimeType = {
      md: "text/markdown;charset=utf-8",
      obsidian: "text/markdown;charset=utf-8",
      txt: "text/plain;charset=utf-8",
      json: "application/json;charset=utf-8",
      csv: "text/csv;charset=utf-8",
      html: "text/html;charset=utf-8",
      pdf: "text/html;charset=utf-8"
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
