import { formatRelativeTime } from "./lib/format.js";
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

let state: AppState | null = null;
let activeFilter: FilterMode = "all";
const selectedTabIds = new Set<number>();
let sortMode: SortMode = "recent";

void initialize();

async function initialize() {
  state = await getState();
  applyQueryState();
  applyPreferences(state);
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
    listTitle.textContent = "Archived Sessions";
    listSubtitle.textContent = `${state.sessions.length} saved sessions`;
    return;
  }

  sessionsPanel.replaceChildren();
  const filteredTabs = filterTabs(state.tabs);
  const groupedTabs = groupTabs(filteredTabs, groupBySelect.value as GroupMode, sortMode);

  listTitle.textContent = titleForFilter(activeFilter);
  listSubtitle.textContent = `${filteredTabs.length} visible tabs · ${selectedTabIds.size} selected`;

  tabGroups.replaceChildren();
  for (const [groupName, tabs] of groupedTabs) {
    const groupCard = document.createElement("section");
    groupCard.className = "group-card";
    const groupWindowId = groupName.startsWith("Window ") ? extractWindowId(groupName) : null;
    const groupDuplicateCloseIds =
      groupBySelect.value === "window" && groupWindowId !== null
        ? getWindowDuplicateCloseIds(state.tabs, groupWindowId)
        : [];
    groupCard.innerHTML = `
      <div class="group-header">
        <div>
          <h3 class="group-title">${escapeHtml(groupName)}</h3>
          <p class="group-meta">${tabs.length} tabs</p>
        </div>
        <div class="group-header-actions">
          ${
            groupDuplicateCloseIds.length > 0
              ? `<button type="button" class="action-button danger" data-action="close-window-duplicates">Close ${groupDuplicateCloseIds.length} duplicates</button>`
              : ""
          }
        </div>
      </div>
    `;

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
    ["Open tabs", appState.summary.totalTabs],
    ["Duplicate groups", appState.summary.duplicateClusterCount],
    ["Stale tabs", appState.summary.staleTabCount],
    ["Archived sessions", appState.summary.archivedSessionCount]
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
      ${tab.pinned ? '<span class="pill">Pinned</span>' : ""}
      ${tab.active ? '<span class="pill">Active</span>' : ""}
      ${tab.audible ? '<span class="pill">Audible</span>' : ""}
      ${tab.isStale ? '<span class="pill">Stale</span>' : ""}
      ${tab.isEmptyPage ? '<span class="pill">Empty page</span>' : ""}
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "tab-actions";

  const focusButton = document.createElement("button");
  focusButton.textContent = "Focus Tab";
  focusButton.type = "button";
  focusButton.className = "action-button focus-button";
  focusButton.addEventListener("click", () => void focusTab(tab));

  const closeButton = document.createElement("button");
  closeButton.textContent = "Close Tab";
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
      <p class="subtle">${session.tabs.length} tabs · Saved ${formatRelativeTime(session.updatedAt)}</p>
      <div class="session-actions">
        <button type="button" class="action-button focus-button" data-action="current">Restore Here</button>
        <button type="button" class="action-button ghost" data-action="new">Restore in New Window</button>
        <button type="button" class="action-button close-button" data-action="delete">Delete Session</button>
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
      mode === "none" ? "Results" : mode === "window" ? `Window ${tab.windowId}` : tab.rootDomain;
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
      return "Current Window";
    case "duplicates":
      return "Duplicate Tabs";
    case "stale":
      return "Stale Tabs";
    case "sessions":
      return "Archived Sessions";
    case "all":
    default:
      return "All Tabs";
  }
}

async function handleGroupByChange() {
  const value = groupBySelect.value as "window" | "domain";
  const response = await sendMessage({ type: "UPDATE_PREFERENCES", payload: { groupByDefault: value } });
  if (response.ok && response.state) {
    state = response.state;
    render();
  }
}

async function handleThresholdChange() {
  const staleThresholdDays = Number(staleThresholdSelect.value);
  const response = await sendMessage({ type: "UPDATE_PREFERENCES", payload: { staleThresholdDays } });
  if (response.ok && response.state) {
    state = response.state;
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
    soundEnabledCheckbox.checked = state.preferences.soundEnabled;
    await playUiSound(state.preferences, "focus");
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
    render();
  }
}

async function restoreSession(sessionId: string, target: "new-window" | "current-window") {
  const response = await sendMessage({ type: "RESTORE_SESSION", payload: { sessionId, target } });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "restore");
    state = response.state;
    render();
  }
}

async function deleteSession(sessionId: string) {
  const response = await sendMessage({ type: "DELETE_SESSION", payload: { sessionId } });
  if (response.ok && response.state) {
    await playUiSound(response.state.preferences, "close");
    state = response.state;
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

function extractWindowId(label: string): number | null {
  const match = label.match(/^Window (\d+)$/);
  return match ? Number(match[1]) : null;
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
  return `${summarizeDisplayUrl(tab.url)} · ${formatRelativeTime(tab.lastAccessed)}`;
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
