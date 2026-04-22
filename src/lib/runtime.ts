import type { AppState } from "./types.js";
import type { LocalePreference, UpdateDuplicatePreventionPayload } from "./types.js";

type RequestMessage =
  | { type: "GET_APP_STATE" }
  | { type: "ARCHIVE_TABS"; payload: { tabIds: number[]; name?: string } }
  | { type: "RESTORE_SESSION"; payload: { sessionId: string; target: "new-window" | "current-window" } }
  | { type: "DELETE_SESSION"; payload: { sessionId: string } }
  | { type: "CLOSE_TABS"; payload: { tabIds: number[] } }
  | { type: "CLOSE_DUPLICATE_CLUSTER"; payload: { duplicateKey: string; keepTabId: number } }
  | { type: "ACTIVATE_TAB"; payload: { tabId: number; windowId: number } }
  | { type: "OPEN_DASHBOARD"; payload?: { view?: "sessions" | "duplicates" | "all"; query?: string } }
  | { type: "UPDATE_DUPLICATE_PREVENTION_CONFIG"; payload: UpdateDuplicatePreventionPayload }
  | { type: "RUN_DUPLICATE_PREVENTION_NOW" }
  | {
      type: "UPDATE_PREFERENCES";
      payload: {
        staleThresholdDays?: number;
        groupByDefault?: "window" | "domain";
        showDuplicateHints?: boolean;
        soundEnabled?: boolean;
        locale?: LocalePreference;
      };
    };

type ResponseMessage =
  | { ok: true; state?: AppState }
  | { ok: false; error: string };

export async function sendMessage(message: RequestMessage): Promise<ResponseMessage> {
  return chrome.runtime.sendMessage<RequestMessage, ResponseMessage>(message);
}

export async function getState(): Promise<AppState> {
  const response = await sendMessage({ type: "GET_APP_STATE" });
  if (!response.ok || !response.state) {
    throw new Error(response.ok ? "No state returned by the extension." : response.error);
  }
  return response.state;
}
