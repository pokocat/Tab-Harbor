import { TRACKING_QUERY_PREFIXES } from "./constants.js";

function canParse(url: string): boolean {
  return /^https?:\/\//.test(url);
}

export function getDomainLabel(url: string): string {
  if (!canParse(url)) {
    return "Browser / Local";
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Unknown";
  }
}

const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.au",
  "net.au",
  "org.au",
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "com.hk",
  "com.sg"
]);

export function getRootDomainLabel(url: string): string {
  if (!canParse(url)) {
    return "Browser / Local";
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);

    if (parts.length <= 2) {
      return hostname;
    }

    const lastTwo = `${parts.at(-2)}.${parts.at(-1)}`;
    if (COMMON_SECOND_LEVEL_SUFFIXES.has(lastTwo) && parts.length >= 3) {
      return `${parts.at(-3)}.${lastTwo}`;
    }

    return `${parts.at(-2)}.${parts.at(-1)}`;
  } catch {
    return "Unknown";
  }
}

export function normalizeUrl(url: string): string {
  if (!canParse(url)) {
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";

    const paramsToDelete: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (TRACKING_QUERY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        paramsToDelete.push(key);
      }
    });

    for (const key of paramsToDelete) {
      parsed.searchParams.delete(key);
    }

    const sortedParams = Array.from(parsed.searchParams)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    const normalizedSearch = sortedParams
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    parsed.search = normalizedSearch ? `?${normalizedSearch}` : "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isEmptyPage(url: string): boolean {
  return url === "chrome://newtab/" || url === "about:blank";
}

function decodeUrlPart(value: string): string {
  if (!value) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function summarizeDisplayUrl(url: string, locale = chrome.i18n.getUILanguage()): string {
  const isChinese = locale.toLowerCase().startsWith("zh");
  try {
    const parsed = new URL(url);

    if (parsed.protocol === "chrome:" || parsed.protocol === "about:" || parsed.protocol === "edge:") {
      const detail = `${decodeUrlPart(parsed.hostname)}${decodeUrlPart(parsed.pathname)}`.trim();
      return detail || (isChinese ? "浏览器页面" : "Browser page");
    }

    const path = parsed.pathname === "/" ? "" : decodeUrlPart(parsed.pathname);
    const search = parsed.search ? decodeUrlPart(parsed.search) : "";
    const detail = `${path}${search}`.trim();
    return detail || (isChinese ? "首页" : "Homepage");
  } catch {
    return isChinese ? "浏览器页面" : "Browser page";
  }
}
