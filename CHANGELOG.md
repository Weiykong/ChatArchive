# Changelog

## 1.0.0

Initial Chrome Web Store release.

### Export Formats
- Markdown, Obsidian Markdown, HTML, PDF, Plain Text, JSON, CSV

### Supported Platforms
- ChatGPT, Gemini, DeepSeek, Grok, Perplexity, Claude, Mistral, HuggingChat, Meta AI, Poe, Copilot, Phind, You.com

### Extraction
- Layered extraction: API, state, page, and DOM scroll strategies with automatic fallback
- Optimized auto-scroll with direct jump-to-top, viewport-based scroll steps, and batched DOM collection
- Configurable scroll delay (default 200ms) for balancing speed and reliability
- Stop & Save for long-running exports (`Ctrl/Command+Shift+S`)
- Conversation title extraction from platform headers and state metadata

### Settings Panel
- Collapsible settings panel with export format, filename template, max messages, scroll delay, and metadata toggle
- Filename template with token checkboxes (`{platform}`, `{title}`, `{date}`, `{time}`, `{source}`, `{strategy}`, `{count}`) and live preview
- Persistent settings via `chrome.storage`

### Actions
- Export Chat (file download)
- Copy to Clipboard (`Ctrl/Command+Shift+C`)
- Save as PDF (print-ready view)
- Debug report and issue reporting
