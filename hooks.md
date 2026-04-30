# ChatArchive Improvement Hooks

This file defines the mandates and workflows for expanding and improving the ChatArchive extension.

## Core Mandates

1. **Adapter-First Architecture:** Always use the `adapters` array in `src/content/platforms.js` for adding new AI platforms.
2. **Strategy Prioritization:**
    - Prefer **State Extraction** (`extractFromState`) if the platform uses a framework like Next.js or React with global state (`__NEXT_DATA__`, etc.).
    - Use **API Extraction** (`fetchConversation`) if the platform has accessible internal APIs and credentials can be easily retrieved from cookies/localStorage.
    - Fallback to **Page Extraction** (`extractFromPage` or DOM strategies) for all other cases.
3. **Common Selectors:** Reuse `COMMON_REMOVALS` for UI noise like buttons, tooltips, and hidden elements.
4. **Resilient Selectors:** Use data attributes (`data-testid`, `data-role`) over brittle CSS classes when available.
5. **Deduplication:** Always use `app.utils.dedupeMessages` or similar logic to ensure no duplicate messages are exported.
6. **Markdown Preservation:** Ensure the extraction process preserves Markdown formatting (links, lists, blockquotes, code blocks).

## Expansion Roadmap

### 1. New Platform Adapters
Target the following AI websites for adaptation:
- [x] **Mistral AI** (`chat.mistral.ai`)
- [x] **HuggingChat** (`huggingface.co/chat`)
- [x] **Meta AI** (`meta.ai`)
- [x] **Poe** (`poe.com`)
- [x] **Microsoft Copilot** (`copilot.microsoft.com`)
- [x] **Phind** (`phind.com`)
- [x] **You.com** (`you.com`)

### 2. Core Improvements
- [ ] **Enhanced Code Block Detection:** Better handling of multi-language code blocks and copy buttons within them.
- [ ] **Wait-and-Retry Logic:** Improve the `runner.js` to handle slow-loading conversations or dynamic content better.
- [ ] **Attachment Support:** Detect and list attachments (PDFs, images) even if they cannot be fully exported.

## Implementation Guide for New Adapters

For each new platform, identify:
1. `hostPatterns`: The domains where the adapter should activate.
2. `strategies`: DOM selectors for messages and their content.
3. `inferAuthor`: Logic to distinguish between "You" and the assistant.
4. `preferredScrollSelectors`: The main chat container for auto-scrolling.
5. `headerCleanupPatterns`: Common text at the start of messages that should be removed.

---

*This hook is a living document and should be updated as new patterns or requirements emerge.*
