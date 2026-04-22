import type { DuplicatePreventionConfig, UserPreference } from "./types.js";

export const STORAGE_KEYS = {
  sessions: "savedSessions",
  preferences: "userPreferences",
  duplicatePreventionConfig: "duplicatePreventionConfig"
} as const;

export const DEFAULT_PREFERENCES: UserPreference = {
  staleThresholdDays: 7,
  groupByDefault: "window",
  showDuplicateHints: true,
  soundEnabled: true,
  locale: "auto"
};

export const DEFAULT_DUPLICATE_PREVENTION_CONFIG: DuplicatePreventionConfig = {
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

export const TRACKING_QUERY_PREFIXES = ["utm_", "fbclid", "gclid", "mc_cid", "mc_eid"];
