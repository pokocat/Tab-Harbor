export type GroupByMode = "window" | "domain";

export interface StoredTabReference {
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
}

export interface SavedSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceWindowId?: number;
  tabs: StoredTabReference[];
}

export interface UserPreference {
  staleThresholdDays: number;
  groupByDefault: GroupByMode;
  showDuplicateHints: boolean;
  soundEnabled: boolean;
}

export interface TabSnapshot {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  lastAccessed?: number;
  duplicateKey: string;
  domain: string;
  rootDomain: string;
  isEmptyPage: boolean;
  isStale: boolean;
}

export interface DuplicateCluster {
  key: string;
  label: string;
  tabIds: number[];
  tabs: TabSnapshot[];
}

export interface TabSummary {
  totalTabs: number;
  windowCount: number;
  duplicateTabCount: number;
  duplicateClusterCount: number;
  staleTabCount: number;
  archivedSessionCount: number;
}

export interface AppState {
  tabs: TabSnapshot[];
  duplicateClusters: DuplicateCluster[];
  sessions: SavedSession[];
  preferences: UserPreference;
  summary: TabSummary;
}

export interface ArchiveTabsPayload {
  tabIds: number[];
  name?: string;
}

export interface RestoreSessionPayload {
  sessionId: string;
  target: "new-window" | "current-window";
}

export interface CloseDuplicateClusterPayload {
  duplicateKey: string;
  keepTabId: number;
}

export interface UpdatePreferencesPayload {
  staleThresholdDays?: number;
  groupByDefault?: GroupByMode;
  showDuplicateHints?: boolean;
  soundEnabled?: boolean;
}
