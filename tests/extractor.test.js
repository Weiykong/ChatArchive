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

test("extracts Gemini conversation title from DOM", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/gemini.html"),
    "https://gemini.google.com/app/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const extraction = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);
  const payload = window.ChatArchive.exporters.buildExportPayload("json", adapter, extraction.messages, {
    strategyId: extraction.strategyId,
    source: "dom"
  });

  assert.equal(payload.metadata.title, "Roadmap to AGI");
});

test("extracts Copilot conversation title from current navigation item", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/copilot.html"),
    "https://copilot.microsoft.com/chats/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "json",
    adapter,
    [{ author: "You", content: "Summarize the roadmap." }],
    {}
  );

  assert.equal(payload.metadata.title, "Quarterly planning notes");
});

test("falls back to the first user message when the page title is generic", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/copilot-generic-title.html"),
    "https://copilot.microsoft.com/chats/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "json",
    adapter,
    [
      { author: "You", content: "Plan Q2 launch milestones and risks.\n\nInclude owners and dates." },
      { author: "Copilot", content: "Here is a draft plan." }
    ],
    {}
  );

  assert.equal(payload.metadata.title, "Plan Q2 launch milestones and risks.");
});

test("extracts Copilot article-style turns without leaving stray 'said' text", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/copilot-fallback.html"),
    "https://copilot.microsoft.com/chats/example"
  );
  const { window } = dom;

  const result = await window.ChatArchive.extractor.extractConversation(window.document);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "json",
    result.adapter,
    result.messages,
    {}
  );

  assert.equal(result.source, "page");
  assert.equal(result.strategyId, "copilot-fallback");
  assert.equal(result.messages[0].author, "You");
  assert.equal(result.messages[0].content, "Plan the launch timeline.");
  assert.equal(result.messages[1].author, "Copilot");
  assert.equal(result.messages[1].content, "Here is a draft timeline.");
  assert.equal(payload.metadata.title, "Plan the launch timeline.");
});

test("collapses mirrored Copilot fallback duplicates and skips 'said' as title", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/copilot-fallback-duplicates.html"),
    "https://copilot.microsoft.com/chats/example"
  );
  const { window } = dom;

  const result = await window.ChatArchive.extractor.extractConversation(window.document);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "json",
    result.adapter,
    result.messages,
    {}
  );

  assert.equal(result.strategyId, "copilot-fallback");
  assert.deepEqual(
    Array.from(result.messages, (message) => `${message.author}: ${message.content}`),
    [
      "Copilot: Here is a draft timeline.",
      "You: Plan the launch timeline."
    ]
  );
  assert.equal(payload.metadata.title, "Plan the launch timeline.");
});

test("skips weak Copilot steering prompts when deriving a fallback title", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/copilot-generic-title.html"),
    "https://copilot.microsoft.com/chats/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "json",
    adapter,
    [
      { author: "Copilot", content: "Here is the earlier answer." },
      { author: "You", content: "In English" },
      { author: "Copilot", content: "Here is the English version." },
      { author: "You", content: "Improving a joke for humor" }
    ],
    {}
  );

  assert.equal(payload.metadata.title, "Improving a joke for humor");
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

test("renders markdown-like conversation content into structured HTML", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const payload = window.ChatArchive.exporters.buildExportPayload(
    "html",
    adapter,
    [
      {
        author: "You",
        content: "# Summary\n\n- First bullet\n- Second bullet\n\n> Keep this excerpt.\n\nUse the [guide](https://example.com) and `npm test`.\n\n```js\nconst value = 1;\n```"
      }
    ],
    {
      includeMetadata: true,
      title: "Structured export"
    }
  );

  assert.match(payload.filename, /\.html$/);
  assert.match(payload.content, /<h1>Summary<\/h1>/);
  assert.match(payload.content, /<ul><li>First bullet<\/li><li>Second bullet<\/li><\/ul>/);
  assert.match(payload.content, /<blockquote><p>Keep this excerpt\.<\/p><\/blockquote>/);
  assert.match(payload.content, /<a href="https:\/\/example\.com" target="_blank" rel="noreferrer noopener">guide<\/a>/);
  assert.match(payload.content, /<code>npm test<\/code>/);
  assert.match(payload.content, /<section class="code-block"><div class="code-language">js<\/div><pre><code>const value = 1;/);
});

test("builds print-ready PDF payloads with print controls and pdf filenames", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);
  const payload = window.ChatArchive.exporters.buildExportPayload("pdf", adapter, result.messages, {
    includeMetadata: true,
    strategyId: result.strategyId,
    source: "dom"
  });

  assert.match(payload.filename, /\.pdf$/);
  assert.equal(payload.mimeType, "text/html;charset=utf-8");
  assert.match(payload.content, /Print \/ Save as PDF/);
  assert.match(payload.content, /@page/);
  assert.match(payload.content, /<div class="message-list">/);
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

test("builds CSV payloads with escaped multiline content", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);
  const payload = window.ChatArchive.exporters.buildExportPayload("csv", adapter, result.messages, {
    includeMetadata: true,
    strategyId: result.strategyId,
    source: "dom"
  });

  assert.match(payload.filename, /\.csv$/);
  assert.match(payload.content, /^index,author,content,platform,source,strategy,partial,exported_at,title,conversation_url$/m);
  assert.match(payload.content, /^1,You,Summarize this repository architecture\.,ChatGPT,dom,role-attributes,false,/m);
  assert.match(payload.content, /"Here is a plan\.[\s\S]*const plan = \[""adapters"", ""tests""\];[\s\S]*```"/m);
});

test("expands extended filename template tokens and sanitizes invalid characters", () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/chatgpt.html"),
    "https://chatgpt.com/c/example"
  );
  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  const result = window.ChatArchive.extractor.pickBestExtraction(window.document, adapter);
  const payload = window.ChatArchive.exporters.buildExportPayload("md", adapter, result.messages, {
    strategyId: result.strategyId,
    source: "dom",
    filenameTemplate: "{platform}/{source}:{count}?{strategy}|{title}"
  });

  assert.equal(
    payload.filename,
    "ChatGPT_dom_3_role-attributes_Summarize this repository architecture.md"
  );
});

test("Gemini title extraction prioritizes main content over sidebar", async () => {
  const dom = new (require("jsdom").JSDOM)(`
    <!DOCTYPE html>
    <html lang="en">
      <body>
        <nav class="sidebar">
          <div data-test-id="conversation-title">Sidebar Title 1</div>
          <div data-test-id="conversation-title">Sidebar Title 2</div>
          <div class="conversation-title">Sidebar Title 3</div>
        </nav>
        <main>
          <h1>Current Chat Title</h1>
          <div class="conversation-container">
            <user-query>
              <div class="query-text">Hello Gemini</div>
            </user-query>
            <model-response>
              <div class="markdown">Hello there!</div>
            </model-response>
          </div>
        </main>
      </body>
    </html>
  `, {
    url: "https://gemini.google.com/app/example",
    pretendToBeVisual: true,
    runScripts: "outside-only"
  });

  const context = dom.getInternalVMContext();
  require("../scripts/content-files").getContentFilePaths(process.cwd()).forEach((filePath) => {
    new (require("node:vm")).Script(require("node:fs").readFileSync(filePath, "utf8"), {
      filename: filePath
    }).runInContext(context);
  });

  const { window } = dom;
  const adapter = window.ChatArchive.platforms.findAdapter(window.location.hostname);
  
  // Mock scrollBy to avoid TypeError in JSDOM
  window.Element.prototype.scrollBy = function() {};
  window.HTMLElement.prototype.scrollBy = function() {};

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(adapter.id, "gemini");
  assert.equal(result.title, "Current Chat Title");
});

test("Gemini state extraction matches title by conversation ID from URL", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/gemini-state.html"),
    "https://gemini.google.com/app/c/chat-123"
  );
  const { window } = dom;
  
  window.__STATE__ = {
    history: [
      { conversationId: "chat-999", title: "Old Conversation" },
      { conversationId: "chat-123", title: "Target Conversation" }
    ],
    conversation: {
      turns: [
        { query: "Message", response: "Reply" }
      ]
    }
  };

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(result.adapter.id, "gemini");
  assert.equal(result.title, "Target Conversation");
});

test("Gemini state extraction falls back to first title if no ID in URL", async () => {
  const dom = loadFixture(
    path.join(process.cwd(), "tests/fixtures/gemini-state.html"),
    "https://gemini.google.com/app"
  );
  const { window } = dom;
  
  window.__STATE__ = {
    history: [
      { conversationId: "chat-999", title: "First Found" },
      { conversationId: "chat-123", title: "Second Found" }
    ],
    conversation: {
      turns: [
        { query: "Message", response: "Reply" }
      ]
    }
  };

  const result = await window.ChatArchive.extractor.extractConversation(window.document);

  assert.equal(result.title, "First Found");
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
