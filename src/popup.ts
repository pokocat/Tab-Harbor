import { formatRelativeTime } from "./lib/format.js";
import { createI18n, type I18nApi } from "./lib/i18n.js";
import { getState, sendMessage } from "./lib/runtime.js";
import { playUiSound } from "./lib/sound.js";
import { summarizeDisplayUrl } from "./lib/url.js";
import type { AppState, DuplicateCluster, SavedSession, TabSnapshot } from "./lib/types.js";

type PopupGroupMode = "domain" | "none";
type PopupSortMode = "recent" | "title";

const summaryGrid = mustElement("summary-grid");
const suggestionsList = mustElement("suggestions-list");
const currentWindowList = mustElement("current-window-list");
const sessionsList = mustElement("sessions-list");
const duplicateClustersList = mustElement("duplicate-clusters-list");
const quickSearchInput = mustInput("quick-search-input");
const currentWindowSearchInput = mustInput("current-window-search-input");
const quickSearchResults = mustElement("quick-search-results");
const soundEnabledToggle = mustInput("sound-enabled-toggle");
const heroQuote = mustElement("hero-quote");
const currentWindowMeta = mustElement("current-window-meta");
const popupGroupSelect = mustElement("popup-group-select");
const popupSortSelect = mustElement("popup-sort-select");
const archiveWindowButton = mustButton("archive-window-button");
const closeDuplicatesButton = mustButton("close-duplicates-button");
const openDashboardButton = mustButton("open-dashboard-button");
const metricTemplate = document.querySelector<HTMLTemplateElement>("#metric-template");

let state: AppState | null = null;
let popupGroupMode: PopupGroupMode = "domain";
let popupSortMode: PopupSortMode = "recent";
let i18n: I18nApi = createI18n("auto");

void initialize();

async function initialize() {
  state = await getState();
  i18n = createI18n(state.preferences.locale);
  applyStaticCopy();
  soundEnabledToggle.checked = state.preferences.soundEnabled;
  setRadioGroupValue(popupGroupSelect, popupGroupMode);
  setRadioGroupValue(popupSortSelect, popupSortMode);
  heroQuote.textContent = pickHeroQuote();
  render(state);
  bindEvents();
}

function bindEvents() {
  quickSearchInput.addEventListener("input", () => state && renderQuickSearch(state));
  currentWindowSearchInput.addEventListener("input", () => state && renderCurrentWindow(state.tabs));
  soundEnabledToggle.addEventListener("change", () => void updateSoundPreference());
  popupGroupSelect.addEventListener("change", () => {
    popupGroupMode = getRadioGroupValue(popupGroupSelect) as PopupGroupMode;
    if (state) {
      renderCurrentWindow(state.tabs);
    }
  });
  popupSortSelect.addEventListener("change", () => {
    popupSortMode = getRadioGroupValue(popupSortSelect) as PopupSortMode;
    if (state) {
      renderCurrentWindow(state.tabs);
    }
  });
  archiveWindowButton.addEventListener("click", () => void archiveCurrentWindow());
  closeDuplicatesButton.addEventListener("click", () => void closeDuplicates());
  openDashboardButton.addEventListener("click", () => void openDashboard("all"));
}

function render(appState: AppState) {
  renderSummary(appState);
  renderDuplicateClusters(appState.duplicateClusters);
  renderQuickSearch(appState);
  renderSuggestions(appState);
  renderCurrentWindow(appState.tabs);
  renderSessions(appState.sessions);
}

function renderSummary(appState: AppState) {
  summaryGrid.replaceChildren();

  const metrics: Array<{
    label: string;
    value: number;
    linkLabel?: string;
    view?: "sessions" | "duplicates" | "all";
  }> = [
    { label: i18n.t("popup.metric.openTabs"), value: appState.summary.totalTabs },
    { label: i18n.t("popup.metric.windows"), value: appState.summary.windowCount },
    { label: i18n.t("popup.metric.duplicates"), value: appState.summary.duplicateTabCount, linkLabel: i18n.t("popup.metric.reviewDuplicates"), view: "duplicates" },
    { label: i18n.t("popup.metric.archived"), value: appState.summary.archivedSessionCount, linkLabel: i18n.t("popup.metric.openArchived"), view: "sessions" }
  ];

  for (const { label, value, linkLabel, view } of metrics) {
    if (!metricTemplate) {
      continue;
    }

    const fragment = metricTemplate.content.cloneNode(true) as DocumentFragment;
    const labelElement = fragment.querySelector(".metric-label");
    const valueElement = fragment.querySelector(".metric-value");
    const linkElement = fragment.querySelector<HTMLButtonElement>(".metric-link");
    if (!labelElement || !valueElement || !linkElement) {
      continue;
    }

    labelElement.textContent = label;
    valueElement.textContent = String(value);
    if (linkLabel && view && value > 0) {
      linkElement.hidden = false;
      linkElement.textContent = linkLabel;
      linkElement.addEventListener("click", () => void openDashboard(view));
    }
    summaryGrid.append(fragment);
  }
}

function renderQuickSearch(appState: AppState) {
  quickSearchResults.replaceChildren();

  const query = quickSearchInput.value.trim().toLowerCase();
  if (!query) {
    const empty = document.createElement("article");
    empty.className = "suggestion";
    empty.innerHTML = `<p class="row-title">${i18n.t("popup.search.helpTitle")}</p><p class="row-meta">${i18n.t("popup.search.helpMeta")}</p>`;
    quickSearchResults.append(empty);
    return;
  }

  const matchingTabs = appState.tabs
    .filter((tab) => `${tab.title} ${tab.url} ${tab.domain}`.toLowerCase().includes(query))
    .slice(0, 4);

  const matchingSessions = appState.sessions
    .filter((session) => `${session.name} ${session.tabs.map((tab) => `${tab.title} ${tab.url}`).join(" ")}`.toLowerCase().includes(query))
    .slice(0, 3);

  for (const tab of matchingTabs) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "suggestion search-result";
    item.innerHTML = `
      <div class="search-result-main">
        <div class="tab-title-line">
          ${renderFavicon(tab)}
          <p class="row-title tab-title-text">${escapeHtml(tab.title)}</p>
          <span class="search-tag">${i18n.t("popup.search.tag.tab")}</span>
        </div>
        <p class="row-meta">${formatTabMeta(tab)}</p>
      </div>
    `;
    item.addEventListener("click", () => void activateTab(tab.id, tab.windowId));
    quickSearchResults.append(item);
  }

  for (const session of matchingSessions) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "suggestion search-result";
    item.innerHTML = `
      <p class="row-title"><span>${escapeHtml(session.name)}</span><span class="search-tag">${i18n.t("popup.search.tag.session")}</span></p>
      <p class="row-meta">${i18n.t("popup.sessions.saved", { count: session.tabs.length, time: formatRelativeTime(session.updatedAt, i18n.locale) })}</p>
    `;
    item.addEventListener("click", () => void restoreSession(session.id, "current-window"));
    quickSearchResults.append(item);
  }

  if (matchingTabs.length === 0 && matchingSessions.length === 0) {
    const empty = document.createElement("article");
    empty.className = "suggestion";
    empty.innerHTML = `<p class="row-title">${i18n.t("popup.search.noMatches", { query: escapeHtml(query) })}</p>`;
    quickSearchResults.append(empty);
  }
}

function renderDuplicateClusters(clusters: DuplicateCluster[]) {
  duplicateClustersList.replaceChildren();

  if (clusters.length === 0) {
    const empty = document.createElement("article");
    empty.className = "suggestion";
    empty.innerHTML = `<p class="row-title">${i18n.t("popup.duplicates.emptyTitle")}</p><p class="row-meta">${i18n.t("popup.duplicates.emptyMeta")}</p>`;
    duplicateClustersList.append(empty);
    return;
  }

  for (const cluster of clusters.slice(0, 3)) {
    const item = document.createElement("article");
    item.className = "suggestion duplicate-row";
    item.innerHTML = `
      <div>
        <p class="row-title">${escapeHtml(cluster.label)}</p>
        <p class="row-meta">${i18n.t("popup.duplicates.keepNewest", { count: cluster.tabs.length })}</p>
      </div>
      <button type="button" class="duplicate-action" data-action="close-cluster">${i18n.t("popup.duplicates.clean")}</button>
    `;
    item.querySelector<HTMLButtonElement>('[data-action="close-cluster"]')?.addEventListener("click", () => {
      void closeCluster(cluster);
    });
    duplicateClustersList.append(item);
  }
}

function renderSuggestions(appState: AppState) {
  suggestionsList.replaceChildren();

  const suggestions: string[] = [];
  if (appState.summary.duplicateClusterCount > 0) {
    suggestions.push(i18n.t("popup.suggestion.duplicates", { count: appState.summary.duplicateClusterCount }));
  }
  if (appState.summary.staleTabCount > 0) {
    suggestions.push(i18n.t("popup.suggestion.stale", { count: appState.summary.staleTabCount }));
  }
  if (appState.summary.totalTabs > 20) {
    suggestions.push(i18n.t("popup.suggestion.totalTabs", { count: appState.summary.totalTabs }));
  }

  if (suggestions.length === 0) {
    suggestions.push(i18n.t("popup.suggestion.healthy"));
  }

  for (const message of suggestions) {
    const item = document.createElement("article");
    item.className = "suggestion";
    item.innerHTML = `<p class="row-title">${message}</p>`;
    suggestionsList.append(item);
  }
}

function renderCurrentWindow(tabs: TabSnapshot[]) {
  currentWindowList.replaceChildren();

  const currentWindowId = tabs.find((tab) => tab.active)?.windowId ?? tabs[0]?.windowId;
  const query = currentWindowSearchInput.value.trim().toLowerCase();
  const currentWindowTabs = tabs.filter((tab) => tab.windowId === currentWindowId);
  const visibleTabs = currentWindowTabs
    .filter((tab) => {
      if (!query) {
        return true;
      }
      return `${tab.title} ${tab.url} ${tab.domain} ${tab.rootDomain}`.toLowerCase().includes(query);
    })
    .slice(0, 10);
  currentWindowMeta.textContent = describeCurrentWindowMeta(visibleTabs.length, currentWindowTabs.length, Boolean(query));

  if (currentWindowTabs.length === 0) {
    const empty = document.createElement("article");
    empty.className = "suggestion";
    empty.innerHTML = `<p class="row-title">${i18n.t("popup.current.empty")}</p>`;
    currentWindowList.append(empty);
    return;
  }

  if (visibleTabs.length === 0) {
    const empty = document.createElement("article");
    empty.className = "suggestion";
    empty.innerHTML = `<p class="row-title">${i18n.t("popup.current.noMatchTitle", { query: escapeHtml(query) })}</p><p class="row-meta">${i18n.t("popup.current.noMatchMeta")}</p>`;
    currentWindowList.append(empty);
    return;
  }

  const sortedTabs = sortPopupTabs(visibleTabs, popupSortMode);
  if (popupGroupMode === "none") {
    const list = document.createElement("div");
    list.className = "stack dense-list";

    for (const tab of sortedTabs) {
      list.append(createTabRow(tab));
    }

    currentWindowList.append(list);
    return;
  }

  const groups = groupTabsByRootDomain(sortedTabs);

  for (const [rootDomain, groupTabs] of groups) {
    const group = document.createElement("section");
    group.className = "domain-group";
    group.innerHTML = `
      <div class="domain-group-header">
        <p class="domain-group-title">${escapeHtml(rootDomain)}</p>
        <span class="domain-group-count">${groupTabs.length}</span>
      </div>
    `;

    const list = document.createElement("div");
    list.className = "stack dense-list";

    for (const tab of groupTabs) {
      list.append(createTabRow(tab));
    }

    group.append(list);
    currentWindowList.append(group);
  }
}

function renderSessions(sessions: SavedSession[]) {
  sessionsList.replaceChildren();

  if (sessions.length === 0) {
    const empty = document.createElement("article");
    empty.className = "session-row";
    empty.innerHTML = `<p class="row-title">${i18n.t("popup.sessions.emptyTitle")}</p><p class="row-meta">${i18n.t("popup.sessions.emptyMeta")}</p>`;
    sessionsList.append(empty);
    return;
  }

  for (const session of sessions.slice(0, 3)) {
    const item = document.createElement("article");
    item.className = "session-row";
    item.innerHTML = `
      <p class="row-title">${escapeHtml(session.name)}</p>
      <p class="row-meta">${i18n.t("popup.sessions.saved", { count: session.tabs.length, time: formatRelativeTime(session.updatedAt, i18n.locale) })}</p>
      <div class="session-actions">
        <button type="button" data-action="current">${i18n.t("popup.sessions.restoreHere")}</button>
        <button type="button" data-action="new">${i18n.t("popup.sessions.newWindow")}</button>
      </div>
    `;

    item.querySelector<HTMLButtonElement>('[data-action="current"]')?.addEventListener("click", () => {
      void restoreSession(session.id, "current-window");
    });
    item.querySelector<HTMLButtonElement>('[data-action="new"]')?.addEventListener("click", () => {
      void restoreSession(session.id, "new-window");
    });
    sessionsList.append(item);
  }
}

async function archiveCurrentWindow() {
  if (!state) {
    return;
  }

  const currentWindowId = state.tabs.find((tab) => tab.active)?.windowId ?? state.tabs[0]?.windowId;
  if (!currentWindowId) {
    return;
  }

  const tabIds = state.tabs.filter((tab) => tab.windowId === currentWindowId).map((tab) => tab.id);
  const response = await sendMessage({ type: "ARCHIVE_TABS", payload: { tabIds } });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "archive");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyStaticCopy();
    soundEnabledToggle.checked = state.preferences.soundEnabled;
    render(state);
  }
}

async function closeDuplicates() {
  if (!state) {
    return;
  }

  const clusters = state.duplicateClusters;
  if (clusters.length === 0) {
    return;
  }

  for (const cluster of clusters) {
    await closeCluster(cluster);
  }
}

async function closeCluster(cluster: DuplicateCluster) {
  const keepTabId = cluster.tabs[0]?.id;
  if (!keepTabId) {
    return;
  }

  const response = await sendMessage({
    type: "CLOSE_DUPLICATE_CLUSTER",
    payload: { duplicateKey: cluster.key, keepTabId }
  });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "close");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyStaticCopy();
    soundEnabledToggle.checked = state.preferences.soundEnabled;
    render(state);
  }
}

async function restoreSession(sessionId: string, target: "new-window" | "current-window") {
  const response = await sendMessage({ type: "RESTORE_SESSION", payload: { sessionId, target } });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "restore");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyStaticCopy();
    soundEnabledToggle.checked = state.preferences.soundEnabled;
    render(state);
  }
}

async function activateTab(tabId: number, windowId: number) {
  await sendMessage({ type: "ACTIVATE_TAB", payload: { tabId, windowId } });
  await playUiSound(state?.preferences, "focus");
}

async function closeSingleTab(tabId: number) {
  const response = await sendMessage({ type: "CLOSE_TABS", payload: { tabIds: [tabId] } });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "close");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyStaticCopy();
    soundEnabledToggle.checked = state.preferences.soundEnabled;
    render(state);
  }
}

async function openDashboard(view: "sessions" | "duplicates" | "all") {
  const query = quickSearchInput.value.trim();
  await sendMessage({
    type: "OPEN_DASHBOARD",
    payload: {
      view,
      ...(query ? { query } : {})
    }
  });
}

async function updateSoundPreference() {
  const response = await sendMessage({
    type: "UPDATE_PREFERENCES",
    payload: { soundEnabled: soundEnabledToggle.checked }
  });
  if (response.ok && response.state) {
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyStaticCopy();
    soundEnabledToggle.checked = state.preferences.soundEnabled;
    await playUiSound(state.preferences, "focus");
    render(state);
  }
}

function mustElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

function mustButton(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing required button: ${id}`);
  }
  return element;
}

function mustInput(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing required input: ${id}`);
  }
  return element;
}

function renderFavicon(tab: Pick<TabSnapshot, "favIconUrl" | "domain">): string {
  if (tab.favIconUrl) {
    return `<img class="tab-favicon" src="${escapeAttribute(tab.favIconUrl)}" alt="" />`;
  }

  return `<span class="tab-favicon" aria-hidden="true" title="${escapeAttribute(tab.domain)}"></span>`;
}

function formatTabMeta(tab: Pick<TabSnapshot, "url" | "lastAccessed">): string {
  return `${summarizeDisplayUrl(tab.url, i18n.locale)} · ${formatRelativeTime(tab.lastAccessed, i18n.locale)}`;
}

function createTabRow(tab: TabSnapshot): HTMLElement {
  const item = document.createElement("article");
  item.className = "tab-row";
  item.innerHTML = `
    <div class="tab-main">
      <div class="tab-title-line">
        ${renderFavicon(tab)}
        <p class="row-title tab-title-text">${escapeHtml(tab.title)}</p>
      </div>
      <p class="row-meta">${formatTabMeta(tab)}</p>
    </div>
    <div class="tab-row-actions">
      <button type="button" class="icon-button focus" data-action="focus" aria-label="${escapeAttribute(i18n.t("popup.button.focusAria", { title: tab.title }))}">${i18n.t("popup.button.focus")}</button>
      <button type="button" class="icon-button close" data-action="close" aria-label="${escapeAttribute(i18n.t("popup.button.closeAria", { title: tab.title }))}">${i18n.t("popup.button.close")}</button>
    </div>
  `;
  item.querySelector<HTMLButtonElement>('[data-action="focus"]')?.addEventListener("click", () => {
    void activateTab(tab.id, tab.windowId);
  });
  item.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener("click", () => {
    void closeSingleTab(tab.id);
  });
  return item;
}

function describeCurrentWindowMeta(visibleTabs: number, totalTabs: number, filtered: boolean): string {
  const sortLabel = popupSortMode === "title" ? i18n.t("popup.sortLabel.title") : i18n.t("popup.sortLabel.recent");
  if (popupGroupMode === "domain") {
    return i18n.t(filtered ? "popup.current.groupedFiltered" : "popup.current.grouped", { visible: visibleTabs, total: totalTabs, sort: sortLabel });
  }
  return i18n.t(filtered ? "popup.current.flatFiltered" : "popup.current.flat", { visible: visibleTabs, total: totalTabs, sort: sortLabel });
}

function groupTabsByRootDomain(tabs: TabSnapshot[]): Map<string, TabSnapshot[]> {
  const groups = new Map<string, TabSnapshot[]>();

  for (const tab of tabs) {
    const bucket = groups.get(tab.rootDomain);
    if (bucket) {
      bucket.push(tab);
    } else {
      groups.set(tab.rootDomain, [tab]);
    }
  }

  return new Map(
    Array.from(groups.entries()).sort((left, right) => {
      if (right[1].length !== left[1].length) {
        return right[1].length - left[1].length;
      }
      return left[0].localeCompare(right[0]);
    })
  );
}

function sortPopupTabs(tabs: TabSnapshot[], sort: PopupSortMode): TabSnapshot[] {
  return [...tabs].sort((left, right) => {
    switch (sort) {
      case "title":
        return left.title.localeCompare(right.title);
      case "recent":
      default:
        return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0);
    }
  });
}

function pickHeroQuote(): string {
  const quotes = ["popup.quote.1", "popup.quote.2", "popup.quote.3", "popup.quote.4", "popup.quote.5"] as const;
  const index = Math.floor(Math.random() * quotes.length);
  return i18n.t(quotes[index] ?? quotes[0]);
}

function applyStaticCopy() {
  document.title = i18n.t("popup.title");
  document.documentElement.lang = i18n.locale;
  setText("popup-brand", i18n.t("popup.hero.brand"));
  setText("popup-quick-actions-title", i18n.t("popup.section.quickActions"));
  setText("popup-sound-label", i18n.t("popup.sound.label"));
  mustElement("popup-sound-switch").setAttribute("aria-label", i18n.t("popup.sound.aria"));
  setText("popup-action-archive-label", i18n.t("popup.action.archive"));
  setText("popup-action-dedup-label", i18n.t("popup.action.dedup"));
  setText("popup-action-manage-label", i18n.t("popup.action.manage"));
  setText("popup-current-window-title", i18n.t("popup.section.currentWindow"));
  setText("popup-group-label", i18n.t("popup.group.label"));
  popupGroupSelect.setAttribute("aria-label", i18n.t("popup.group.aria"));
  setText("popup-group-domain-label", i18n.t("popup.group.domain"));
  setText("popup-group-none-label", i18n.t("popup.group.none"));
  setText("popup-sort-label", i18n.t("popup.sort.label"));
  popupSortSelect.setAttribute("aria-label", i18n.t("popup.sort.aria"));
  setText("popup-sort-recent-label", i18n.t("popup.sort.recent"));
  setText("popup-sort-title-label", i18n.t("popup.sort.title"));
  currentWindowSearchInput.setAttribute("aria-label", i18n.t("popup.currentSearch.aria"));
  currentWindowSearchInput.placeholder = i18n.t("popup.currentSearch.placeholder");
  setText("popup-duplicates-title", i18n.t("popup.section.duplicates"));
  setText("popup-quick-search-title", i18n.t("popup.section.quickSearch"));
  quickSearchInput.setAttribute("aria-label", i18n.t("popup.quickSearch.aria"));
  quickSearchInput.placeholder = i18n.t("popup.quickSearch.placeholder");
  setText("popup-suggestions-title", i18n.t("popup.section.suggestions"));
  setText("popup-sessions-title", i18n.t("popup.section.sessions"));
  setText("popup-contact-link", i18n.t("popup.footer.contact"));
  setText("popup-issues-link", i18n.t("popup.footer.issues"));
}

function setText(id: string, value: string) {
  mustElement(id).textContent = value;
}

function getRadioGroupValue(container: HTMLElement): string {
  const checked = container.querySelector<HTMLInputElement>('input[type="radio"]:checked');
  if (!checked) {
    throw new Error(`Missing checked radio value in ${container.id}`);
  }
  return checked.value;
}

function setRadioGroupValue(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[type="radio"][value="${CSS.escape(value)}"]`);
  if (!input) {
    throw new Error(`Missing radio option "${value}" in ${container.id}`);
  }
  input.checked = true;
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
