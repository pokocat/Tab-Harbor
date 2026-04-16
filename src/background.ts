import {
  archiveTabs,
  closeDuplicateCluster,
  closeTabs,
  deleteSession,
  getAppState,
  restoreSession,
  updatePreferences
} from "./lib/state.js";
import type {
  ArchiveTabsPayload,
  CloseDuplicateClusterPayload,
  RestoreSessionPayload,
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
  | { type: "UPDATE_PREFERENCES"; payload: UpdatePreferencesPayload };

type ResponseMessage =
  | { ok: true; state?: Awaited<ReturnType<typeof getAppState>> }
  | { ok: false; error: string };

chrome.runtime.onInstalled.addListener(() => {
  void updatePreferences({});
});

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

    case "UPDATE_PREFERENCES":
      await updatePreferences(message.payload);
      return { ok: true, state: await getAppState() };

    default:
      return { ok: false, error: "Unsupported message type." };
  }
}
