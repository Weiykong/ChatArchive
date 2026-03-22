# Roadmap

## Near term

- Add adapters for Copilot, Grok, and DeepSeek
- Capture real DOM fixtures from supported platforms
- Add compatibility status badges and support matrix to the README
- Improve Markdown fidelity for tables, lists, and attachments

## Reliability

- Store screenshots and DOM snapshots as CI artifacts when extraction fails
- Gate adapter changes with fixture coverage for every supported platform
- Add live browser smoke checks against authenticated test accounts

## Controlled repair workflow

- Open an issue automatically when a scheduled compatibility test fails
- Generate a bounded AI-assisted patch proposal for affected adapter files only
- Re-run CI on the proposed patch
- Keep human review required before merge
