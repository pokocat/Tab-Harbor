import type {
  AppState,
  DuplicatePreventionConfig,
  DuplicateCluster,
  SavedSession,
  StoredTabReference,
  TabSnapshot,
  UpdateDuplicatePreventionPayload,
  UpdatePreferencesPayload
} from "./types.js";
import { isEmptyPage, getDomainLabel, getRootDomainLabel, normalizeUrl } from "./url.js";
import {
  loadDuplicatePreventionConfig,
  loadPreferences,
  loadSessions,
  saveDuplicatePreventionConfig,
  savePreferences,
  saveSessions
} from "./storage.js";

function toSnapshot(tab: chrome.tabs.Tab, staleThresholdMs: number): TabSnapshot | null {
  if (!tab.id || !tab.windowId || !tab.url) {
    return null;
  }

  const lastAccessed = tab.lastAccessed;
  const staleCutoff = Date.now() - staleThresholdMs;

  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title ?? tab.url,
    url: tab.url,
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    audible: Boolean(tab.audible),
    ...(lastAccessed ? { lastAccessed } : {}),
    duplicateKey: normalizeUrl(tab.url),
    domain: getDomainLabel(tab.url),
    rootDomain: getRootDomainLabel(tab.url),
    isEmptyPage: isEmptyPage(tab.url),
    isStale: Boolean(lastAccessed && lastAccessed < staleCutoff && !tab.active && !tab.pinned)
  };
}

function buildDuplicateClusters(tabs: TabSnapshot[]): DuplicateCluster[] {
  const groups = new Map<string, TabSnapshot[]>();

  for (const tab of tabs) {
    const cluster = groups.get(tab.duplicateKey);
    if (cluster) {
      cluster.push(tab);
    } else {
      groups.set(tab.duplicateKey, [tab]);
    }
  }

  return Array.from(groups.entries())
    .filter(([, cluster]) => cluster.length > 1)
    .map(([key, cluster]) => ({
      key,
      label: cluster[0]?.title ?? key,
      tabIds: cluster.map((tab) => tab.id),
      tabs: cluster.sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))
    }))
    .sort((left, right) => right.tabs.length - left.tabs.length);
}

function summarize(
  tabs: TabSnapshot[],
  duplicateClusters: DuplicateCluster[],
  sessions: SavedSession[]
): AppState["summary"] {
  return {
    totalTabs: tabs.length,
    windowCount: new Set(tabs.map((tab) => tab.windowId)).size,
    duplicateTabCount: duplicateClusters.reduce((count, cluster) => count + cluster.tabs.length, 0),
    duplicateClusterCount: duplicateClusters.length,
    staleTabCount: tabs.filter((tab) => tab.isStale).length,
    archivedSessionCount: sessions.length
  };
}

export async function getAppState(): Promise<AppState> {
  const [allTabs, sessions, preferences, duplicatePreventionConfig] = await Promise.all([
    chrome.tabs.query({}),
    loadSessions(),
    loadPreferences(),
    loadDuplicatePreventionConfig()
  ]);

  const staleThresholdMs = preferences.staleThresholdDays * 24 * 60 * 60 * 1000;
  const tabs = allTabs
    .map((tab) => toSnapshot(tab, staleThresholdMs))
    .filter((tab): tab is TabSnapshot => tab !== null)
    .sort((left, right) => {
      if (left.windowId !== right.windowId) {
        return left.windowId - right.windowId;
      }

      return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0);
    });

  const duplicateClusters = buildDuplicateClusters(tabs);

  return {
    tabs,
    duplicateClusters,
    sessions: sessions.sort((left, right) => right.updatedAt - left.updatedAt),
    preferences,
    duplicatePreventionConfig,
    summary: summarize(tabs, duplicateClusters, sessions)
  };
}

export async function archiveTabs(tabIds: number[], providedName?: string): Promise<SavedSession> {
  const tabs = (await chrome.tabs.query({})).filter(
    (tab): tab is chrome.tabs.Tab & { id: number; url: string } => Boolean(tab.id && tab.url && tabIds.includes(tab.id))
  );

  if (tabs.length === 0) {
    throw new Error("No matching tabs were found to archive.");
  }

  const references: StoredTabReference[] = tabs.map((tab) => ({
    title: tab.title ?? tab.url,
    url: tab.url,
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
    pinned: Boolean(tab.pinned)
  }));

  const now = Date.now();
  const session: SavedSession = {
    id: crypto.randomUUID(),
    name: providedName?.trim() || buildDefaultSessionName(references),
    createdAt: now,
    updatedAt: now,
    ...(typeof tabs[0]?.windowId === "number" ? { sourceWindowId: tabs[0].windowId } : {}),
    tabs: references
  };

  const sessions = await loadSessions();
  await saveSessions([session, ...sessions]);
  await chrome.tabs.remove(tabIds);

  return session;
}

function buildDefaultSessionName(tabs: StoredTabReference[]): string {
  const uniqueDomains = Array.from(new Set(tabs.map((tab) => getDomainLabel(tab.url))));
  const domainLabel = uniqueDomains.slice(0, 2).join(" + ");
  const suffix = tabs.length > 1 ? `${tabs.length} tabs` : "1 tab";

  return domainLabel ? `${domainLabel} - ${suffix}` : `Saved session - ${suffix}`;
}

export async function restoreSession(sessionId: string, target: "new-window" | "current-window"): Promise<void> {
  const sessions = await loadSessions();
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error("The selected session no longer exists.");
  }

  const restorableTabs = session.tabs.filter((tab) => Boolean(tab.url));
  if (restorableTabs.length === 0) {
    throw new Error("This session does not contain restorable tabs.");
  }

  if (target === "new-window") {
    const [firstTab, ...remainingTabs] = restorableTabs;
    if (!firstTab) {
      throw new Error("This session does not contain a valid primary tab.");
    }

    const createdWindow = await chrome.windows.create({ url: firstTab.url });
    if (!createdWindow?.id) {
      throw new Error("Chrome did not return a window id for the restored session.");
    }
    const newWindowId = createdWindow.id;

    for (const tab of remainingTabs) {
      await chrome.tabs.create({
        windowId: newWindowId,
        url: tab.url,
        active: false,
        pinned: tab.pinned
      });
    }

    return;
  }

  const currentWindow = await chrome.windows.getCurrent();
  for (const [index, tab] of restorableTabs.entries()) {
    await chrome.tabs.create({
      windowId: currentWindow.id,
      url: tab.url,
      active: index === 0,
      pinned: tab.pinned
    });
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await loadSessions();
  await saveSessions(sessions.filter((session) => session.id !== sessionId));
}

export async function closeTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) {
    return;
  }

  await chrome.tabs.remove(tabIds);
}

export async function closeDuplicateCluster(duplicateKey: string, keepTabId: number): Promise<void> {
  const state = await getAppState();
  const cluster = state.duplicateClusters.find((item) => item.key === duplicateKey);

  if (!cluster) {
    return;
  }

  const tabIdsToClose = cluster.tabIds.filter((tabId) => tabId !== keepTabId);
  await closeTabs(tabIdsToClose);
}

export async function updatePreferences(payload: UpdatePreferencesPayload) {
  const preferences = await loadPreferences();
  const nextPreferences = {
    ...preferences,
    ...payload
  };
  await savePreferences(nextPreferences);
  return nextPreferences;
}

export async function getDuplicatePreventionConfig(): Promise<DuplicatePreventionConfig> {
  return loadDuplicatePreventionConfig();
}

export async function updateDuplicatePreventionConfig(payload: UpdateDuplicatePreventionPayload) {
  const config = await loadDuplicatePreventionConfig();
  const nextConfig: DuplicatePreventionConfig = {
    ...config,
    ...payload,
    ignoreDomains: payload.ignoreDomains ? sanitizeStringList(payload.ignoreDomains) : config.ignoreDomains,
    ignoreUrls: payload.ignoreUrls ? sanitizeStringList(payload.ignoreUrls) : config.ignoreUrls
  };
  await saveDuplicatePreventionConfig(nextConfig);
  return nextConfig;
}

export async function resetDuplicatePreventionConfig(): Promise<DuplicatePreventionConfig> {
  const resetConfig: DuplicatePreventionConfig = {
    enabled: false,
    onlyHttp: true,
    ignoreSearch: true,
    ignoreHash: true,
    sameWindowOnly: true,
    closeOldTab: true,
    keepActiveTab: true,
    checkOnCreate: true,
    checkOnUpdate: true,
    checkOnActivate: true,
    ignoreDomains: [],
    ignoreUrls: []
  };
  await saveDuplicatePreventionConfig(resetConfig);
  return resetConfig;
}

function sanitizeStringList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}
