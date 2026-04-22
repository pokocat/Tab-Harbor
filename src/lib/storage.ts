import { DEFAULT_DUPLICATE_PREVENTION_CONFIG, DEFAULT_PREFERENCES, STORAGE_KEYS } from "./constants.js";
import type { DuplicatePreventionConfig, SavedSession, UserPreference } from "./types.js";

function getStorageArea(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

export async function loadSessions(): Promise<SavedSession[]> {
  const result = await getStorageArea().get(STORAGE_KEYS.sessions);
  return (result[STORAGE_KEYS.sessions] as SavedSession[] | undefined) ?? [];
}

export async function saveSessions(sessions: SavedSession[]): Promise<void> {
  await getStorageArea().set({ [STORAGE_KEYS.sessions]: sessions });
}

export async function loadPreferences(): Promise<UserPreference> {
  const result = await getStorageArea().get(STORAGE_KEYS.preferences);
  return {
    ...DEFAULT_PREFERENCES,
    ...((result[STORAGE_KEYS.preferences] as UserPreference | undefined) ?? {})
  };
}

export async function savePreferences(preferences: UserPreference): Promise<void> {
  await getStorageArea().set({ [STORAGE_KEYS.preferences]: preferences });
}

export async function loadDuplicatePreventionConfig(): Promise<DuplicatePreventionConfig> {
  const result = await getStorageArea().get(STORAGE_KEYS.duplicatePreventionConfig);
  return {
    ...DEFAULT_DUPLICATE_PREVENTION_CONFIG,
    ...((result[STORAGE_KEYS.duplicatePreventionConfig] as DuplicatePreventionConfig | undefined) ?? {})
  };
}

export async function saveDuplicatePreventionConfig(config: DuplicatePreventionConfig): Promise<void> {
  await getStorageArea().set({ [STORAGE_KEYS.duplicatePreventionConfig]: config });
}
