export function formatRelativeTime(timestamp?: number, locale = chrome.i18n.getUILanguage()): string {
  if (!timestamp) {
    return locale.toLowerCase().startsWith("zh") ? "未知" : "Unknown";
  }

  const minutes = Math.floor((Date.now() - timestamp) / (60 * 1000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (minutes < 1) {
    return formatter.format(0, "minute");
  }

  if (minutes < 60) {
    return formatter.format(-minutes, "minute");
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return formatter.format(-hours, "hour");
  }

  const days = Math.floor(hours / 24);
  return formatter.format(-days, "day");
}
