# Changelog

## 1.11.0

- Added scheduled live smoke test infrastructure for ChatGPT, Gemini, and Perplexity
- Added Playwright-based artifact capture with per-platform summaries and failure reports
- Added tests for live smoke configuration, cookie parsing, and result validation

## 1.10.0

- Added first-pass Perplexity support on `perplexity.ai`
- Added Perplexity popup detection and regression coverage

## 1.9.0

- Added first-pass Grok support on `grok.com`
- Added Grok popup detection and regression coverage

## 1.8.0

- Added first-pass DeepSeek support on `chat.deepseek.com`
- DeepSeek now prefers API extraction from the current chat session
- Added DeepSeek regression coverage and popup detection

## 1.7.0

- Added Stop & Save for long-running DOM exports
- Added a keyboard shortcut for partial save: `Ctrl/Command+Shift+S`
- Added partial-export metadata and diagnostics
- Added a background service worker to relay stop commands to the active export tab

## 1.6.0

- Added state-first extraction paths for ChatGPT and Gemini
- Added extraction source diagnostics (`api`, `state`, `dom`) to export summaries
- Added stronger regression fixtures for state-backed exports

## 1.5.0

- Added Obsidian Markdown export and optional metadata headers
- Improved Markdown fidelity for links, ordered lists, blockquotes, and headings
- Added export diagnostics and debug-report actions in the popup
- Added a broken-export issue template and scheduled compatibility workflow

## 1.4.0

- Refactored extraction logic into adapter-oriented content scripts
- Added JSON export support
- Added fixture-based extraction tests
- Added CI workflow for test execution
