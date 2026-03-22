(function registerExporterUtils(globalScope) {
  const app = globalScope.ChatArchive;

  function toArray(value) {
    return Array.isArray(value) ? value : [value];
  }

  function queryAll(root, selectors) {
    const uniqueNodes = new Set(
      toArray(selectors).flatMap((selector) => Array.from(root.querySelectorAll(selector)))
    );

    return Array.from(uniqueNodes).sort((left, right) => {
      if (left === right) {
        return 0;
      }

      const position = left.compareDocumentPosition(right);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function firstMatch(root, selectors) {
    return toArray(selectors)
      .map((selector) => root.querySelector(selector))
      .find(Boolean) || null;
  }

  function matchesAnySelector(element, selectors) {
    return toArray(selectors).some((selector) => {
      if (!selector) {
        return false;
      }

      return element.matches(selector) || Boolean(element.closest(selector));
    });
  }

  function normalizeWhitespace(text) {
    return (text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function getCookieValue(name) {
    const cookieString = `; ${document.cookie}`;
    const parts = cookieString.split(`; ${name}=`);
    if (parts.length !== 2) {
      return "";
    }

    return parts.pop().split(";").shift() || "";
  }

  function parseJsonSafely(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function collectStatePayloads(globalObject) {
    const payloads = [];
    const stateKeys = [
      "__NEXT_DATA__",
      "__NEXT_ROUTER_DATA__",
      "__INITIAL_STATE__",
      "__PRELOADED_STATE__",
      "__APOLLO_STATE__",
      "__DATA__",
      "__STATE__"
    ];

    stateKeys.forEach((key) => {
      const value = globalObject[key];
      if (value && typeof value === "object") {
        payloads.push({
          source: `window.${key}`,
          value
        });
      }
    });

    Array.from(document.querySelectorAll("script")).forEach((script, index) => {
      const text = script.textContent?.trim();
      if (!text) {
        return;
      }

      if (script.type === "application/json" || script.id === "__NEXT_DATA__") {
        const parsed = parseJsonSafely(text);
        if (parsed && typeof parsed === "object") {
          payloads.push({
            source: script.id ? `script#${script.id}` : `script[${index}]`,
            value: parsed
          });
        }
      }
    });

    return payloads;
  }

  function walkStateObjects(root, visitor, state = { seen: new WeakSet(), depth: 0 }) {
    if (!root || typeof root !== "object") {
      return;
    }

    if (state.seen.has(root) || state.depth > 14) {
      return;
    }

    state.seen.add(root);
    visitor(root);

    const nextState = {
      seen: state.seen,
      depth: state.depth + 1
    };

    if (Array.isArray(root)) {
      root.forEach((item) => walkStateObjects(item, visitor, nextState));
      return;
    }

    Object.values(root).forEach((value) => walkStateObjects(value, visitor, nextState));
  }

  function flattenStateText(value) {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => flattenStateText(item)).filter(Boolean).join("\n\n");
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    const preferredKeys = [
      "text",
      "parts",
      "content",
      "message",
      "body",
      "value",
      "description",
      "caption"
    ];

    for (const key of preferredKeys) {
      if (key in value) {
        const text = flattenStateText(value[key]);
        if (text) {
          return text;
        }
      }
    }

    return "";
  }

  function joinTextSegments(segments) {
    return segments.reduce((output, segment) => {
      if (!segment) {
        return output;
      }

      if (!output) {
        return segment;
      }

      const needsSpace =
        /[A-Za-z0-9)]$/.test(output) &&
        /^[A-Za-z0-9(]/.test(segment) &&
        !output.endsWith("\n") &&
        !segment.startsWith("\n");

      return output + (needsSpace ? " " : "") + segment;
    }, "");
  }

  function extractStructuredText(node) {
    if (!node) {
      return "";
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tagName = node.tagName.toLowerCase();
    if (["script", "style", "noscript"].includes(tagName)) {
      return "";
    }

    if (tagName === "br") {
      return "\n";
    }

    if (tagName === "a") {
      const label = joinTextSegments(
        Array.from(node.childNodes).map((childNode) => extractStructuredText(childNode))
      ).trim();
      const href = node.getAttribute("href");
      if (!href || !label) {
        return label;
      }

      return `[${label}](${href})`;
    }

    const childText = joinTextSegments(
      Array.from(node.childNodes).map((childNode) => extractStructuredText(childNode))
    );

    if (tagName === "li") {
      const orderedList = node.parentElement?.tagName?.toLowerCase() === "ol";
      const itemPrefix = orderedList
        ? `${Array.from(node.parentElement.children).indexOf(node) + 1}. `
        : "- ";
      return `${itemPrefix}${childText.trim()}\n`;
    }

    if (tagName === "blockquote") {
      const quoted = childText
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return `${quoted}\n\n`;
    }

    if (["p", "div", "section", "article"].includes(tagName)) {
      return `${childText.trim()}\n\n`;
    }

    if (/^h[1-6]$/.test(tagName)) {
      const level = Number.parseInt(tagName[1], 10);
      return `${"#".repeat(level)} ${childText.trim()}\n\n`;
    }

    return childText;
  }

  function normalizeMarkdownText(text) {
    return text
      .split(/(```[\s\S]*?```)/g)
      .map((segment, index) => {
        if (index % 2 === 1) {
          return `\n\n${segment.trim()}\n\n`;
        }

        return segment
          .replace(/\r\n/g, "\n")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/[^\S\n]+([.,!?;:])/g, "$1")
          .replace(/([a-z0-9])([A-Z][a-z])/g, "$1 $2")
          .trim();
      })
      .join("")
      .replace(/\n\n- /g, "\n- ")
      .replace(/\n\n\d+\. /g, "\n1. ")
      .replace(/(\n- [^\n]+)\n\n(?=- )/g, "$1\n")
      .replace(/(\n\d+\. [^\n]+)\n\n(?=\d+\. )/g, "$1\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cloneWithoutUiNoise(element, removableSelectors) {
    const clone = element.cloneNode(true);

    queryAll(clone, removableSelectors).forEach((node) => node.remove());

    queryAll(clone, [
      "pre",
      "code",
      "[class*='code']",
      ".code-block",
      ".code-container",
      ".code-block-body"
    ]).forEach((node) => {
      const content = normalizeWhitespace(node.textContent);
      if (!content) {
        return;
      }

      const marker = document.createTextNode(`\n\n\`\`\`\n${content}\n\`\`\`\n\n`);
      node.replaceWith(marker);
    });

    return clone;
  }

  function getCleanText(element, adapter) {
    if (!element) {
      return "";
    }

    const clone = cloneWithoutUiNoise(element, adapter.removableSelectors);
    const rawText =
      typeof clone.innerText === "string" && clone.innerText.trim()
        ? clone.innerText
        : extractStructuredText(clone);
    let text = normalizeMarkdownText(rawText);

    adapter.headerCleanupPatterns.forEach((pattern) => {
      text = text.replace(pattern, "").trim();
    });

    return text;
  }

  function stableMessageKey(message) {
    return `${message.author}::${message.content.slice(0, 160)}`;
  }

  function dedupeMessages(messages) {
    const seen = new Set();
    return messages.filter((message) => {
      const key = stableMessageKey(message);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function inferAlternatingAuthor(index, adapter) {
    if (index % 2 === 0) {
      return adapter.userLabel;
    }

    return adapter.assistantLabel;
  }

  function getScrollableCandidates(root) {
    return Array.from(root.querySelectorAll("*")).filter((element) => {
      const style = globalScope.getComputedStyle(element);
      return (
        element.scrollHeight > element.clientHeight &&
        (style.overflowY === "auto" || style.overflowY === "scroll")
      );
    });
  }

  function countMessagesInCandidate(candidate, adapter) {
    return adapter.strategies.reduce((count, strategy) => {
      return count + queryAll(candidate, strategy.messageSelectors).length;
    }, 0);
  }

  function scoreScrollerCandidate(candidate, adapter) {
    const messageCount = countMessagesInCandidate(candidate, adapter);
    const preferredBonus = matchesAnySelector(candidate, adapter.preferredScrollSelectors) ? 80 : 0;
    const mainBonus =
      candidate.tagName === "MAIN" || candidate.getAttribute("role") === "main" ? 30 : 0;
    const exclusionPenalty = matchesAnySelector(candidate, adapter.excludedScrollSelectors) ? 120 : 0;

    return (
      messageCount * 50 +
      preferredBonus +
      mainBonus +
      Math.min(candidate.clientHeight, 1600) / 10 +
      Math.min(candidate.scrollHeight, 20000) / 200 -
      exclusionPenalty
    );
  }

  function getBestScroller(root, adapter) {
    const scrollers = getScrollableCandidates(root);
    if (scrollers.length === 0) {
      return root.scrollingElement || root.documentElement;
    }

    return scrollers
      .map((candidate) => ({
        candidate,
        score: scoreScrollerCandidate(candidate, adapter)
      }))
      .sort((left, right) => right.score - left.score)[0]?.candidate || root.scrollingElement || root.documentElement;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => globalScope.setTimeout(resolve, milliseconds));
  }

  function slugifyTitle(title) {
    return normalizeWhitespace(title)
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, " ")
      .slice(0, 100);
  }

  app.utils = {
    collectStatePayloads,
    dedupeMessages,
    flattenStateText,
    firstMatch,
    getCleanText,
    getBestScroller,
    inferAlternatingAuthor,
    getCookieValue,
    matchesAnySelector,
    normalizeMarkdownText,
    normalizeWhitespace,
    queryAll,
    parseJsonSafely,
    slugifyTitle,
    stableMessageKey,
    walkStateObjects,
    wait
  };
})(window);
