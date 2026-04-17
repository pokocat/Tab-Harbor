import { formatRelativeTime } from "./lib/format.js";
import { createI18n, type I18nApi } from "./lib/i18n.js";
import { getState, sendMessage } from "./lib/runtime.js";
import { playUiSound } from "./lib/sound.js";
import { summarizeDisplayUrl } from "./lib/url.js";
import type { AppState, SavedSession, TabSnapshot } from "./lib/types.js";

type FilterMode = "all" | "current-window" | "duplicates" | "stale" | "sessions";
type GroupMode = "none" | "window" | "domain";
type SortMode = "recent" | "title" | "domain";

const searchInput = must<HTMLInputElement>("search-input");
const groupBySelect = must<HTMLSelectElement>("group-by-select");
const sortBySelect = must<HTMLSelectElement>("sort-by-select");
const staleThresholdSelect = must<HTMLSelectElement>("stale-threshold-select");
const filterList = must<HTMLElement>("filter-list");
const summaryList = must<HTMLElement>("summary-list");
const listTitle = must<HTMLElement>("list-title");
const listSubtitle = must<HTMLElement>("list-subtitle");
const tabGroups = must<HTMLElement>("tab-groups");
const sessionsPanel = must<HTMLElement>("sessions-panel");
const archiveSelectedButton = must<HTMLButtonElement>("archive-selected-button");
const closeAllDuplicatesButton = must<HTMLButtonElement>("close-all-duplicates-button");
const closeSelectedButton = must<HTMLButtonElement>("close-selected-button");
const soundEnabledCheckbox = must<HTMLInputElement>("sound-enabled-checkbox");
const localeSelect = must<HTMLSelectElement>("locale-select");

let state: AppState | null = null;
let activeFilter: FilterMode = "all";
const selectedTabIds = new Set<number>();
const collapsedWindowIds = new Set<number>();
let sortMode: SortMode = "recent";
let i18n: I18nApi = createI18n("auto");

void initialize();

async function initialize() {
  state = await getState();
  i18n = createI18n(state.preferences.locale);
  applyQueryState();
  applyPreferences(state);
  applyStaticCopy();
  render();
  bindEvents();
}

function bindEvents() {
  searchInput.addEventListener("input", () => render());
  groupBySelect.addEventListener("change", () => void handleGroupByChange());
  sortBySelect.addEventListener("change", () => {
    sortMode = sortBySelect.value as SortMode;
    render();
  });
  staleThresholdSelect.addEventListener("change", () => void handleThresholdChange());
  soundEnabledCheckbox.addEventListener("change", () => void handleSoundChange());
  localeSelect.addEventListener("change", () => void handleLocaleChange());
  archiveSelectedButton.addEventListener("click", () => void archiveSelected());
  closeAllDuplicatesButton.addEventListener("click", () => void closeAllDuplicates());
  closeSelectedButton.addEventListener("click", () => void closeSelected());

  filterList.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter as FilterMode;
      setActiveFilterButton();
      render();
    });
  });
}

function applyPreferences(appState: AppState) {
  groupBySelect.value = appState.preferences.groupByDefault;
  staleThresholdSelect.value = String(appState.preferences.staleThresholdDays);
  soundEnabledCheckbox.checked = appState.preferences.soundEnabled;
  localeSelect.value = appState.preferences.locale;
  sortBySelect.value = sortMode;
}

function applyQueryState() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const query = params.get("q");

  if (query) {
    searchInput.value = query;
  }

  if (view === "sessions" || view === "duplicates" || view === "all") {
    activeFilter = view === "sessions" ? "sessions" : view === "duplicates" ? "duplicates" : "all";
    setActiveFilterButton();
  }
}

function setActiveFilterButton() {
  filterList.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === activeFilter);
  });
}

function render() {
  if (!state) {
    return;
  }

  renderSummary(state);

  if (activeFilter === "sessions") {
    renderSessions(state.sessions);
    tabGroups.replaceChildren();
    listTitle.textContent = i18n.t("dashboard.list.archivedSessions");
    listSubtitle.textContent = i18n.t("dashboard.list.savedSessions", { count: state.sessions.length });
    return;
  }

  sessionsPanel.replaceChildren();
  const filteredTabs = filterTabs(state.tabs);
  const groupedTabs = groupTabs(filteredTabs, groupBySelect.value as GroupMode, sortMode);

  listTitle.textContent = titleForFilter(activeFilter);
  listSubtitle.textContent = i18n.t("dashboard.list.visibleTabs", { visible: filteredTabs.length, selected: selectedTabIds.size });

  tabGroups.replaceChildren();
  for (const [groupName, tabs] of groupedTabs) {
    const groupCard = document.createElement("section");
    groupCard.className = "group-card";
    const groupWindowId = groupBySelect.value === "window" ? tabs[0]?.windowId ?? null : null;
    const isCollapsed = groupWindowId !== null && collapsedWindowIds.has(groupWindowId);
    const groupDuplicateCloseIds =
      groupBySelect.value === "window" && groupWindowId !== null
        ? getWindowDuplicateCloseIds(state.tabs, groupWindowId)
        : [];
    if (isCollapsed) {
      groupCard.classList.add("collapsed");
    }
    groupCard.innerHTML = `
      <div class="group-header">
        <div>
          <h3 class="group-title">${escapeHtml(groupName)}</h3>
          <p class="group-meta">${i18n.t("dashboard.group.tabs", { count: tabs.length })}</p>
        </div>
        <div class="group-header-actions">
          ${
            groupWindowId !== null
              ? `<button type="button" class="action-button ghost collapse-button" data-action="toggle-collapse">${i18n.t(
                  isCollapsed ? "dashboard.group.expand" : "dashboard.group.collapse"
                )}</button>`
              : ""
          }
          ${
            groupDuplicateCloseIds.length > 0
              ? `<button type="button" class="action-button danger" data-action="close-window-duplicates">${i18n.t("dashboard.group.closeWindowDuplicates", { count: groupDuplicateCloseIds.length })}</button>`
              : ""
          }
        </div>
      </div>
    `;

    groupCard
      .querySelector<HTMLButtonElement>('[data-action="toggle-collapse"]')
      ?.addEventListener("click", () => {
        if (groupWindowId === null) {
          return;
        }
        if (collapsedWindowIds.has(groupWindowId)) {
          collapsedWindowIds.delete(groupWindowId);
        } else {
          collapsedWindowIds.add(groupWindowId);
        }
        render();
      });

    groupCard
      .querySelector<HTMLButtonElement>('[data-action="close-window-duplicates"]')
      ?.addEventListener("click", () => void closeTabs(groupDuplicateCloseIds, "close"));

    const list = document.createElement("div");
    list.className = "tab-list";

    for (const tab of tabs) {
      list.append(renderTabCard(tab));
    }

    groupCard.append(list);
    tabGroups.append(groupCard);
  }
}

function renderSummary(appState: AppState) {
  summaryList.replaceChildren();
  const rows: Array<[string, number]> = [
    [i18n.t("dashboard.summary.openTabs"), appState.summary.totalTabs],
    [i18n.t("dashboard.summary.duplicateGroups"), appState.summary.duplicateClusterCount],
    [i18n.t("dashboard.summary.staleTabs"), appState.summary.staleTabCount],
    [i18n.t("dashboard.summary.archivedSessions"), appState.summary.archivedSessionCount]
  ];

  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    summaryList.append(row);
  }
}

function renderTabCard(tab: TabSnapshot): HTMLElement {
  const article = document.createElement("article");
  article.className = "tab-card";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selectedTabIds.has(tab.id);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      selectedTabIds.add(tab.id);
    } else {
      selectedTabIds.delete(tab.id);
    }
    render();
  });

  const content = document.createElement("div");
  content.className = "tab-main";
  content.innerHTML = `
    <div class="tab-title-row">
      ${renderFavicon(tab)}
      <p class="tab-title">${escapeHtml(tab.title)}</p>
    </div>
    <p class="subtle tab-meta">${formatTabMeta(tab)}</p>
    <div class="pill-row">
      ${tab.pinned ? `<span class="pill">${i18n.t("dashboard.tab.pinned")}</span>` : ""}
      ${tab.active ? `<span class="pill">${i18n.t("dashboard.tab.active")}</span>` : ""}
      ${tab.audible ? `<span class="pill">${i18n.t("dashboard.tab.audible")}</span>` : ""}
      ${tab.isStale ? `<span class="pill">${i18n.t("dashboard.tab.stale")}</span>` : ""}
      ${tab.isEmptyPage ? `<span class="pill">${i18n.t("dashboard.tab.emptyPage")}</span>` : ""}
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "tab-actions";

  const focusButton = document.createElement("button");
  focusButton.textContent = i18n.t("dashboard.tab.focus");
  focusButton.type = "button";
  focusButton.className = "action-button focus-button";
  focusButton.addEventListener("click", () => void focusTab(tab));

  const closeButton = document.createElement("button");
  closeButton.textContent = i18n.t("dashboard.tab.close");
  closeButton.type = "button";
  closeButton.className = "action-button close-button";
  closeButton.addEventListener("click", () => void closeTabs([tab.id], "close"));

  actions.append(focusButton, closeButton);
  article.append(checkbox, content, actions);
  return article;
}

function renderSessions(sessions: SavedSession[]) {
  sessionsPanel.replaceChildren();

  const query = searchInput.value.trim().toLowerCase();
  const filteredSessions = sessions.filter((session) => {
    if (!query) {
      return true;
    }

    const haystack = `${session.name} ${session.tabs.map((tab) => `${tab.title} ${tab.url}`).join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });

  for (const session of filteredSessions) {
    const card = document.createElement("article");
    card.className = "session-card";
    card.innerHTML = `
      <h3 class="group-title">${escapeHtml(session.name)}</h3>
      <p class="subtle">${i18n.t("dashboard.session.saved", { count: session.tabs.length, time: formatRelativeTime(session.updatedAt, i18n.locale) })}</p>
      <div class="session-actions">
        <button type="button" class="action-button focus-button" data-action="current">${i18n.t("dashboard.session.restoreHere")}</button>
        <button type="button" class="action-button ghost" data-action="new">${i18n.t("dashboard.session.restoreNew")}</button>
        <button type="button" class="action-button close-button" data-action="delete">${i18n.t("dashboard.session.delete")}</button>
      </div>
    `;

    card.querySelector<HTMLButtonElement>('[data-action="current"]')?.addEventListener("click", () => {
      void restoreSession(session.id, "current-window");
    });
    card.querySelector<HTMLButtonElement>('[data-action="new"]')?.addEventListener("click", () => {
      void restoreSession(session.id, "new-window");
    });
    card.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", () => {
      void deleteSession(session.id);
    });
    sessionsPanel.append(card);
  }
}

function filterTabs(tabs: TabSnapshot[]): TabSnapshot[] {
  const query = searchInput.value.trim().toLowerCase();
  const currentWindowId = tabs.find((tab) => tab.active)?.windowId ?? tabs[0]?.windowId;

  return tabs.filter((tab) => {
    const matchesQuery =
      !query || `${tab.title} ${tab.url} ${tab.domain}`.toLowerCase().includes(query);

    if (!matchesQuery) {
      return false;
    }

    switch (activeFilter) {
      case "current-window":
        return tab.windowId === currentWindowId;
      case "duplicates":
        return tabs.filter((candidate) => candidate.duplicateKey === tab.duplicateKey).length > 1;
      case "stale":
        return tab.isStale;
      case "all":
      default:
        return true;
    }
  });
}

function groupTabs(tabs: TabSnapshot[], mode: GroupMode, sort: SortMode): Map<string, TabSnapshot[]> {
  const groups = new Map<string, TabSnapshot[]>();

  for (const tab of tabs) {
    const key =
      mode === "none" ? i18n.t("dashboard.group.results") : mode === "window" ? i18n.t("dashboard.group.window", { id: tab.windowId }) : tab.rootDomain;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(tab);
    } else {
      groups.set(key, [tab]);
    }
  }

  const sortedEntries = Array.from(groups.entries())
    .map(([key, value]) => [key, sortTabs(value, sort)] as const)
    .sort((left, right) => {
      if (mode === "none") {
        return 0;
      }
      if (right[1].length !== left[1].length) {
        return right[1].length - left[1].length;
      }
      return left[0].localeCompare(right[0]);
    });

  return new Map(sortedEntries);
}

function sortTabs(tabs: TabSnapshot[], sort: SortMode): TabSnapshot[] {
  return [...tabs].sort((left, right) => {
    switch (sort) {
      case "title":
        return left.title.localeCompare(right.title);
      case "domain":
        return left.rootDomain.localeCompare(right.rootDomain) || left.title.localeCompare(right.title);
      case "recent":
      default:
        return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0);
    }
  });
}

function titleForFilter(filter: FilterMode): string {
  switch (filter) {
    case "current-window":
      return i18n.t("dashboard.title.currentWindow");
    case "duplicates":
      return i18n.t("dashboard.title.duplicates");
    case "stale":
      return i18n.t("dashboard.title.stale");
    case "sessions":
      return i18n.t("dashboard.title.sessions");
    case "all":
    default:
      return i18n.t("dashboard.title.all");
  }
}

async function handleGroupByChange() {
  const value = groupBySelect.value as "window" | "domain";
  const response = await sendMessage({ type: "UPDATE_PREFERENCES", payload: { groupByDefault: value } });
  if (response.ok && response.state) {
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function handleThresholdChange() {
  const staleThresholdDays = Number(staleThresholdSelect.value);
  const response = await sendMessage({ type: "UPDATE_PREFERENCES", payload: { staleThresholdDays } });
  if (response.ok && response.state) {
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function handleSoundChange() {
  const response = await sendMessage({
    type: "UPDATE_PREFERENCES",
    payload: { soundEnabled: soundEnabledCheckbox.checked }
  });
  if (response.ok && response.state) {
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    soundEnabledCheckbox.checked = state.preferences.soundEnabled;
    await playUiSound(state.preferences, "focus");
    render();
  }
}

async function handleLocaleChange() {
  const response = await sendMessage({
    type: "UPDATE_PREFERENCES",
    payload: { locale: localeSelect.value as "auto" | "en" | "zh-CN" }
  });
  if (response.ok && response.state) {
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function archiveSelected() {
  if (selectedTabIds.size === 0) {
    return;
  }

  const response = await sendMessage({
    type: "ARCHIVE_TABS",
    payload: { tabIds: Array.from(selectedTabIds) }
  });
  if (response.ok && response.state) {
    selectedTabIds.clear();
    await playUiSound(response.state.preferences, "archive");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function closeSelected() {
  await closeTabs(Array.from(selectedTabIds), "close");
}

async function closeTabs(tabIds: number[], sound: "focus" | "close" | "archive" | "restore" = "close") {
  if (tabIds.length === 0) {
    return;
  }

  const response = await sendMessage({ type: "CLOSE_TABS", payload: { tabIds } });
  if (response.ok && response.state) {
    for (const tabId of tabIds) {
      selectedTabIds.delete(tabId);
    }
    await playUiSound(response.state.preferences, sound);
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function focusTab(tab: TabSnapshot) {
  const response = await sendMessage({
    type: "ACTIVATE_TAB",
    payload: { tabId: tab.id, windowId: tab.windowId }
  });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "focus");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function restoreSession(sessionId: string, target: "new-window" | "current-window") {
  const response = await sendMessage({ type: "RESTORE_SESSION", payload: { sessionId, target } });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "restore");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function deleteSession(sessionId: string) {
  const response = await sendMessage({ type: "DELETE_SESSION", payload: { sessionId } });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "close");
    state = response.state;
    i18n = createI18n(state.preferences.locale);
    applyPreferences(state);
    applyStaticCopy();
    render();
  }
}

async function closeAllDuplicates() {
  if (!state) {
    return;
  }

  const duplicateIdsToClose = getDuplicateCloseIds(state.tabs);
  await closeTabs(duplicateIdsToClose, "close");
}

function getDuplicateCloseIds(tabs: TabSnapshot[]): number[] {
  const groups = new Map<string, TabSnapshot[]>();
  for (const tab of tabs) {
    const bucket = groups.get(tab.duplicateKey);
    if (bucket) {
      bucket.push(tab);
    } else {
      groups.set(tab.duplicateKey, [tab]);
    }
  }

  return Array.from(groups.values()).flatMap((group) =>
    group
      .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))
      .slice(1)
      .map((tab) => tab.id)
  );
}

function getWindowDuplicateCloseIds(tabs: TabSnapshot[], windowId: number): number[] {
  return getDuplicateCloseIds(tabs.filter((tab) => tab.windowId === windowId));
}

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}

function renderFavicon(tab: Pick<TabSnapshot, "favIconUrl" | "domain">): string {
  if (tab.favIconUrl) {
    return `<img class="tab-favicon" src="${escapeAttribute(tab.favIconUrl)}" alt="" />`;
  }

  return `<span class="tab-favicon" aria-hidden="true" title="${escapeAttribute(tab.domain)}"></span>`;
}

function formatTabMeta(tab: Pick<TabSnapshot, "url" | "lastAccessed" | "domain">): string {
  return `${summarizeDisplayUrl(tab.url, i18n.locale)} · ${formatRelativeTime(tab.lastAccessed, i18n.locale)}`;
}

function applyStaticCopy() {
  document.title = i18n.t("dashboard.title");
  document.documentElement.lang = i18n.locale;
  setText("dashboard-hero-eyebrow", i18n.t("dashboard.hero.eyebrow"));
  setText("dashboard-hero-title", i18n.t("dashboard.hero.title"));
  setText("dashboard-hero-meta", i18n.t("dashboard.hero.meta"));
  archiveSelectedButton.textContent = i18n.t("dashboard.button.archiveSelected");
  closeAllDuplicatesButton.textContent = i18n.t("dashboard.button.closeAllDuplicates");
  closeSelectedButton.textContent = i18n.t("dashboard.button.closeSelected");
  searchInput.setAttribute("aria-label", i18n.t("dashboard.search.aria"));
  searchInput.placeholder = i18n.t("dashboard.search.placeholder");
  setToolbarField("dashboard-group-field", i18n.t("dashboard.toolbar.groupBy"));
  setOptionText(groupBySelect, "none", i18n.t("dashboard.toolbar.group.none"));
  setOptionText(groupBySelect, "window", i18n.t("dashboard.toolbar.group.window"));
  setOptionText(groupBySelect, "domain", i18n.t("dashboard.toolbar.group.domain"));
  setToolbarField("dashboard-sort-field", i18n.t("dashboard.toolbar.sortBy"));
  setOptionText(sortBySelect, "recent", i18n.t("dashboard.toolbar.sort.recent"));
  setOptionText(sortBySelect, "title", i18n.t("dashboard.toolbar.sort.title"));
  setOptionText(sortBySelect, "domain", i18n.t("dashboard.toolbar.sort.domain"));
  setToolbarField("dashboard-stale-field", i18n.t("dashboard.toolbar.staleAfter"));
  setOptionText(staleThresholdSelect, "3", i18n.t("common.days", { count: 3 }));
  setOptionText(staleThresholdSelect, "7", i18n.t("common.days", { count: 7 }));
  setOptionText(staleThresholdSelect, "14", i18n.t("common.days", { count: 14 }));
  setToolbarField("dashboard-language-field", i18n.t("dashboard.toolbar.language"));
  setOptionText(localeSelect, "auto", i18n.t("locale.auto"));
  setOptionText(localeSelect, "zh-CN", i18n.t("locale.chineseSimplified"));
  setOptionText(localeSelect, "en", i18n.t("locale.english"));
  setCheckLabel("dashboard-sound-field", i18n.t("dashboard.toolbar.sound"));
  setText("dashboard-focus-title", i18n.t("dashboard.focus.title"));
  setFilterText("all", i18n.t("dashboard.filter.all"));
  setFilterText("current-window", i18n.t("dashboard.filter.currentWindow"));
  setFilterText("duplicates", i18n.t("dashboard.filter.duplicates"));
  setFilterText("stale", i18n.t("dashboard.filter.stale"));
  setFilterText("sessions", i18n.t("dashboard.filter.sessions"));
  setText("dashboard-snapshot-title", i18n.t("dashboard.snapshot.title"));
  setText("dashboard-contact-link", i18n.t("dashboard.footer.contact"));
  setText("dashboard-issues-link", i18n.t("dashboard.footer.issues"));
}

function setText(id: string, value: string) {
  must<HTMLElement>(id).textContent = value;
}

function setToolbarField(id: string, label: string) {
  must<HTMLElement>(id).querySelector(".field-label")!.textContent = label;
}

function setCheckLabel(id: string, label: string) {
  const field = must<HTMLElement>(id);
  field.querySelector("span")!.textContent = label;
}

function setFilterText(filter: FilterMode, value: string) {
  filterList.querySelector<HTMLButtonElement>(`[data-filter="${filter}"]`)!.textContent = value;
}

function setOptionText(select: HTMLSelectElement, value: string, label: string) {
  const option = select.querySelector<HTMLOptionElement>(`option[value="${CSS.escape(value)}"]`);
  if (option) {
    option.textContent = label;
  }
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
