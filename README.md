# ChatArchive

![Version](https://img.shields.io/badge/version-1.11.0-1f6feb)
![Platforms](https://img.shields.io/badge/platforms-6_supported-2ea043)
![Tests](https://img.shields.io/badge/tests-22_passing-2ea043)
![Browser](https://img.shields.io/badge/browser-Chromium-f59e0b)
![License](https://img.shields.io/badge/license-MIT-16a34a)

ChatArchive is a Chromium extension for exporting conversations from modern AI chat products into clean local files. It is designed around per-platform adapters, layered extraction strategies, and diagnostics that make breakages easier to detect and repair when sites change.

The project currently focuses on reliable export, readable Markdown, and maintainable extraction logic rather than one-off scraping hacks.

<img src="assets/logo.png" alt="ChatArchive logo" width="220">

> Export chats from ChatGPT, Gemini, Claude, Perplexity, Grok, and DeepSeek into clean Markdown, Obsidian, text, and JSON files without sending your data to a backend.

[Download latest release](https://github.com/Weiykong/ChatArchive/releases) · [Load unpacked in Chromium](#local-setup) · [See supported platforms](#supported-platforms)

## Why ChatArchive

- Local-first export with no backend service
- More durable extraction through per-platform adapters and layered fallbacks
- Multiple output formats for notes, backups, and downstream tooling
- Built-in diagnostics that make breakages faster to understand
- Fixture tests plus scheduled compatibility checks to keep support visible

## Quick start

1. Download the latest `.zip` from [GitHub Releases](https://github.com/Weiykong/ChatArchive/releases).
2. Extract it locally.
3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked` and select the extracted folder.

## Preview

![ChatArchive screenshot](Screenshot.png)

## Highlights

- Multi-platform export for major AI chat products
- Markdown, Obsidian Markdown, plain text, and JSON output
- API-first or state-first extraction when a platform exposes stable conversation data
- DOM fallback with confidence scoring when more stable data is unavailable
- Popup diagnostics showing platform, extraction source, strategy, confidence, and message count
- `Stop & Save` support for long-running DOM exports
- Debug-report copy and prefilled broken-export issue reporting
- Fixture-based regression tests plus scheduled live smoke checks

## Supported platforms

| Platform | Status | Primary extraction path |
| --- | --- | --- |
| ChatGPT | Supported | `state`, fallback `dom` |
| Gemini | Supported | `state`, fallback `dom` |
| Claude | Supported | `api`, fallback `dom` |
| DeepSeek | Supported | `api`, fallback `dom` |
| Perplexity | Supported | `page` or `dom` |
| Grok | Supported | `dom` |

Platforms with API or state-backed extraction are generally more stable than DOM-only platforms.

## Export formats

- Markdown
- Obsidian Markdown
- Plain text
- JSON

## Why this repo exists

Most AI chat exporters break for the same reason: they depend on a single fragile set of selectors. This repo takes a more durable approach:

- isolate each platform in its own adapter
- support multiple extraction strategies per platform
- prefer API or page-state data when available
- keep diagnostics visible to users
- add regression fixtures for real failures

That structure does not prevent website breakage, but it makes breakage faster to diagnose and cheaper to repair.

## Current capabilities

- Full-history export with platform-aware auto-scroll
- Structured text cleanup for headings, links, blockquotes, ordered lists, unordered lists, and code blocks
- Partial export support for long conversations
- Global stop shortcut: `Ctrl+Shift+S` on Windows/Linux, `Command+Shift+S` on macOS
- Metadata-rich exports including platform, extraction source, strategy, timestamp, and partial-export status

## Long conversations

- If a platform uses `api` or `state`, switching tabs is usually much safer.
- If a platform falls back to `dom`, Chromium may throttle background tabs.
- For long DOM-based exports, keep the chat tab visible when possible.
- If needed, use `Stop & Save` to save the portion captured so far.

## Project structure

- `src/popup/`: popup UI and orchestration
- `src/content/`: adapter discovery, extraction logic, formatting, and export generation
- `src/background/`: background command relay for stop-and-save
- `tests/fixtures/`: saved DOM snapshots used for regression coverage
- `tests/`: Node-based extraction tests using `jsdom`
- `scripts/`: compatibility summaries and live smoke tooling

## Development

### Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm test`.
4. Load this repository as an unpacked extension in a Chromium-based browser.
5. Reload the extension after changing `manifest.json`, `popup.html`, or files under `src/`.

### Packaging

- `npm run package:extension`
  Creates `dist/chatarchive-<version>.zip`.
- Pushing a tag like `v1.12.0` triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which tests the repo, builds the extension zip, and publishes a GitHub release.

### Test strategy

- `npm test`
  Runs fixture-based extraction tests with `jsdom`.
- `npm run test:live-smoke`
  Runs Playwright-based live smoke checks against real logged-in pages when secrets or local environment variables are configured.

## Live smoke checks

The scheduled workflow in [`.github/workflows/daily-compatibility.yml`](.github/workflows/daily-compatibility.yml) runs in two layers:

- fixture compatibility checks that do not require credentials
- optional live smoke checks for real ChatGPT, Gemini, and Perplexity pages

To enable live smoke checks, configure these repository secrets:

- `SMOKE_CHATGPT_URL`
- `SMOKE_CHATGPT_COOKIES`
- `SMOKE_GEMINI_URL`
- `SMOKE_GEMINI_COOKIES`
- `SMOKE_PERPLEXITY_URL`
- `SMOKE_PERPLEXITY_COOKIES`

Cookie secrets may be either:

- a raw cookie header string such as `name=value; other=value`
- a Playwright-compatible JSON cookie array

Before running the live suite locally, install the browser dependency:

```bash
npx playwright install chromium
```

## Privacy and trust

- No backend service
- No remote data processing
- Exports are generated locally in the browser context
- Debug and issue-report tooling is user-initiated

This matters because a chat exporter should be auditable and easy to inspect.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

Contributions are welcome, especially around:

- platform compatibility fixes
- new platform adapters
- extraction fixtures for real-world failures
- Markdown fidelity improvements
- CI and smoke-test hardening

See [CONTRIBUTING.md](CONTRIBUTING.md) and [ROADMAP.md](ROADMAP.md) for current expectations and direction.

## Roadmap

- Add more platform adapters
- Add fixture capture tooling
- Improve handling for tables, attachments, and richer content blocks
- Expand authenticated live smoke coverage

## Status

The project is ready for public iteration, but website extraction is an ongoing maintenance problem by nature. Expect adapter updates over time as platforms change their DOM, APIs, and page-state structures.
