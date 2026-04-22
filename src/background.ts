import {
  archiveTabs,
  closeDuplicateCluster,
  closeTabs,
  deleteSession,
  getAppState,
  getDuplicatePreventionConfig,
  resetDuplicatePreventionConfig,
  restoreSession,
  updateDuplicatePreventionConfig,
  updatePreferences
} from "./lib/state.js";
import { getDomainLabel, normalizeUrl } from "./lib/url.js";
import type {
  ArchiveTabsPayload,
  CloseDuplicateClusterPayload,
  DuplicatePreventionConfig,
  DuplicatePreventionTrigger,
  RestoreSessionPayload,
  UpdateDuplicatePreventionPayload,
  UpdatePreferencesPayload
} from "./lib/types.js";

type RequestMessage =
  | { type: "GET_APP_STATE" }
  | { type: "ARCHIVE_TABS"; payload: ArchiveTabsPayload }
  | { type: "RESTORE_SESSION"; payload: RestoreSessionPayload }
  | { type: "DELETE_SESSION"; payload: { sessionId: string } }
  | { type: "CLOSE_TABS"; payload: { tabIds: number[] } }
  | { type: "CLOSE_DUPLICATE_CLUSTER"; payload: CloseDuplicateClusterPayload }
  | { type: "ACTIVATE_TAB"; payload: { tabId: number; windowId: number } }
  | { type: "OPEN_DASHBOARD"; payload?: { view?: "sessions" | "duplicates" | "all"; query?: string } }
  | { type: "UPDATE_DUPLICATE_PREVENTION_CONFIG"; payload: UpdateDuplicatePreventionPayload }
  | { type: "RUN_DUPLICATE_PREVENTION_NOW" }
  | { type: "UPDATE_PREFERENCES"; payload: UpdatePreferencesPayload };

type ResponseMessage =
  | { ok: true; state?: Awaited<ReturnType<typeof getAppState>> }
  | { ok: false; error: string };

const inFlightDuplicateChecks = new Set<number>();

chrome.runtime.onInstalled.addListener(() => {
  void Promise.all([updatePreferences({}), updateDuplicatePreventionConfig({})]);
});

installDuplicatePreventionConsoleApi();
registerDuplicatePreventionListeners();

chrome.runtime.onMessage.addListener((message: RequestMessage, _sender, sendResponse: (response: ResponseMessage) => void) => {
  void handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected extension error."
      });
    });

  return true;
});

async function handleMessage(message: RequestMessage): Promise<ResponseMessage> {
  switch (message.type) {
    case "GET_APP_STATE":
      return { ok: true, state: await getAppState() };

    case "ARCHIVE_TABS":
      await archiveTabs(message.payload.tabIds, message.payload.name);
      return { ok: true, state: await getAppState() };

    case "RESTORE_SESSION":
      await restoreSession(message.payload.sessionId, message.payload.target);
      return { ok: true, state: await getAppState() };

    case "DELETE_SESSION":
      await deleteSession(message.payload.sessionId);
      return { ok: true, state: await getAppState() };

    case "CLOSE_TABS":
      await closeTabs(message.payload.tabIds);
      return { ok: true, state: await getAppState() };

    case "CLOSE_DUPLICATE_CLUSTER":
      await closeDuplicateCluster(message.payload.duplicateKey, message.payload.keepTabId);
      return { ok: true, state: await getAppState() };

    case "ACTIVATE_TAB":
      await chrome.tabs.update(message.payload.tabId, { active: true });
      await chrome.windows.update(message.payload.windowId, { focused: true });
      return { ok: true, state: await getAppState() };

    case "OPEN_DASHBOARD":
      {
        const dashboardUrl = new URL(chrome.runtime.getURL("dashboard.html"));
        if (message.payload?.view) {
          dashboardUrl.searchParams.set("view", message.payload.view);
        }
        if (message.payload?.query) {
          dashboardUrl.searchParams.set("q", message.payload.query);
        }
        await chrome.tabs.create({ url: dashboardUrl.toString() });
      }
      return { ok: true };

    case "UPDATE_DUPLICATE_PREVENTION_CONFIG":
      await updateDuplicatePreventionConfig(message.payload);
      return { ok: true, state: await getAppState() };

    case "RUN_DUPLICATE_PREVENTION_NOW":
      await runDuplicatePreventionNow();
      return { ok: true, state: await getAppState() };

    case "UPDATE_PREFERENCES":
      await updatePreferences(message.payload);
      return { ok: true, state: await getAppState() };

    default:
      return { ok: false, error: "Unsupported message type." };
  }
}

function registerDuplicatePreventionListeners() {
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id) {
      void enforceDuplicatePreventionForTab(tab.id, "create");
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url && changeInfo.status !== "complete") {
      return;
    }
    void enforceDuplicatePreventionForTab(tabId, "update");
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    void enforceDuplicatePreventionForTab(activeInfo.tabId, "activate");
  });
}

async function enforceDuplicatePreventionForTab(tabId: number, trigger: DuplicatePreventionTrigger) {
  if (inFlightDuplicateChecks.has(tabId)) {
    return;
  }

  inFlightDuplicateChecks.add(tabId);
  try {
    const config = await getDuplicatePreventionConfig();
    if (!config.enabled || !shouldCheckTrigger(config, trigger)) {
      return;
    }

    const tab = await getTabSafely(tabId);
    if (!tab?.id || !tab.url || typeof tab.windowId !== "number" || !shouldEvaluateUrl(tab.url, config)) {
      return;
    }
    const currentTab = tab as chrome.tabs.Tab & { id: number; url: string; windowId: number };

    const allTabs = await chrome.tabs.query(config.sameWindowOnly ? { windowId: currentTab.windowId } : {});
    const duplicates = allTabs.filter(
      (candidate): candidate is chrome.tabs.Tab & { id: number; url: string } =>
        Boolean(
          candidate.id &&
            candidate.id !== currentTab.id &&
            candidate.url &&
            shouldEvaluateUrl(candidate.url, config) &&
            toDuplicateMatchKey(candidate.url, config) === toDuplicateMatchKey(currentTab.url, config)
        )
    );

    if (duplicates.length === 0) {
      return;
    }

    await resolveDuplicateCluster([currentTab, ...duplicates], currentTab.id, config);
  } finally {
    inFlightDuplicateChecks.delete(tabId);
  }
}

async function resolveDuplicateCluster(
  tabs: Array<chrome.tabs.Tab & { id: number; url: string }>,
  sourceTabId: number,
  config: DuplicatePreventionConfig
) {
  const keepTab = pickTabToKeep(tabs, sourceTabId, config);
  const tabIdsToClose = tabs.filter((tab) => tab.id !== keepTab.id).map((tab) => tab.id);

  if (tabIdsToClose.length === 0) {
    return;
  }

  if (tabIdsToClose.includes(sourceTabId)) {
    await chrome.tabs.update(keepTab.id, { active: true });
    if (typeof keepTab.windowId === "number") {
      await chrome.windows.update(keepTab.windowId, { focused: true });
    }
  }

  await chrome.tabs.remove(tabIdsToClose);
}

function pickTabToKeep(
  tabs: Array<chrome.tabs.Tab & { id: number; url: string }>,
  sourceTabId: number,
  config: DuplicatePreventionConfig
): chrome.tabs.Tab & { id: number; url: string } {
  const fallbackTab = tabs[0];
  if (!fallbackTab) {
    throw new Error("Duplicate prevention expected at least one tab.");
  }

  const activeTabs = tabs.filter((tab) => tab.active);
  if (config.keepActiveTab && activeTabs.length > 0) {
    return sortTabsByPreference(activeTabs, sourceTabId, true)[0] ?? activeTabs[0] ?? fallbackTab;
  }

  return sortTabsByPreference(tabs, sourceTabId, config.closeOldTab)[0] ?? fallbackTab;
}

function sortTabsByPreference(
  tabs: Array<chrome.tabs.Tab & { id: number; url: string }>,
  sourceTabId: number,
  newestFirst: boolean
) {
  return [...tabs].sort((left, right) => {
    const leftAccessed = left.lastAccessed ?? 0;
    const rightAccessed = right.lastAccessed ?? 0;
    if (leftAccessed !== rightAccessed) {
      return newestFirst ? rightAccessed - leftAccessed : leftAccessed - rightAccessed;
    }
    if (left.id === sourceTabId) {
      return newestFirst ? -1 : 1;
    }
    if (right.id === sourceTabId) {
      return newestFirst ? 1 : -1;
    }
    return newestFirst ? right.id - left.id : left.id - right.id;
  });
}

function shouldCheckTrigger(config: DuplicatePreventionConfig, trigger: DuplicatePreventionTrigger) {
  switch (trigger) {
    case "create":
      return config.checkOnCreate;
    case "update":
      return config.checkOnUpdate;
    case "activate":
      return config.checkOnActivate;
    default:
      return false;
  }
}

function shouldEvaluateUrl(url: string, config: DuplicatePreventionConfig) {
  if (config.onlyHttp && !/^https?:\/\//i.test(url)) {
    return false;
  }

  const loweredDomain = getDomainLabel(url).toLowerCase();
  if (config.ignoreDomains.some((domain) => matchesIgnoredDomain(loweredDomain, domain))) {
    return false;
  }

  const normalized = toDuplicateMatchKey(url, config);
  return !config.ignoreUrls.some((ignoredUrl) => normalized === normalizeUrl(ignoredUrl, duplicateNormalizationOptions(config)));
}

function matchesIgnoredDomain(hostname: string, ignoredDomain: string) {
  const normalizedIgnoredDomain = ignoredDomain.trim().toLowerCase().replace(/^www\./, "");
  if (!normalizedIgnoredDomain) {
    return false;
  }
  return hostname === normalizedIgnoredDomain || hostname.endsWith(`.${normalizedIgnoredDomain}`);
}

function toDuplicateMatchKey(url: string, config: DuplicatePreventionConfig) {
  return normalizeUrl(url, duplicateNormalizationOptions(config));
}

function duplicateNormalizationOptions(config: DuplicatePreventionConfig) {
  return {
    ignoreHash: config.ignoreHash,
    ignoreSearch: config.ignoreSearch,
    stripTrackingQueryParams: !config.ignoreSearch
  };
}

async function getTabSafely(tabId: number) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

function installDuplicatePreventionConsoleApi() {
  const api = {
    async help() {
      const config = await getDuplicatePreventionConfig();
      console.info(
        [
          "TabHarbor duplicate prevention console API",
          'Use `await tabHarborDuplicatePrevention.getConfig()` to inspect the current config.',
          'Use `await tabHarborDuplicatePrevention.setConfig({ enabled: true, ignoreDomains: ["chrome.google.com"] })` to update it.',
          "Available keys:",
          "enabled, onlyHttp, ignoreSearch, ignoreHash, sameWindowOnly, closeOldTab, keepActiveTab, checkOnCreate, checkOnUpdate, checkOnActivate, ignoreDomains, ignoreUrls",
          "Use `await tabHarborDuplicatePrevention.runNow()` to clean open duplicate tabs with the current rules.",
          "Use `await tabHarborDuplicatePrevention.reset()` to restore the defaults."
        ].join("\n")
      );
      return config;
    },
    async getConfig() {
      return getDuplicatePreventionConfig();
    },
    async setConfig(nextConfig: UpdateDuplicatePreventionPayload) {
      return updateDuplicatePreventionConfig(nextConfig);
    },
    async reset() {
      return resetDuplicatePreventionConfig();
    },
    async runNow() {
      await runDuplicatePreventionNow();
      return getDuplicatePreventionConfig();
    }
  };

  (globalThis as typeof globalThis & { tabHarborDuplicatePrevention?: typeof api }).tabHarborDuplicatePrevention = api;
}

async function runDuplicatePreventionNow() {
  const config = await getDuplicatePreventionConfig();
  const tabs = (await chrome.tabs.query(config.sameWindowOnly ? { currentWindow: true } : {})).filter(
    (tab): tab is chrome.tabs.Tab & { id: number; url: string } =>
      Boolean(tab.id && tab.url && shouldEvaluateUrl(tab.url, config))
  );
  const groups = new Map<string, Array<chrome.tabs.Tab & { id: number; url: string }>>();

  for (const tab of tabs) {
    const scopePrefix = config.sameWindowOnly ? `window:${tab.windowId}:` : "";
    const key = `${scopePrefix}${toDuplicateMatchKey(tab.url, config)}`;
    const cluster = groups.get(key);
    if (cluster) {
      cluster.push(tab);
    } else {
      groups.set(key, [tab]);
    }
  }

  for (const cluster of groups.values()) {
    if (cluster.length > 1) {
      const fallbackTab = cluster[0];
      if (!fallbackTab) {
        continue;
      }
      const sourceTabId = cluster[cluster.length - 1]?.id ?? fallbackTab.id;
      await resolveDuplicateCluster(cluster, sourceTabId, config);
    }
  }
}
