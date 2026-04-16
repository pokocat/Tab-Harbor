export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) {
    return "Unknown";
  }

  const minutes = Math.floor((Date.now() - timestamp) / (60 * 1000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
