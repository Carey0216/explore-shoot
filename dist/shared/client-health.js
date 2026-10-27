let sent = 0;
const pending = new Set();
export function reportClientFailure(kind, resource = '', status = 0) {
  const context = diagnosticContext(location.hash, resource, status),
    key = kind + ':' + context.page + ':' + context.resource;
  if (sent >= 30 || pending.has(key)) return;
  pending.add(key);
  sent++;
  void fetch('/api/client-health', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, platform: 'web', ...context }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
import { diagnosticContext } from './diagnostic-context.js';
