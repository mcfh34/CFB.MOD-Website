export function activePlayersNeedRefresh(status: { ready: boolean; updatedAt: string | null }, latestBoxScore: string | null, now = Date.now()) {
  if (!status.ready) return false; // Resume the current import; never restart a partial batch.
  const utc = (value: string | null) => value ? Date.parse(value.includes("T") ? value : value.replace(" ","T") + "Z") : 0;
  const refreshed = utc(status.updatedAt);
  return !Number.isFinite(refreshed) || !refreshed || now - refreshed > 24 * 60 * 60 * 1000 || utc(latestBoxScore) > refreshed;
}
