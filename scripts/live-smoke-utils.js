const { URL } = require("node:url");

const TARGET_DEFINITIONS = [
  {
    id: "chatgpt",
    displayName: "ChatGPT",
    urlEnv: "SMOKE_CHATGPT_URL",
    cookiesEnv: "SMOKE_CHATGPT_COOKIES",
    minMessages: 2,
    requiredAuthors: ["You", "ChatGPT"]
  },
  {
    id: "gemini",
    displayName: "Gemini",
    urlEnv: "SMOKE_GEMINI_URL",
    cookiesEnv: "SMOKE_GEMINI_COOKIES",
    minMessages: 2,
    requiredAuthors: ["You", "Gemini"]
  },
  {
    id: "perplexity",
    displayName: "Perplexity",
    urlEnv: "SMOKE_PERPLEXITY_URL",
    cookiesEnv: "SMOKE_PERPLEXITY_COOKIES",
    minMessages: 2,
    requiredAuthors: ["Perplexity"]
  }
];

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function parseCookieJson(rawValue, baseUrl) {
  const parsed = JSON.parse(rawValue);
  if (!Array.isArray(parsed)) {
    throw new Error("Cookie JSON must be an array.");
  }

  const hostname = new URL(baseUrl).hostname;
  return parsed.map((cookie) => normalizeCookie(cookie, hostname));
}

function normalizeCookie(cookie, hostname) {
  if (!cookie || typeof cookie !== "object" || !cookie.name || typeof cookie.value !== "string") {
    throw new Error("Each cookie must include string name and value fields.");
  }

  return {
    ...cookie,
    domain: cookie.domain || hostname,
    path: cookie.path || "/",
    secure: cookie.secure !== false,
    sameSite: cookie.sameSite || "Lax"
  };
}

function parseCookieHeader(rawValue, baseUrl) {
  const hostname = new URL(baseUrl).hostname;
  return rawValue
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex < 1) {
        throw new Error(`Invalid cookie entry: ${entry}`);
      }

      return {
        name: entry.slice(0, separatorIndex).trim(),
        value: entry.slice(separatorIndex + 1).trim(),
        domain: hostname,
        path: "/",
        secure: true,
        sameSite: "Lax"
      };
    });
}

function parseCookies(rawValue, baseUrl) {
  if (!rawValue || !rawValue.trim()) {
    return [];
  }

  const trimmed = rawValue.trim();
  return trimmed.startsWith("[")
    ? parseCookieJson(trimmed, baseUrl)
    : parseCookieHeader(trimmed, baseUrl);
}

function getTargetConfigs(env = process.env) {
  return TARGET_DEFINITIONS.map((definition) => {
    const url = env[definition.urlEnv]?.trim() || "";
    const cookiesInput = env[definition.cookiesEnv]?.trim() || "";

    if (!url) {
      return {
        ...definition,
        enabled: false,
        status: "skipped",
        skipReason: `${definition.urlEnv} is not configured.`,
        cookies: []
      };
    }

    return {
      ...definition,
      enabled: true,
      status: "pending",
      url,
      cookies: parseCookies(cookiesInput, url)
    };
  });
}

function assessExtraction(target, extraction) {
  if (!extraction) {
    return {
      status: "failed",
      failureReason: "No extraction result was returned."
    };
  }

  if (!Number.isInteger(extraction.messageCount) || extraction.messageCount < target.minMessages) {
    return {
      status: "failed",
      failureReason: `Expected at least ${target.minMessages} messages but captured ${extraction.messageCount || 0}.`
    };
  }

  const authors = Array.isArray(extraction.authors) ? extraction.authors : [];
  const missingAuthors = target.requiredAuthors.filter((author) => !authors.includes(author));
  if (missingAuthors.length > 0) {
    return {
      status: "failed",
      failureReason: `Missing expected authors: ${missingAuthors.join(", ")}.`
    };
  }

  return {
    status: "passed",
    failureReason: null
  };
}

function summarizeResultLine(result) {
  if (result.status === "skipped") {
    return `- SKIP ${result.displayName}: ${result.skipReason}`;
  }

  if (result.status === "failed") {
    const source = result.extraction?.source || "unknown";
    const strategy = result.extraction?.strategyId || "unknown";
    return `- FAIL ${result.displayName}: ${result.failureReason} (source: ${source}, strategy: ${strategy})`;
  }

  return `- PASS ${result.displayName}: ${result.extraction.messageCount} messages via ${result.extraction.source}/${result.extraction.strategyId}`;
}

function buildLiveSmokeSummary(results, version = "unknown") {
  const counts = results.reduce(
    (accumulator, result) => {
      accumulator[result.status] += 1;
      return accumulator;
    },
    {
      passed: 0,
      failed: 0,
      skipped: 0
    }
  );

  return [
    "# Live Smoke Summary",
    "",
    `- Version: ${version}`,
    `- Passed: ${counts.passed}`,
    `- Failed: ${counts.failed}`,
    `- Skipped: ${counts.skipped}`,
    "",
    "## Targets",
    ...results.map((result) => summarizeResultLine(result)),
    ""
  ].join("\n");
}

module.exports = {
  TARGET_DEFINITIONS,
  assessExtraction,
  buildLiveSmokeSummary,
  getTargetConfigs,
  parseCookies,
  sanitizeName
};
