const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadFixture } = require("./helpers/load-content-scripts");

test("extracts ChatGPT fixture with role-aware strategy", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);

  assert.equal(adapter.id, "chatgpt");
  assert.equal(result.strategyId, "role-attributes");
  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0].author, "You");
  assert.match(result.messages[1].content, /```/);
});

test("prefers ChatGPT state extraction when page state is available", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt-state.html"),
    "https://chatgpt.com/c/state-example"
  );
  const { window } = dom;

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(result.adapter.id, "chatgpt");
  assert.equal(result.strategyId, "chatgpt-state");
  assert.equal(result.source, "state");
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "ChatGPT"]
  );
});

test("extracts Gemini fixture with semantic tags", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/gemini.html"),
    "https://gemini.google.com/app/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);

  assert.equal(adapter.id, "gemini");
  assert.equal(result.strategyId, "combined");
  assert.equal(result.messages.length, 4);
  assert.equal(result.messages[1].author, "Gemini");
});

test("prefers Gemini state extraction when state payload is available", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/gemini-state.html"),
    "https://gemini.google.com/app/state-example"
  );
  const { window } = dom;

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(result.adapter.id, "gemini");
  assert.equal(result.strategyId, "gemini-state");
  assert.equal(result.source, "state");
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "Gemini", "You", "Gemini"]
  );
});

test("prefers DeepSeek API extraction when session id and token are available", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/deepseek.html"),
    "https://chat.deepseek.com/a/chat/s/session-123"
  );
  const { window } = dom;

  window.localStorage.setItem("userToken", "deepseek-token");
  window.fetch = async (url, options) => {
    assert.match(
      url,
      /https:\/\/chat\.deepseek\.com\/api\/v0\/chat\/history_messages\?chat_session_id=session-123/
    );
    assert.equal(options.headers.authorization, "Bearer deepseek-token");

    return {
      ok: true,
      async json() {
        return {
          data: {
            biz_data: {
              chat_messages: [
                {
                  role: "user",
                  content: { text: "Summarize this repo." }
                },
                {
                  role: "assistant",
                  content: { text: "It now supports API, state, and DOM extraction paths." }
                }
              ]
            }
          }
        };
      }
    };
  };

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(result.adapter.id, "deepseek");
  assert.equal(result.strategyId, "deepseek-api");
  assert.equal(result.source, "api");
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "DeepSeek"]
  );
});

test("extracts Grok fixture with conversation bubbles", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/grok.html"),
    "https://grok.com/chat/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);

  assert.equal(adapter.id, "grok");
  assert.equal(result.strategyId, "grok-bubbles");
  assert.equal(result.messages.length, 4);
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "Grok", "You", "Grok"]
  );
});

test("extracts Perplexity fixture with thread messages", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/perplexity.html"),
    "https://www.perplexity.ai/search/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);

  assert.equal(adapter.id, "perplexity");
  assert.equal(result.strategyId, "perplexity-thread");
  assert.equal(result.messages.length, 4);
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "Perplexity", "You", "Perplexity"]
  );
});

test("falls back to Perplexity page extraction for search-style pages", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/perplexity-page.html"),
    "https://www.perplexity.ai/search/example"
  );
  const { window } = dom;

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(result.adapter.id, "perplexity");
  assert.equal(result.strategyId, "perplexity-page");
  assert.equal(result.source, "page");
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "Perplexity"]
  );
});

test("extracts Claude fixture with test id selectors", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/claude.html"),
    "https://claude.ai/chat/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);

  assert.equal(adapter.id, "claude");
  assert.equal(result.strategyId, "testid-selectors");
  assert.equal(result.messages.length, 4);
  assert.equal(result.messages[2].author, "You");
});

test("captures Claude assistant messages when only user turns expose old test ids", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/claude-mixed-layout.html"),
    "https://claude.ai/chat/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);

  assert.equal(adapter.id, "claude");
  assert.equal(result.strategyId, "testid-selectors");
  assert.equal(result.messages.length, 4);
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "Claude", "You", "Claude"]
  );
});

test("prefers Claude API extraction when available", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/claude-mixed-layout.html"),
    "https://claude.ai/chat/example-conversation"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);

  Object.defineProperty(window.document, "cookie", {
    configurable: true,
    value: "lastActiveOrg=test-org"
  });

  window.fetch = async (url) => {
    assert.match(
      url,
      /https:\/\/claude\.ai\/api\/organizations\/test-org\/chat_conversations\/example-conversation/
    );

    return {
      ok: true,
      async json() {
        return {
          chat_messages: [
            {
              sender: "human",
              content: [{ type: "text", text: "Which CV is better?" }]
            },
            {
              sender: "assistant",
              content: [{ type: "text", text: "The second CV is stronger overall." }]
            }
          ]
        };
      }
    };
  };

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(adapter.id, "claude");
  assert.equal(result.strategyId, "claude-api");
  assert.deepEqual(
    Array.from(result.messages, (message) => message.author),
    ["You", "Claude"]
  );
});

test("builds JSON payload with metadata", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);
  const payload = window.ChatArchive.exporters.buildExportPayload("json", adapter, result.messages);
  const parsed = JSON.parse(payload.content);

  assert.equal(parsed.metadata.platform, "ChatGPT");
  assert.equal(parsed.messages.length, 3);
  assert.match(payload.filename, /^\[ChatGPT\]/);
});

test("prefers the ChatGPT conversation scroller over the sidebar", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt-scroll.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const sidebar = window.document.querySelector("aside");
  const mainScroller = window.document.querySelector("main");

  stubScrollable(window, sidebar, { clientHeight: 600, scrollHeight: 5000, overflowY: "auto" });
  stubScrollable(window, mainScroller, { clientHeight: 700, scrollHeight: 3000, overflowY: "auto" });

  const chosenScroller = window.ChatArchive.utils.getBestScroller(window.document, adapter);

  assert.equal(chosenScroller, mainScroller);
});

test("returns a partial result when stop-and-save is requested during DOM capture", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const mainScroller = window.document.querySelector("main");

  stubScrollable(window, mainScroller, { clientHeight: 700, scrollHeight: 3000, overflowY: "auto" });
  mainScroller.scrollBy = () => {};

  const control = window.ChatArchive.extractor.createStopController();
  control.stopRequested = true;
  control.stopAndSaveRequested = true;

  const result = await window.ChatArchive.extractor.captureWhileScrolling(
    window.document,
    adapter,
    control
  );

  assert.equal(result.partial, true);
  assert.ok(result.messages.length > 0);
});

test("preserves paragraphs and bullets in cleaned text", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/text-formatting.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const contentNode = window.document.querySelector(".prose");
  const text = window.ChatArchive.utils.getCleanText(contentNode, adapter);

  assert.match(text, /First paragraph\.\n\nSecond paragraph with a \[link\]\(https:\/\/example\.com\)\./);
  assert.match(text, /\n- First bullet\n- Second bullet/);
  assert.match(text, /\n1\. First numbered item\n1\. Second numbered item/);
  assert.match(text, /\n> A quoted takeaway\./);
  assert.match(text, /```\nconst value = 1;\n```/);
});

test("builds Obsidian markdown payload with metadata and headings", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "obsidian",
    adapter,
    result.messages,
    {
      includeMetadata: true,
      strategyId: result.strategyId
    }
  );

  assert.match(payload.filename, /\.md$/);
  assert.match(payload.content, /^---/);
  assert.match(payload.content, /tags: \["ai-chat-export", "chatgpt", "conversation"\]/);
  assert.match(payload.content, /\n# .*Summarize/);
  assert.match(payload.content, /\n## ChatGPT\n/);
});

test("includes partial metadata in exported payloads", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "md",
    adapter,
    result.messages,
    {
      includeMetadata: true,
      strategyId: result.strategyId,
      source: "dom",
      partial: true
    }
  );

  assert.match(payload.content, /extraction_source: dom/);
  assert.match(payload.content, /partial: true/);
});

function stubScrollable(window, element, dimensions) {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: dimensions.clientHeight
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: dimensions.scrollHeight
  });

  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (target) => {
    if (target === element) {
      return {
        ...originalGetComputedStyle(target),
        overflowY: dimensions.overflowY
      };
    }

    return originalGetComputedStyle(target);
  };
}
