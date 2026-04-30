(function registerExtractor(globalScope) {
  const app = globalScope.ChatArchive;
  const {
    dedupeMessages,
    firstMatch,
    getBestScroller,
    getCleanText,
    inferAlternatingAuthor,
    normalizeWhitespace,
    queryAll,
    stableMessageKey,
    wait
  } = app.utils;

  function collectTitle(root, adapter) {
    if (!adapter.titleSelectors) {
      return "";
    }

    const titleElement = firstMatch(root, adapter.titleSelectors);
    if (!titleElement) {
      return "";
    }

    const title = normalizeWhitespace(titleElement.textContent || titleElement.innerText);
    // Don't return the generic platform name as a title
    if (title.toLowerCase() === adapter.displayName.toLowerCase()) {
      return "";
    }

    return title;
  }

  function collectMessagesForStrategy(root, adapter, strategy) {
    const messageMap = new Map();
    const nodes = queryAll(root, strategy.messageSelectors);

    nodes.forEach((messageNode, index) => {
      const contentNode = firstMatch(messageNode, strategy.contentSelectors) || messageNode;
      const authorNode = firstMatch(messageNode, [
        "[data-message-author-role]",
        "[data-testid='user-message']",
        "[data-testid='assistant-message']",
        "h2",
        "h5",
        ".author-name",
        ".sr-only"
      ]);

      const content = getCleanText(contentNode, adapter);
      if (!content || content.length < 3) {
        return;
      }

      let author = adapter.inferAuthor(messageNode, authorNode, content);
      if (!author || author.length > 30) {
        author = inferAlternatingAuthor(index, adapter);
      }

      const message = {
        author,
        content,
        strategy: strategy.id
      };

      messageMap.set(stableMessageKey(message), message);
    });

    return Array.from(messageMap.values());
  }

  function scoreMessages(adapter, strategyId, messages) {
    if (messages.length === 0) {
      return 0;
    }

    const authorMatches = messages.filter(
      (message) =>
        message.author === adapter.userLabel || message.author === adapter.assistantLabel
    ).length;
    const codeBlocks = messages.filter((message) => message.content.includes("```")).length;
    const longMessages = messages.filter((message) => message.content.length > 60).length;
    const strategyWeight = strategyId.includes("role") || strategyId.includes("semantic") ? 10 : 0;
    const uniqueAuthors = new Set(messages.map((message) => message.author)).size;
    const speakerBalanceBonus = uniqueAuthors > 1 ? 15 : -20;

    return (
      messages.length * 5 +
      authorMatches * 4 +
      codeBlocks * 2 +
      longMessages +
      speakerBalanceBonus +
      strategyWeight
    );
  }

  function estimateConfidence(result) {
    if (!result || result.messages.length === 0) {
      return 0;
    }

    const perMessageScore = result.score / result.messages.length;
    return Math.max(0.2, Math.min(0.99, perMessageScore / 14));
  }

  function withExtractionMetadata(result, source, diagnostics = {}) {
    return {
      ...result,
      source,
      diagnostics: {
        ...diagnostics,
        ...(result?.diagnostics || {})
      }
    };
  }

  function createStopController() {
    return {
      stopRequested: false,
      stopAndSaveRequested: false
    };
  }

  function pickBestExtraction(root, adapter) {
    const title = collectTitle(root, adapter);
    const candidates = adapter.strategies.map((strategy) => {
      const messages = dedupeMessages(collectMessagesForStrategy(root, adapter, strategy));
      return {
        strategyId: strategy.id,
        messages,
        title,
        score: scoreMessages(adapter, strategy.id, messages)
      };
    });

    const combinedMessages = dedupeMessages(
      candidates.flatMap((candidate) => candidate.messages)
    );
    candidates.push({
      strategyId: "combined",
      messages: combinedMessages,
      title,
      score: scoreMessages(adapter, "combined", combinedMessages)
    });

    return candidates.sort((left, right) => right.score - left.score)[0] || {
      strategyId: "none",
      messages: [],
      title,
      score: 0
    };
  }

  async function scrollToTop(scroller, control) {
    // Always scroll incrementally so scroll events fire and trigger lazy
    // loading on platforms like Gemini. Steps are larger and delays shorter
    // than the original (3000px / 200ms vs 1600px / 250ms) for ~2× speed.
    let lastPosition = scroller.scrollTop;
    let unchangedSteps = 0;

    while (unchangedSteps < 4) {
      if (control?.stopRequested) {
        break;
      }

      scroller.scrollBy(0, -3000);
      await wait(200);

      if (scroller.scrollTop === 0 || scroller.scrollTop === lastPosition) {
        unchangedSteps += 1;
      } else {
        unchangedSteps = 0;
        lastPosition = scroller.scrollTop;
      }
    }
  }

  function summarizeCandidates(adapter, messagesByStrategy, title = "") {
    const candidates = adapter.strategies.map((strategy) => {
      const messages = Array.from(messagesByStrategy.get(strategy.id).values());
      return {
        strategyId: strategy.id,
        messages: dedupeMessages(messages),
        title,
        score: scoreMessages(adapter, strategy.id, messages)
      };
    });

    const combinedMessages = dedupeMessages(
      candidates.flatMap((candidate) => candidate.messages)
    );
    candidates.push({
      strategyId: "combined",
      messages: combinedMessages,
      title,
      score: scoreMessages(adapter, "combined", combinedMessages)
    });

    return candidates.sort((left, right) => right.score - left.score)[0];
  }

  async function captureWhileScrolling(root, adapter, control = createStopController(), options = {}) {
    const scroller = getBestScroller(root, adapter);
    const messagesByStrategy = new Map(
      adapter.strategies.map((strategy) => [strategy.id, new Map()])
    );

    await scrollToTop(scroller, control);

    let lastPosition = -1;
    let lastScrollHeight = scroller.scrollHeight;
    let lastMaxCount = -1;
    let unchangedSteps = 0;
    let stepsSinceCollect = 0;
    let capturedTitle = "";
    const limit = options.messageLimit || 0;
    const onProgress = options.onProgress || (() => {});
    const scrollDelay = options.scrollSpeed || 200;
    // Use viewport-based scroll step for faster traversal
    const scrollStep = Math.max(scroller.clientHeight * 0.85, 2000);
    // Collect messages every N scroll steps to reduce DOM query overhead
    const collectInterval = 3;

    while (unchangedSteps < 12) {
      stepsSinceCollect += 1;
      const shouldCollect = stepsSinceCollect >= collectInterval ||
        unchangedSteps > 0 || lastMaxCount === -1;

      let currentMaxCount = lastMaxCount < 0 ? 0 : lastMaxCount;
      if (shouldCollect) {
        stepsSinceCollect = 0;
        currentMaxCount = 0;

        if (!capturedTitle) {
          capturedTitle = collectTitle(root, adapter);
        }

        adapter.strategies.forEach((strategy) => {
          collectMessagesForStrategy(root, adapter, strategy).forEach((message) => {
            const strategyMap = messagesByStrategy.get(strategy.id);
            strategyMap.set(stableMessageKey(message), message);
            if (strategyMap.size > currentMaxCount) {
              currentMaxCount = strategyMap.size;
            }
          });
        });

        onProgress({ messageCount: currentMaxCount, status: "scrolling" });

        if (control.stopRequested || (limit > 0 && currentMaxCount >= limit)) {
          return {
            ...summarizeCandidates(adapter, messagesByStrategy, capturedTitle),
            partial: control.stopAndSaveRequested || (limit > 0 && currentMaxCount >= limit)
          };
        }
      }

      scroller.scrollBy(0, scrollStep);
      await wait(scrollDelay);

      const hasMoved = scroller.scrollTop !== lastPosition;
      const hasGrown = scroller.scrollHeight !== lastScrollHeight;
      const hasNewMessages = currentMaxCount !== lastMaxCount;

      if (!hasMoved && !hasGrown && !hasNewMessages) {
        unchangedSteps += 1;
      } else {
        unchangedSteps = 0;
      }

      lastPosition = scroller.scrollTop;
      lastScrollHeight = scroller.scrollHeight;
      lastMaxCount = currentMaxCount;
    }

    return {
      ...summarizeCandidates(adapter, messagesByStrategy, capturedTitle),
      partial: false
    };
  }

  async function extractConversation(root = document, control = createStopController(), options = {}) {
    const adapter = app.platforms.findAdapter(globalScope.location.hostname);
    if (!adapter) {
      throw new Error("This website is not supported yet.");
    }

    const diagnostics = {
      apiError: null,
      stateError: null,
      pageError: null
    };

    let result = null;
    let strategyUsed = "none";

    if (adapter.preferApiExtraction && typeof adapter.fetchConversation === "function") {
      try {
        const apiResult = await adapter.fetchConversation(globalScope);
        if (apiResult.messages.length > 0) {
          result = apiResult;
          strategyUsed = "api";
        }
      } catch (error) {
        diagnostics.apiError = error.message;
        globalScope.__CHAT_ARCHIVE_LAST_API_ERROR__ = error.message;
      }
    }

    if (!result && adapter.preferStateExtraction && typeof adapter.extractFromState === "function") {
      try {
        const stateResult = await adapter.extractFromState(globalScope);
        diagnostics.stateAttempt = {
          strategyId: stateResult.strategyId || "state",
          messageCount: Array.isArray(stateResult.messages) ? stateResult.messages.length : 0,
          ...(stateResult.diagnostics || {})
        };
        if (stateResult.messages.length > 0) {
          result = stateResult;
          strategyUsed = "state";
        }
      } catch (error) {
        diagnostics.stateError = error.message;
        globalScope.__CHAT_ARCHIVE_LAST_STATE_ERROR__ = error.message;
      }
    }

    if (!result && adapter.preferPageExtraction && typeof adapter.extractFromPage === "function") {
      try {
        const pageResult = await adapter.extractFromPage(globalScope);
        diagnostics.pageAttempt = {
          strategyId: pageResult.strategyId || "page",
          messageCount: Array.isArray(pageResult.messages) ? pageResult.messages.length : 0,
          ...(pageResult.diagnostics || {})
        };
        if (pageResult.messages.length > 0) {
          result = pageResult;
          strategyUsed = "page";
        }
      } catch (error) {
        diagnostics.pageError = error.message;
        globalScope.__CHAT_ARCHIVE_LAST_PAGE_ERROR__ = error.message;
      }
    }

    if (!result) {
      result = await captureWhileScrolling(root, adapter, control, options);
      strategyUsed = "dom";
    }

    if (result && !result.title) {
      result.title = collectTitle(root, adapter);
    }

    if (!result || result.messages.length === 0) {
      const fallback = pickBestExtraction(root, adapter);
      result = fallback;
      strategyUsed = "dom";
    }

    // Apply message limit
    const limit = options.messageLimit || 0;
    if (limit > 0 && result.messages.length > limit) {
      result.messages = result.messages.slice(0, limit);
      result.partial = true;
    }

    return withExtractionMetadata(
      {
        adapter,
        ...result
      },
      strategyUsed,
      diagnostics
    );
  }

  app.extractor = {
    captureWhileScrolling,
    collectMessagesForStrategy,
    collectTitle,
    createStopController,
    estimateConfidence,
    extractConversation,
    pickBestExtraction,
    scoreMessages
  };
})(window);
