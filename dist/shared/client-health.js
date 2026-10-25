let sent = 0;
const pending = new Set();
export function reportClientFailure(kind) {
  if (sent >= 12 || pending.has(kind)) return;
  pending.add(kind);
  sent++;
  void fetch('/api/client-health', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, platform: 'web' }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
