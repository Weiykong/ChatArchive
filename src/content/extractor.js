(function registerExtractor(globalScope) {
  const app = globalScope.ChatArchive;
  const {
    dedupeMessages,
    firstMatch,
    getBestScroller,
    getCleanText,
    inferAlternatingAuthor,
    queryAll,
    stableMessageKey,
    wait
  } = app.utils;

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
      diagnostics
    };
  }

  function createStopController() {
    return {
      stopRequested: false,
      stopAndSaveRequested: false
    };
  }

  function pickBestExtraction(root, adapter) {
    const candidates = adapter.strategies.map((strategy) => {
      const messages = dedupeMessages(collectMessagesForStrategy(root, adapter, strategy));
      return {
        strategyId: strategy.id,
        messages,
        score: scoreMessages(adapter, strategy.id, messages)
      };
    });

    const combinedMessages = dedupeMessages(
      candidates.flatMap((candidate) => candidate.messages)
    );
    candidates.push({
      strategyId: "combined",
      messages: combinedMessages,
      score: scoreMessages(adapter, "combined", combinedMessages)
    });

    return candidates.sort((left, right) => right.score - left.score)[0] || {
      strategyId: "none",
      messages: [],
      score: 0
    };
  }

  async function scrollToTop(scroller, control) {
    let lastPosition = scroller.scrollTop;
    let unchangedSteps = 0;

    while (unchangedSteps < 4) {
      if (control?.stopRequested) {
        break;
      }

      scroller.scrollBy(0, -1600);
      await wait(250);

      if (scroller.scrollTop === 0 || scroller.scrollTop === lastPosition) {
        unchangedSteps += 1;
      } else {
        unchangedSteps = 0;
        lastPosition = scroller.scrollTop;
      }
    }
  }

  function summarizeCandidates(adapter, messagesByStrategy) {
    const candidates = adapter.strategies.map((strategy) => {
      const messages = Array.from(messagesByStrategy.get(strategy.id).values());
      return {
        strategyId: strategy.id,
        messages: dedupeMessages(messages),
        score: scoreMessages(adapter, strategy.id, messages)
      };
    });

    const combinedMessages = dedupeMessages(
      candidates.flatMap((candidate) => candidate.messages)
    );
    candidates.push({
      strategyId: "combined",
      messages: combinedMessages,
      score: scoreMessages(adapter, "combined", combinedMessages)
    });

    return candidates.sort((left, right) => right.score - left.score)[0];
  }

  async function captureWhileScrolling(root, adapter, control = createStopController()) {
    const scroller = getBestScroller(root, adapter);
    const messagesByStrategy = new Map(
      adapter.strategies.map((strategy) => [strategy.id, new Map()])
    );

    await scrollToTop(scroller, control);

    let lastPosition = -1;
    let unchangedSteps = 0;

    while (unchangedSteps < 8) {
      adapter.strategies.forEach((strategy) => {
        collectMessagesForStrategy(root, adapter, strategy).forEach((message) => {
          messagesByStrategy.get(strategy.id).set(stableMessageKey(message), message);
        });
      });

      if (control.stopRequested) {
        return {
          ...summarizeCandidates(adapter, messagesByStrategy),
          partial: control.stopAndSaveRequested
        };
      }

      scroller.scrollBy(0, 1200);
      await wait(350);

      if (scroller.scrollTop === lastPosition) {
        unchangedSteps += 1;
      } else {
        unchangedSteps = 0;
        lastPosition = scroller.scrollTop;
      }
    }

    return {
      ...summarizeCandidates(adapter, messagesByStrategy),
      partial: false
    };
  }

  async function extractConversation(root = document, control = createStopController()) {
    const adapter = app.platforms.findAdapter(globalScope.location.hostname);
    if (!adapter) {
      throw new Error("This website is not supported yet.");
    }

    const diagnostics = {
      apiError: null,
      stateError: null,
      pageError: null
    };

    if (adapter.preferApiExtraction && typeof adapter.fetchConversation === "function") {
      try {
        const apiResult = await adapter.fetchConversation(globalScope);
        if (apiResult.messages.length > 0) {
          return withExtractionMetadata(
            {
              adapter,
              ...apiResult,
              partial: false
            },
            "api",
            diagnostics
          );
        }
      } catch (error) {
        diagnostics.apiError = error.message;
        globalScope.__CHAT_ARCHIVE_LAST_API_ERROR__ = error.message;
      }
    }

    if (adapter.preferStateExtraction && typeof adapter.extractFromState === "function") {
      try {
        const stateResult = await adapter.extractFromState(globalScope);
        if (stateResult.messages.length > 0) {
          return withExtractionMetadata(
            {
              adapter,
              ...stateResult,
              partial: false
            },
            "state",
            diagnostics
          );
        }
      } catch (error) {
        diagnostics.stateError = error.message;
        globalScope.__CHAT_ARCHIVE_LAST_STATE_ERROR__ = error.message;
      }
    }

    if (adapter.preferPageExtraction && typeof adapter.extractFromPage === "function") {
      try {
        const pageResult = await adapter.extractFromPage(globalScope);
        if (pageResult.messages.length > 0) {
          return withExtractionMetadata(
            {
              adapter,
              ...pageResult,
              partial: false
            },
            "page",
            diagnostics
          );
        }
      } catch (error) {
        diagnostics.pageError = error.message;
        globalScope.__CHAT_ARCHIVE_LAST_PAGE_ERROR__ = error.message;
      }
    }

    const result = await captureWhileScrolling(root, adapter, control);
    if (result.messages.length > 0) {
      return withExtractionMetadata(
        {
          adapter,
          ...result
        },
        "dom",
        diagnostics
      );
    }

    const fallback = pickBestExtraction(root, adapter);
    return withExtractionMetadata(
      {
        adapter,
        ...fallback
      },
      "dom",
      diagnostics
    );
  }

  app.extractor = {
    captureWhileScrolling,
    collectMessagesForStrategy,
    createStopController,
    estimateConfidence,
    extractConversation,
    pickBestExtraction,
    scoreMessages
  };
})(window);
