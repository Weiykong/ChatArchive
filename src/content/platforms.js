(function registerPlatformAdapters(globalScope) {
  const app = globalScope.ChatArchive;

  const COMMON_REMOVALS = [
    "button",
    ".action-buttons",
    ".copy-button",
    ".sr-only",
    ".v-tooltip",
    ".code-block-decoration",
    ".text-xs",
    "[aria-hidden='true']"
  ];

  const adapters = [
    {
      id: "chatgpt",
      hostPatterns: ["chatgpt.com"],
      displayName: "ChatGPT",
      userLabel: "You",
      assistantLabel: "ChatGPT",
      preferStateExtraction: true,
      removableSelectors: COMMON_REMOVALS,
      headerCleanupPatterns: [/^(ChatGPT|You)\s*/i],
      preferredScrollSelectors: [
        "main",
        "[role='main']",
        "article",
        "[data-testid^='conversation-turn-']"
      ],
      excludedScrollSelectors: [
        "nav",
        "aside",
        "[data-testid*='history']",
        "[data-testid*='sidebar']",
        "[class*='sidebar']"
      ],
      strategies: [
        {
          id: "role-attributes",
          messageSelectors: ["[data-message-author-role]", "[data-testid^='conversation-turn-']"],
          contentSelectors: [".prose", "[data-message-author-role]"]
        },
        {
          id: "article-blocks",
          messageSelectors: ["article"],
          contentSelectors: [".prose", "article"]
        },
        {
          id: "generic-articles",
          messageSelectors: ["[role='article']"],
          contentSelectors: [".prose", "[role='article']"]
        }
      ],
      async extractFromState(globalObject) {
        const messages = extractChatGptStateMessages(globalObject);
        return {
          strategyId: "chatgpt-state",
          messages,
          score: messages.length * 18
        };
      },
      inferAuthor(messageNode, authorElement, textContent) {
        const role =
          messageNode.getAttribute("data-message-author-role") ||
          authorElement?.getAttribute("data-message-author-role") ||
          "";

        if (role === "user") {
          return "You";
        }

        if (role === "assistant") {
          return "ChatGPT";
        }

        if (/^you\b/i.test(textContent)) {
          return "You";
        }

        if (/chatgpt/i.test(textContent)) {
          return "ChatGPT";
        }

        return null;
      }
    },
    {
      id: "gemini",
      hostPatterns: ["gemini.google.com"],
      displayName: "Gemini",
      userLabel: "You",
      assistantLabel: "Gemini",
      preferStateExtraction: true,
      removableSelectors: COMMON_REMOVALS,
      headerCleanupPatterns: [/^(You said|Gemini said|Google Gemini|Draft \d+|View other drafts)\s*/gi],
      preferredScrollSelectors: ["main", "[role='main']", ".conversation-container"],
      excludedScrollSelectors: ["nav", "aside", "[class*='sidebar']"],
      strategies: [
        {
          id: "semantic-tags",
          messageSelectors: ["user-query", "model-response"],
          contentSelectors: [".query-text", ".message-content", ".markdown", ".model-response-text"]
        },
        {
          id: "conversation-blocks",
          messageSelectors: [".query-content", ".model-response", "[role='article']"],
          contentSelectors: [".query-text", ".message-content", ".message-content-inner", ".markdown"]
        },
        {
          id: "container-fallback",
          messageSelectors: [".conversation-container > div"],
          contentSelectors: [".query-text", ".markdown", ".message-content", "div"]
        }
      ],
      async extractFromState(globalObject) {
        const messages = extractGeminiStateMessages(globalObject);
        return {
          strategyId: "gemini-state",
          messages,
          score: messages.length * 18
        };
      },
      inferAuthor(messageNode, authorElement, textContent) {
        if (messageNode.tagName === "USER-QUERY" || messageNode.classList.contains("query-content")) {
          return "You";
        }

        if (messageNode.tagName === "MODEL-RESPONSE" || messageNode.classList.contains("model-response")) {
          return "Gemini";
        }

        if (/you said/i.test(textContent)) {
          return "You";
        }

        if (/gemini/i.test(textContent)) {
          return "Gemini";
        }

        return authorElement?.textContent?.trim() || null;
      }
    },
    {
      id: "deepseek",
      hostPatterns: ["chat.deepseek.com"],
      displayName: "DeepSeek",
      userLabel: "You",
      assistantLabel: "DeepSeek",
      preferApiExtraction: true,
      removableSelectors: COMMON_REMOVALS,
      headerCleanupPatterns: [/^(DeepSeek|You)\s*/i],
      preferredScrollSelectors: ["main", "[role='main']", "[class*='chat']", "[class*='message']"],
      excludedScrollSelectors: ["nav", "aside", "[class*='sidebar']"],
      strategies: [
        {
          id: "deepseek-generic",
          messageSelectors: [
            "[class*='message']",
            "[class*='conversation'] [class*='item']",
            "[role='article']",
            "article"
          ],
          contentSelectors: [
            ".prose",
            ".markdown",
            "[class*='content']",
            "[class*='text']",
            "article"
          ]
        }
      ],
      async fetchConversation(globalObject) {
        const { getCookieValue, normalizeWhitespace, flattenStateText } = app.utils;
        const sessionId = getDeepSeekSessionId(globalObject.location);
        const token = getDeepSeekToken(globalObject, getCookieValue);

        if (!sessionId) {
          throw new Error("DeepSeek session id not found in the current URL.");
        }

        if (!token) {
          throw new Error("DeepSeek auth token not available.");
        }

        const response = await globalObject.fetch(
          `https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(sessionId)}`,
          {
            method: "GET",
            credentials: "include",
            headers: makeDeepSeekHeaders(globalObject, token)
          }
        );

        if (!response.ok) {
          throw new Error(`DeepSeek API export failed with status ${response.status}.`);
        }

        const data = await response.json();
        const rawMessages = data?.data?.biz_data?.chat_messages || [];
        const messages = rawMessages
          .map((message) => {
            const author = inferDeepSeekApiAuthor(message);
            const content = normalizeWhitespace(
              flattenStateText(message?.content) ||
                flattenStateText(message?.message) ||
                flattenStateText(message?.text) ||
                flattenStateText(message)
            );

            return {
              author,
              content,
              strategy: "deepseek-api"
            };
          })
          .filter((message) => message.content);

        return {
          strategyId: "deepseek-api",
          messages,
          score: messages.length * 20
        };
      },
      inferAuthor(messageNode, authorElement, textContent) {
        if (messageNode.matches("[data-role='user'], [data-author='user']")) {
          return "You";
        }

        if (messageNode.matches("[data-role='assistant'], [data-author='assistant']")) {
          return "DeepSeek";
        }

        if (/^you\b/i.test(textContent)) {
          return "You";
        }

        if (/deepseek/i.test(textContent)) {
          return "DeepSeek";
        }

        return authorElement?.textContent?.trim() || null;
      }
    },
    {
      id: "grok",
      hostPatterns: ["grok.com"],
      displayName: "Grok",
      userLabel: "You",
      assistantLabel: "Grok",
      removableSelectors: COMMON_REMOVALS,
      headerCleanupPatterns: [/^(Grok|You)\s*/i],
      preferredScrollSelectors: [
        "#last-reply-container",
        "main",
        "[role='main']",
        "[class*='message']"
      ],
      excludedScrollSelectors: ["nav", "aside", "[class*='sidebar']"],
      strategies: [
        {
          id: "grok-bubbles",
          messageSelectors: [
            "div.message-bubble",
            "#last-reply-container > *",
            "[class*='conversation'] > [class*='message']",
            "article"
          ],
          contentSelectors: [
            ".prose",
            ".markdown",
            "[class*='message-content']",
            "[class*='content']",
            "article"
          ]
        },
        {
          id: "grok-generic",
          messageSelectors: [
            "[role='article']",
            "[data-role][class*='message']",
            "[data-author][class*='message']",
            ".message-bubble"
          ],
          contentSelectors: [".prose", ".markdown", "[class*='content']", "[role='article']"]
        }
      ],
      inferAuthor(messageNode, authorElement, textContent) {
        if (messageNode.matches("[data-role='user'], [data-author='user'], [class*='user']")) {
          return "You";
        }

        if (
          messageNode.matches(
            "[data-role='assistant'], [data-author='assistant'], [class*='assistant'], [class*='grok']"
          )
        ) {
          return "Grok";
        }

        if (/^you\b/i.test(textContent)) {
          return "You";
        }

        if (/grok/i.test(textContent)) {
          return "Grok";
        }

        return authorElement?.textContent?.trim() || null;
      }
    },
    {
      id: "perplexity",
      hostPatterns: ["perplexity.ai"],
      displayName: "Perplexity",
      userLabel: "You",
      assistantLabel: "Perplexity",
      preferPageExtraction: true,
      removableSelectors: COMMON_REMOVALS,
      headerCleanupPatterns: [/^(Perplexity|You)\s*/i],
      preferredScrollSelectors: ["main", "[role='main']", "[class*='thread']", "[class*='message']"],
      excludedScrollSelectors: ["nav", "aside", "[class*='sidebar']"],
      strategies: [
        {
          id: "perplexity-thread",
          messageSelectors: [
            "[data-testid='user-message']",
            "[data-testid='assistant-message']",
            ".thread-message",
            "article"
          ],
          contentSelectors: [
            ".prose",
            ".markdown",
            ".thread-message-content",
            "[class*='content']",
            "article"
          ]
        },
        {
          id: "perplexity-generic",
          messageSelectors: [
            "[data-role][class*='message']",
            "[data-author][class*='message']",
            "[role='article']"
          ],
          contentSelectors: [".prose", ".markdown", "[class*='content']", "[role='article']"]
        }
      ],
      async extractFromPage(globalObject) {
        const messages = extractPerplexityPageMessages(globalObject.document, this);
        return {
          strategyId: "perplexity-page",
          messages,
          score: messages.length * 16
        };
      },
      inferAuthor(messageNode, authorElement, textContent) {
        if (messageNode.matches("[data-role='user'], [data-author='user'], [class*='user']")) {
          return "You";
        }

        if (
          messageNode.matches(
            "[data-role='assistant'], [data-author='assistant'], [class*='assistant'], [class*='perplexity']"
          )
        ) {
          return "Perplexity";
        }

        if (/^you\b/i.test(textContent)) {
          return "You";
        }

        if (/perplexity/i.test(textContent)) {
          return "Perplexity";
        }

        return authorElement?.textContent?.trim() || null;
      }
    },
    {
      id: "claude",
      hostPatterns: ["claude.ai"],
      displayName: "Claude",
      userLabel: "You",
      assistantLabel: "Claude",
      preferApiExtraction: true,
      removableSelectors: COMMON_REMOVALS,
      headerCleanupPatterns: [/^(Claude|You)\s*/i],
      preferredScrollSelectors: ["main", "[role='main']", "[data-testid='chat-message']"],
      excludedScrollSelectors: ["nav", "aside", "[class*='sidebar']"],
      strategies: [
        {
          id: "testid-selectors",
          messageSelectors: [
            "[data-testid='user-message']",
            "[data-testid='assistant-message']",
            "[data-testid='chat-message']",
            "[data-is-streaming='true']",
            ".font-claude-message"
          ],
          contentSelectors: [
            ".grid-cols-1",
            ".prose",
            ".whitespace-pre-wrap",
            "[data-testid='message-content']",
            "[data-is-streaming]",
            ".font-claude-message"
          ]
        },
        {
          id: "claude-layout",
          messageSelectors: [
            ".font-claude-message",
            "[data-testid='chat-message']",
            "[data-is-streaming='true']",
            "main article"
          ],
          contentSelectors: [
            ".grid-cols-1",
            ".prose",
            ".whitespace-pre-wrap",
            "[data-testid='message-content']",
            ".font-claude-message"
          ]
        },
        {
          id: "generic-articles",
          messageSelectors: ["article", "[role='article']"],
          contentSelectors: [".prose", "article", "[role='article']"]
        }
      ],
      async fetchConversation(globalObject) {
        const { getCookieValue, normalizeWhitespace } = app.utils;
        const pathSegments = globalObject.location.pathname.split("/").filter(Boolean);
        const chatId = pathSegments[pathSegments.length - 1];
        const orgId = getCookieValue("lastActiveOrg");

        if (!orgId || !chatId) {
          throw new Error("Claude conversation identifiers not available.");
        }

        const response = await globalObject.fetch(
          `https://claude.ai/api/organizations/${orgId}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`,
          {
            credentials: "include"
          }
        );

        if (!response.ok) {
          throw new Error(`Claude API export failed with status ${response.status}.`);
        }

        const data = await response.json();
        const messages = (data.chat_messages || [])
          .map((message) => {
            const author = message.sender === "assistant" ? "Claude" : "You";
            const content = formatClaudeApiContent(message.content || []);

            return {
              author,
              content: normalizeWhitespace(content),
              strategy: "claude-api"
            };
          })
          .filter((message) => message.content);

        return {
          strategyId: "claude-api",
          messages,
          score: messages.length * 20
        };
      },
      inferAuthor(messageNode, authorElement, textContent) {
        const { matchesAnySelector } = app.utils;
        const testId = messageNode.getAttribute("data-testid") || "";

        if (testId === "user-message") {
          return "You";
        }

        if (testId === "assistant-message") {
          return "Claude";
        }

        if (messageNode.closest("[data-testid='user-message']")) {
          return "You";
        }

        if (
          matchesAnySelector(messageNode, [
            "[data-testid='assistant-message']",
            "[data-testid='chat-message']",
            "[data-is-streaming='true']",
            ".font-claude-message"
          ])
        ) {
          return "Claude";
        }

        if (/^you\b/i.test(textContent)) {
          return "You";
        }

        if (/claude/i.test(textContent)) {
          return "Claude";
        }

        return authorElement?.textContent?.trim() || null;
      }
    }
  ];

  function formatClaudeApiContent(items) {
    return items
      .map((item) => {
        if (!item || !item.type) {
          return "";
        }

        if (item.type === "text") {
          return item.text || "";
        }

        if (item.type === "thinking") {
          return `<think>\n${item.thinking || ""}\n</think>`;
        }

        if (item.type === "tool_use") {
          const language = item.input?.language || "";
          const content = item.input?.content;
          if (typeof content === "string" && content.trim()) {
            return `\`\`\`${language}\n${content}\n\`\`\``;
          }

          return `\`\`\`json\n${JSON.stringify(item.input || {}, null, 2)}\n\`\`\``;
        }

        if (item.type === "tool_result") {
          const resultContent = Array.isArray(item.content)
            ? formatClaudeApiContent(item.content)
            : typeof item.content === "string"
              ? item.content
              : JSON.stringify(item.content || {}, null, 2);

          return `<${item.name || "tool_result"}>\n${resultContent}\n</${item.name || "tool_result"}>`;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function getDeepSeekSessionId(locationObject) {
    const pathMatch = locationObject.pathname.match(/\/a\/chat\/s\/([^/?#]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }

    const searchParams = new URLSearchParams(locationObject.search);
    return (
      searchParams.get("chat_session_id") ||
      searchParams.get("session_id") ||
      ""
    );
  }

  function getDeepSeekToken(globalObject, getCookieValue) {
    const candidates = ["userToken", "token", "authToken"];

    for (const key of candidates) {
      const raw = globalObject.localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      try {
        const parsed = JSON.parse(raw);
        if (parsed?.value) {
          return parsed.value;
        }
      } catch {
        return raw;
      }
    }

    return getCookieValue("auth_token");
  }

  function makeDeepSeekHeaders(globalObject, token) {
    return {
      accept: "*/*",
      authorization: `Bearer ${token}`,
      "x-app-version": globalObject.localStorage.getItem("dscs_app_version") || "20241129.1",
      "x-client-locale": globalObject.localStorage.getItem("dscs_client_locale") || "en_US",
      "x-client-platform": "web",
      "x-client-version": globalObject.localStorage.getItem("dscs_client_version") || "1.3.0-auto-resume",
      "accept-language": globalObject.localStorage.getItem("dscs_accept_language") || "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache"
    };
  }

  function inferDeepSeekApiAuthor(message) {
    const role = `${message?.role || message?.sender || message?.author || message?.type || ""}`.toLowerCase();

    if (["assistant", "bot", "deepseek", "model"].includes(role)) {
      return "DeepSeek";
    }

    if (["user", "human"].includes(role)) {
      return "You";
    }

    if (message?.is_from_bot || message?.is_bot) {
      return "DeepSeek";
    }

    return "You";
  }

  function extractPerplexityPageMessages(documentObject, adapter) {
    const { getCleanText, normalizeWhitespace, queryAll } = app.utils;
    const messages = [];
    const title = normalizeWhitespace(
      (documentObject.title || "").replace(/\s*-\s*Perplexity.*$/i, "")
    );

    const answerCandidates = queryAll(documentObject, [
      "main .prose",
      "main .markdown",
      "main article",
      "main [class*='answer']",
      "main [class*='response']",
      "main section"
    ]);

    let bestAnswer = "";
    answerCandidates.forEach((candidate) => {
      const text = getCleanText(candidate, adapter);
      if (text.length > bestAnswer.length && text.length > 80 && text !== title) {
        bestAnswer = text;
      }
    });

    if (title && title.length > 10) {
      messages.push({
        author: "You",
        content: title,
        strategy: "perplexity-page"
      });
    }

    if (bestAnswer) {
      messages.push({
        author: "Perplexity",
        content: bestAnswer,
        strategy: "perplexity-page"
      });
    }

    return messages;
  }

  function extractChatGptStateMessages(globalObject) {
    const { collectStatePayloads, flattenStateText, normalizeWhitespace, walkStateObjects } = app.utils;
    const messages = [];
    const seen = new Set();

    collectStatePayloads(globalObject).forEach(({ value }) => {
      walkStateObjects(value, (node) => {
        const message = node?.message && typeof node.message === "object" ? node.message : node;
        const role = message?.author?.role || message?.role || "";
        if (!["user", "assistant"].includes(role)) {
          return;
        }

        const content = normalizeWhitespace(
          flattenStateText(message?.content) ||
            flattenStateText(message?.parts) ||
            flattenStateText(message)
        );

        if (!content) {
          return;
        }

        const uniqueKey = `${message.id || message.message_id || role}:${content.slice(0, 160)}`;
        if (seen.has(uniqueKey)) {
          return;
        }

        seen.add(uniqueKey);
        messages.push({
          author: role === "assistant" ? "ChatGPT" : "You",
          content,
          strategy: "chatgpt-state"
        });
      });
    });

    return messages;
  }

  function extractGeminiStateMessages(globalObject) {
    const { collectStatePayloads, flattenStateText, normalizeWhitespace, walkStateObjects } = app.utils;
    const messages = [];
    const seen = new Set();

    collectStatePayloads(globalObject).forEach(({ value }) => {
      walkStateObjects(value, (node) => {
        if (!node || typeof node !== "object") {
          return;
        }

        if (typeof node.query === "string" || typeof node.response === "string") {
          addGeminiMessage(messages, seen, "You", normalizeWhitespace(node.query || ""));
          addGeminiMessage(messages, seen, "Gemini", normalizeWhitespace(node.response || ""));
          return;
        }

        const rawRole = `${node.author || node.role || node.sender || ""}`.toLowerCase();
        const role =
          rawRole === "user" || rawRole === "human"
            ? "You"
            : rawRole === "model" || rawRole === "assistant" || rawRole === "gemini"
              ? "Gemini"
              : "";

        if (!role) {
          return;
        }

        const content = normalizeWhitespace(
          flattenStateText(node.content) ||
            flattenStateText(node.parts) ||
            flattenStateText(node.text) ||
            flattenStateText(node.message)
        );

        addGeminiMessage(messages, seen, role, content);
      });
    });

    return messages;
  }

  function addGeminiMessage(messages, seen, author, content) {
    if (!content) {
      return;
    }

    const uniqueKey = `${author}:${content.slice(0, 160)}`;
    if (seen.has(uniqueKey)) {
      return;
    }

    seen.add(uniqueKey);
    messages.push({
      author,
      content,
      strategy: "gemini-state"
    });
  }

  function findAdapter(hostname) {
    return adapters.find((adapter) =>
      adapter.hostPatterns.some((pattern) => hostname.includes(pattern))
    ) || null;
  }

  app.platforms = {
    adapters,
    findAdapter
  };
})(window);
