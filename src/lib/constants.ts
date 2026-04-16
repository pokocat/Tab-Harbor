import type { UserPreference } from "./types.js";

export const STORAGE_KEYS = {
  sessions: "savedSessions",
  preferences: "userPreferences"
} as const;

export const DEFAULT_PREFERENCES: UserPreference = {
  staleThresholdDays: 7,
  groupByDefault: "window",
  showDuplicateHints: true,
  soundEnabled: true
};

export const TRACKING_QUERY_PREFIXES = ["utm_", "fbclid", "gclid", "mc_cid", "mc_eid"];
