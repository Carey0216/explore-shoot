export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const date = (s) =>
  s
    ? new Date(s).toLocaleString(
        typeof document === 'undefined' ? 'zh-CN' : document.documentElement?.lang || 'zh-CN',
        { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      )
    : '—';
export function parseResponse(raw, status) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw Error(
      status >= 500 ? '服务连接暂时中断，请稍后重试。' : '服务返回内容异常，请刷新页面后重试。',
    );
  }
  if (status < 200 || status >= 300) {
    const e = new Error(body?.error || '请求失败，请重试');
    e.status = status;
    throw e;
  }
  return body;
}
const publicOffline = () => import('/shared/public-offline.js').catch(() => null);
export async function api(url, method = 'GET', data) {
  const rewardOwner = typeof window !== 'undefined' ? window.campusAccountScope813 : undefined;
  const mediaUpload = url === '/api/media' && method === 'POST' && data?.photo;
  const measured = mediaUpload ? globalThis.jingyuExperience820?.start('upload') : null;
  if (mediaUpload && !data.submissionId) {
    if (!uploadAttempts.has(data.photo)) {
      if (uploadAttempts.size >= 8) uploadAttempts.delete(uploadAttempts.keys().next().value);
      uploadAttempts.set(data.photo, crypto.randomUUID());
    }
    data = { ...data, submissionId: uploadAttempts.get(data.photo) };
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
      ...(globalThis.AbortSignal?.timeout
        ? {
            signal: AbortSignal.timeout(
              mediaUpload || /\/(assistant\/query|localization\/translate)/.test(url)
                ? 90000
                : 20000,
            ),
          }
        : {}),
    });
  } catch {
    measured?.(false);
    if (method === 'GET') {
      const cached = (await publicOffline())?.cachedPublic(url);
      if (cached) return cached;
    }
    if (!url.includes('client-health'))
      void import('./client-health.js')
        .then((m) => m.reportClientFailure('network-failed', url))
        .catch(() => {});
    throw Error('网络连接中断，请检查网络后重试。');
  }
  let raw;
  try {
    raw = await res.text();
  } catch {
    measured?.(false);
    if (method === 'GET') {
      const cached = (await publicOffline())?.cachedPublic(url);
      if (cached) return cached;
    }
    if (!url.includes('client-health'))
      void import('./client-health.js')
        .then((m) => m.reportClientFailure('network-failed', url))
        .catch(() => {});
    throw Error('网络连接中断，请检查网络后重试。');
  }
  if (method === 'GET' && [404, 410].includes(res.status))
    (await publicOffline())?.forgetPublic(url);
  let result;
  try {
    result = parseResponse(raw, res.status);
  } catch (error) {
    measured?.(false);
    if (res.status >= 500 && !url.includes('client-health'))
      void import('./client-health.js')
        .then((m) => m.reportClientFailure('api-failed', url, res.status))
        .catch(() => {});
    throw error;
  }
  measured?.(true);
  if (method === 'GET') (await publicOffline())?.cachePublic(url, result);
  if (
    method !== 'GET' &&
    result?.passportEvents &&
    typeof window !== 'undefined' &&
    rewardOwner === window.campusAccountScope813
  )
    window.dispatchEvent(
      new CustomEvent('campus:passport-events', {
        detail: { events: result.passportEvents, owner: window.campusAccountScope813 },
      }),
    );
  return result;
}
// Generated original geometry; run tools/generate-line-icons.cjs to update both clients.
// Generated original geometry; run tools/generate-line-icons.cjs to update both clients.
// Generated original geometry; run tools/generate-line-icons.cjs to update both clients.
export const icons = {
  campus:
    '<polyline points="5,27 5,12 16,5 27,12 27,27"/><line x1="3" y1="27" x2="29" y2="27"/><rect x="13" y="18" width="6" height="9" rx="3"/><line x1="10" y1="14" x2="10" y2="17"/><line x1="22" y1="14" x2="22" y2="17"/>',
  viewpoint:
    '<polyline points="4,11 4,5 10,5"/><polyline points="22,5 28,5 28,11"/><polyline points="28,22 28,27 22,27"/><polyline points="10,27 4,27 4,22"/><circle cx="16" cy="16" r="6"/><line x1="16" y1="13" x2="16" y2="16"/><line x1="16" y1="16" x2="19" y2="16"/>',
  moderation:
    '<rect x="4" y="5" width="20" height="21" rx="3"/><circle cx="10" cy="11" r="2"/><polyline points="7,22 13,16 17,20"/><polyline points="18,12 22,16 29,8"/>',
  'campus-map':
    '<polyline points="4,7 12,4 21,7 28,4 28,25 21,28 12,25 4,28 4,7"/><line x1="12" y1="4" x2="12" y2="25"/><line x1="21" y1="7" x2="21" y2="28"/>',
  season:
    '<polyline points="6,20 10,11 16,6 22,11 26,20"/><line x1="5" y1="25" x2="27" y2="25"/><polyline points="12,17 16,13 20,17"/><line x1="16" y1="13" x2="16" y2="25"/><circle cx="25" cy="6" r="2"/>',
  passport:
    '<rect x="6" y="3" width="20" height="26" rx="3"/><line x1="10" y1="3" x2="10" y2="29"/><circle cx="18" cy="14" r="5"/><line x1="13" y1="14" x2="23" y2="14"/><path d="M18 9A3 5 0 0 1 18 19"/><line x1="15" y1="24" x2="21" y2="24"/>',
  knowledge:
    '<polyline points="3,6 8,5 16,8 24,5 29,6 29,26 24,25 16,28 8,25 3,26 3,6"/><line x1="16" y1="8" x2="16" y2="28"/><line x1="7" y1="11" x2="12" y2="12"/><line x1="20" y1="12" x2="25" y2="11"/>',
  'route-plan':
    '<circle cx="7" cy="7" r="3"/><circle cx="25" cy="25" r="3"/><polyline points="10,7 23,7 26,11 23,16 9,16 6,20 9,25 22,25"/>',
  'photo-guide':
    '<rect x="6" y="3" width="20" height="26" rx="3"/><line x1="11" y1="3" x2="11" y2="29"/><rect x="15" y="8" width="7" height="7" rx="1"/><polyline points="15,15 18,11 22,15"/><line x1="15" y1="21" x2="22" y2="21"/><line x1="15" y1="25" x2="20" y2="25"/>',
  'site-settings':
    '<line x1="5" y1="8" x2="27" y2="8"/><line x1="5" y1="16" x2="27" y2="16"/><line x1="5" y1="24" x2="27" y2="24"/><circle cx="11" cy="8" r="3"/><circle cx="22" cy="16" r="3"/><circle cx="14" cy="24" r="3"/>',
  announcement:
    '<polyline points="5,12 11,12 25,6 25,24 11,19 5,19 5,12"/><polyline points="9,20 11,27 16,27 14,21"/><line x1="29" y1="12" x2="29" y2="18"/>',
  report:
    '<line x1="7" y1="28" x2="7" y2="4"/><polyline points="7,5 17,5 21,9 28,9 24,20 16,20 12,16 7,16"/><line x1="17" y1="9" x2="17" y2="13"/><line x1="17" y1="16" x2="17.1" y2="16"/>',
  feedback:
    '<rect x="3" y="5" width="26" height="19" rx="5"/><polyline points="8,24 8,29 14,24"/><line x1="9" y1="12" x2="23" y2="12"/><line x1="9" y1="17" x2="18" y2="17"/>',
  community:
    '<rect x="4" y="6" width="24" height="18" rx="6"/><path d="M9 24C8 28 10 29 16 24"/><circle cx="16" cy="15" r="4"/>',
  activities:
    '<rect x="5" y="7" width="22" height="22" rx="5"/><line x1="11" y1="3" x2="11" y2="10"/><line x1="21" y1="3" x2="21" y2="10"/><line x1="5" y1="14" x2="27" y2="14"/><circle cx="12" cy="20" r="0.65"/><circle cx="20" cy="20" r="0.65"/><circle cx="12" cy="25" r="0.65"/><circle cx="20" cy="25" r="0.65"/>',
  memories:
    '<rect x="7" y="4" width="21" height="24" rx="3"/><polyline points="3,9 3,29 23,29"/><circle cx="13" cy="11" r="2"/><polyline points="10,23 16,16 19,20 23,15 27,21"/>',
  search: '<circle cx="13" cy="13" r="8"/><line x1="19" y1="19" x2="27" y2="27"/>',
  bell: '<path d="M7 15.5A9 10.5 0 0 1 25 15.5"/><line x1="7" y1="15" x2="7" y2="21"/><line x1="25" y1="15" x2="25" y2="21"/><polyline points="7,21 4,24 28,24 25,21"/><path d="M19 26.5A3 2.5 0 0 1 13 26.5"/><line x1="16" y1="3" x2="16" y2="5"/>',
  user: '<circle cx="16" cy="10" r="4.5"/><path d="M5 28C5 16 27 16 27 28"/>',
  back: '<polyline points="20,6 10,16 20,26"/>',
  close: '<line x1="8" y1="8" x2="24" y2="24"/><line x1="8" y1="24" x2="24" y2="8"/>',
  plus: '<line x1="16" y1="5" x2="16" y2="27"/><line x1="5" y1="16" x2="27" y2="16"/>',
  send: '<polyline points="4,4 29,16 4,28 8,16 4,4"/><line x1="8" y1="16" x2="29" y2="16"/>',
  trash:
    '<rect x="8" y="8" width="16" height="21" rx="2"/><line x1="4" y1="8" x2="28" y2="8"/><polyline points="12,8 12,3 20,3 20,8"/><line x1="13" y1="13" x2="13" y2="24"/><line x1="19" y1="13" x2="19" y2="24"/>',
  heart:
    '<path d="M16 27C10 23 3 17 3 11"/><path d="M3 11C3 3 12 2 16 9"/><path d="M16 9C20 2 29 3 29 11"/><path d="M29 11C29 17 22 23 16 27"/>',
  settings:
    '<circle cx="16" cy="16" r="5"/><polyline points="13,3 19,3 20,7 24,9 28,8 31,14 28,17 27,21 29,25 23,29 20,26 16,27 13,30 7,27 8,23 5,19 1,18 2,11 6,10 9,7 9,4 13,3"/>',
  language:
    '<circle cx="16" cy="16" r="12"/><line x1="4" y1="16" x2="28" y2="16"/><ellipse cx="16" cy="16" rx="5" ry="12"/><line x1="6" y1="10" x2="26" y2="10"/><line x1="6" y1="22" x2="26" y2="22"/>',
  check: '<polyline points="6,16 13,23 27,8"/>',
  clock: '<circle cx="16" cy="16" r="12"/><polyline points="16,8 16,16 22,20"/>',
  share:
    '<circle cx="25" cy="6" r="3"/><circle cx="7" cy="16" r="3"/><circle cx="25" cy="26" r="3"/><line x1="10" y1="14" x2="22" y2="7.5"/><line x1="10" y1="18" x2="22" y2="24.5"/>',
  menu: '<line x1="5" y1="8" x2="27" y2="8"/><line x1="5" y1="16" x2="27" y2="16"/><line x1="5" y1="24" x2="27" y2="24"/>',
  walk: '<circle cx="18" cy="5" r="2.7"/><path d="M8 16C10 12 12 10 15 11"/><path d="M15 11C19 12 20 17 26 17"/><path d="M15 11C14 16 13 20 11 22"/><path d="M11 22C9 25 7 27 5 29"/><path d="M13 20C16 22 19 25 21 29"/>',
  arrow: '<polyline points="19,7 28,16 19,25"/><line x1="4" y1="16" x2="28" y2="16"/>',
  'thumb-up':
    '<rect x="3" y="14" width="5" height="15" rx="1"/><polyline points="8,15 15,4 18,4 19,7 17,14 26,14 29,17 26,27 23,29 8,29"/>',
  'thumb-down':
    '<rect x="3" y="3" width="5" height="15" rx="1"/><polyline points="8,17 15,28 18,28 19,25 17,18 26,18 29,15 26,5 23,3 8,3"/>',
  logout:
    '<polyline points="13,4 5,4 5,28 13,28"/><line x1="12" y1="16" x2="29" y2="16"/><polyline points="23,10 29,16 23,22"/>',
  people:
    '<circle cx="12" cy="10" r="4"/><path d="M3 27A9 8 0 0 1 21 27"/><path d="M24.5 6A3.5 4 0 0 1 24.5 14"/><path d="M26 19A4 7.5 0 0 1 26 34"/>',
  shield:
    '<polyline points="16,3 28,8 27,19 23,25 16,29 9,25 5,19 4,8 16,3"/><polyline points="10,15 15,20 23,11"/>',
  ticket:
    '<polyline points="3,6 29,6 29,12 26,14 26,18 29,20 29,26 3,26 3,20 6,18 6,14 3,12 3,6"/><line x1="21" y1="7" x2="21" y2="11"/><line x1="21" y1="15" x2="21" y2="17"/><line x1="21" y1="21" x2="21" y2="25"/>',
  copy: '<rect x="10" y="9" width="18" height="20" rx="2"/><polyline points="6,23 3,23 3,3 22,3 22,5"/>',
  compass: '<circle cx="16" cy="16" r="12"/><polyline points="22,10 18,18 10,22 14,14 22,10"/>',
  camera:
    '<rect x="3" y="9" width="26" height="19" rx="3"/><polyline points="8,9 11,4 21,4 24,9"/><circle cx="16" cy="18" r="6"/><line x1="24" y1="13" x2="25" y2="13"/>',
  photo:
    '<rect x="3" y="4" width="26" height="24" rx="3"/><circle cx="10" cy="11" r="3"/><polyline points="4,23 12,16 18,22 23,15 28,20"/>',
  pin: '<path d="M7 12A9 9 0 0 1 25 12"/><path d="M7 12C7 20 16 29 16 29"/><path d="M16 29C16 29 25 20 25 12"/><circle cx="16" cy="12" r="3"/>',
  navigation: '<polyline points="16,3 28,28 16,22 4,28 16,3"/>',
  book: '<rect x="6" y="3" width="21" height="26" rx="2"/><line x1="11" y1="3" x2="11" y2="29"/><line x1="15" y1="9" x2="23" y2="9"/><line x1="15" y1="14" x2="23" y2="14"/><line x1="15" y1="19" x2="21" y2="19"/>',
  sun: '<circle cx="16" cy="16" r="5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="16" y1="26" x2="16" y2="30"/><line x1="2" y1="16" x2="6" y2="16"/><line x1="26" y1="16" x2="30" y2="16"/><line x1="6" y1="6" x2="9" y2="9"/><line x1="23" y1="23" x2="26" y2="26"/><line x1="6" y1="26" x2="9" y2="23"/><line x1="23" y1="9" x2="26" y2="6"/>',
  leaf: '<path d="M6 25C1 11 12 3 28 4"/><path d="M28 4C28 20 20 30 6 25"/><line x1="5" y1="29" x2="22" y2="11"/><line x1="12" y1="21" x2="12" y2="13"/><line x1="17" y1="16" x2="23" y2="16"/>',
  list: '<line x1="11" y1="7" x2="28" y2="7"/><line x1="11" y1="16" x2="28" y2="16"/><line x1="11" y1="25" x2="28" y2="25"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="16" r="1"/><circle cx="5" cy="25" r="1"/>',
  message:
    '<rect x="3" y="4" width="26" height="21" rx="5"/><polyline points="8,25 8,29 14,25"/><circle cx="10" cy="14" r="0.7"/><circle cx="16" cy="14" r="0.7"/><circle cx="22" cy="14" r="0.7"/>',
  assistant:
    '<rect x="4" y="9" width="24" height="19" rx="6"/><line x1="16" y1="4" x2="16" y2="9"/><circle cx="16" cy="3" r="1"/><circle cx="11" cy="17" r="1.3"/><circle cx="21" cy="17" r="1.3"/><path d="M21 20.5A5 3.5 0 0 1 11 20.5"/><line x1="1" y1="16" x2="1" y2="22"/><line x1="31" y1="16" x2="31" y2="22"/>',
  checklist:
    '<rect x="6" y="5" width="23" height="25" rx="3"/><rect x="11" y="2" width="12" height="6" rx="2"/><polyline points="10,14 12,16 16,12"/><line x1="20" y1="14" x2="25" y2="14"/><polyline points="10,23 12,25 16,21"/><line x1="20" y1="23" x2="25" y2="23"/>',
  notes:
    '<polyline points="5,4 27,4 27,28 5,28 5,4"/><line x1="9" y1="10" x2="23" y2="10"/><line x1="9" y1="16" x2="23" y2="16"/><line x1="9" y1="22" x2="17" y2="22"/><line x1="3" y1="8" x2="7" y2="8"/><line x1="3" y1="15" x2="7" y2="15"/><line x1="3" y1="22" x2="7" y2="22"/>',
  works:
    '<rect x="3" y="6" width="26" height="23" rx="3"/><polyline points="7,22 14,15 20,21 25,16 29,20"/><circle cx="10" cy="12" r="2"/><polyline points="19,3 23,7 29,2"/>',
  release:
    '<polyline points="7,3 22,3 28,9 28,29 7,29 7,3"/><polyline points="22,3 22,9 28,9"/><polyline points="12,18 16,22 24,14"/><line x1="3" y1="8" x2="3" y2="25"/>',
  draft:
    '<rect x="4" y="4" width="24" height="25" rx="3"/><rect x="9" y="4" width="13" height="8" rx="1"/><polyline points="9,29 9,19 23,19 23,29"/><line x1="19" y1="6" x2="19" y2="10"/>',
  filter: '<polyline points="3,5 29,5 20,16 20,26 12,29 12,16 3,5"/>',
  help: '<circle cx="16" cy="16" r="12"/><path d="M11 12C11 5 23 6 22 13"/><path d="M22 13C22 17 16 17 16 21"/><line x1="16" y1="25" x2="16.1" y2="25"/>',
  refresh:
    '<path d="M24.426 23.071A11 11 0 1 1 24.426 8.929"/><polyline points="26,4 27,12 19,11"/>',
  download:
    '<polyline points="5,22 5,29 27,29 27,22"/><line x1="16" y1="3" x2="16" y2="23"/><polyline points="9,16 16,23 23,16"/>',
  upload:
    '<polyline points="5,22 5,29 27,29 27,22"/><line x1="16" y1="3" x2="16" y2="23"/><polyline points="9,10 16,3 23,10"/>',
  edit: '<polyline points="5,22 5,28 11,28 28,11 22,5 5,22"/><line x1="19" y1="8" x2="25" y2="14"/>',
  link: '<path d="M16.5 18.062A9 7 0 1 1 19.794 8.5"/><path d="M15.5 13.938A9 7 0 1 1 12.206 23.5"/><line x1="11" y1="21" x2="21" y2="11"/>',
  building:
    '<rect x="7" y="3" width="18" height="26" rx="1"/><line x1="3" y1="29" x2="29" y2="29"/><rect x="13" y="22" width="6" height="7" rx="1"/><line x1="12" y1="9" x2="14" y2="9"/><line x1="19" y1="9" x2="21" y2="9"/><line x1="12" y1="15" x2="14" y2="15"/><line x1="19" y1="15" x2="21" y2="15"/>',
  panorama:
    '<rect x="2" y="7" width="28" height="20" rx="5"/><line x1="2" y1="17" x2="30" y2="17"/><path d="M6 17A10 10 0 0 1 26 17"/><line x1="16" y1="3" x2="16" y2="7"/><circle cx="24" cy="12" r="1"/>',
  cube: '<polyline points="16,3 29,10 29,24 16,31 3,24 3,10 16,3"/><polyline points="3,10 16,17 29,10"/><line x1="16" y1="17" x2="16" y2="31"/>',
  weather:
    '<circle cx="11" cy="11" r="5"/><path d="M10.5 26A5.5 6 0 0 1 10.5 14"/><path d="M11.122 16.611A8 8 0 1 1 25.928 22"/><polyline points="25,18 28,18 30,21 29,25 11,25"/><line x1="11" y1="2" x2="11" y2="4"/><line x1="2" y1="10" x2="4" y2="10"/><line x1="4" y1="3" x2="6" y2="5"/>',
  backup:
    '<polyline points="4,10 16,4 28,10 28,25 16,31 4,25 4,10"/><polyline points="4,10 16,16 28,10"/><line x1="16" y1="16" x2="16" y2="31"/><polyline points="10,7 22,13"/><polyline points="21,22 24,25 29,20"/>',
  diagnostics:
    '<rect x="3" y="4" width="26" height="24" rx="3"/><polyline points="7,18 11,18 14,10 18,23 22,14 25,14"/>',
  admins:
    '<circle cx="12" cy="9" r="4"/><path d="M3 26A9 8 0 0 1 21 26"/><polyline points="24,15 30,18 29,25 24,29 19,25 18,18 24,15"/>',
  key: '<circle cx="9" cy="10" r="6"/><polyline points="13,15 27,29 30,26 26,22 28,20 25,17 23,19 17,13"/>',
  lock: '<rect x="5" y="14" width="22" height="16" rx="3"/><path d="M10 11A6 8 0 0 1 22 11"/><line x1="10" y1="11" x2="10" y2="14"/><line x1="22" y1="11" x2="22" y2="14"/><line x1="16" y1="20" x2="16" y2="24"/>',
  eye: '<path d="M2 16C9 3 23 3 30 16"/><path d="M30 16C23 29 9 29 2 16"/><circle cx="16" cy="16" r="5"/>',
  quiz: '<rect x="5" y="4" width="22" height="25" rx="3"/><line x1="11" y1="10" x2="22" y2="10"/><polyline points="9,17 12,20 16,15"/><line x1="20" y1="19" x2="23" y2="19"/><line x1="10" y1="25" x2="23" y2="25"/>',
  applications:
    '<rect x="4" y="4" width="19" height="25" rx="3"/><circle cx="13" cy="12" r="3"/><path d="M8 22A5 4 0 0 1 18 22"/><polyline points="22,21 25,24 31,17"/>',
  celebrations:
    '<polyline points="4,28 10,10 22,22 4,28"/><line x1="11" y1="4" x2="12" y2="7"/><line x1="20" y1="3" x2="19" y2="8"/><line x1="28" y1="10" x2="24" y2="12"/><line x1="26" y1="22" x2="30" y2="23"/><path d="M27 12A5 5 0 0 1 17 12"/>',
  preflight:
    '<rect x="4" y="5" width="19" height="24" rx="3"/><polyline points="9,16 13,20 21,11"/><polyline points="24,22 27,25 31,19"/>',
  'check-circle': '<circle cx="16" cy="16" r="12"/><polyline points="9,16 14,21 24,10"/>',
  'site-copy':
    '<rect x="4" y="5" width="24" height="23" rx="3"/><line x1="4" y1="11" x2="28" y2="11"/><line x1="9" y1="16" x2="23" y2="16"/><line x1="9" y1="21" x2="20" y2="21"/><line x1="9" y1="25" x2="15" y2="25"/>',
  file: '<polyline points="7,3 21,3 27,9 27,29 7,29 7,3"/><polyline points="21,3 21,9 27,9"/><line x1="12" y1="15" x2="22" y2="15"/><line x1="12" y1="20" x2="22" y2="20"/><line x1="12" y1="25" x2="18" y2="25"/>',
};
const brandIcons812 = {
  discover: 'community',
  map: 'campus-map',
  calendar: 'activities',
  route: 'route-plan',
  person: 'user',
  globe: 'language',
  photo: 'photo',
  camera: 'camera',
  pin: 'pin',
  book: 'book',
  sun: 'sun',
  list: 'list',
  navigation: 'navigation',
  campus: 'campus',
  'jy-campus': 'campus',
  viewpoint: 'viewpoint',
  'jy-viewpoint': 'viewpoint',
  moderation: 'moderation',
  'jy-moderation': 'moderation',
  'campus-map': 'campus-map',
  'jy-campus-map': 'campus-map',
  season: 'season',
  'jy-season': 'season',
  passport: 'passport',
  'jy-passport': 'passport',
  knowledge: 'knowledge',
  'jy-knowledge': 'knowledge',
  'route-plan': 'route-plan',
  'jy-route-plan': 'route-plan',
  'photo-guide': 'photo-guide',
  'jy-photo-guide': 'photo-guide',
  'site-settings': 'site-settings',
  'jy-site-settings': 'site-settings',
  announcement: 'announcement',
  'jy-announcement': 'announcement',
  report: 'report',
  'jy-report': 'report',
  feedback: 'feedback',
  'jy-feedback': 'feedback',
  community: 'community',
  'jy-community': 'community',
  activities: 'activities',
  'jy-activities': 'activities',
  memories: 'memories',
  'jy-memories': 'memories',
  search: 'search',
  'jy-search': 'search',
  bell: 'bell',
  'jy-bell': 'bell',
  user: 'user',
  'jy-user': 'user',
  back: 'back',
  'jy-back': 'back',
  close: 'close',
  'jy-close': 'close',
  plus: 'plus',
  'jy-plus': 'plus',
  send: 'send',
  'jy-send': 'send',
  trash: 'trash',
  'jy-trash': 'trash',
  heart: 'heart',
  'jy-heart': 'heart',
  settings: 'settings',
  'jy-settings': 'settings',
  language: 'language',
  'jy-language': 'language',
  check: 'check',
  'jy-check': 'check',
  clock: 'clock',
  'jy-clock': 'clock',
  share: 'share',
  'jy-share': 'share',
  menu: 'menu',
  'jy-menu': 'menu',
  walk: 'walk',
  'jy-walk': 'walk',
  arrow: 'arrow',
  'jy-arrow': 'arrow',
  'thumb-up': 'thumb-up',
  'jy-thumb-up': 'thumb-up',
  'thumb-down': 'thumb-down',
  'jy-thumb-down': 'thumb-down',
  logout: 'logout',
  'jy-logout': 'logout',
  people: 'people',
  'jy-people': 'people',
  shield: 'shield',
  'jy-shield': 'shield',
  ticket: 'ticket',
  'jy-ticket': 'ticket',
  copy: 'copy',
  'jy-copy': 'copy',
  compass: 'compass',
  'jy-compass': 'compass',
  'jy-camera': 'camera',
  'jy-photo': 'photo',
  'jy-pin': 'pin',
  'jy-navigation': 'navigation',
  'jy-book': 'book',
  'jy-sun': 'sun',
  leaf: 'leaf',
  'jy-leaf': 'leaf',
  'jy-list': 'list',
  message: 'message',
  'jy-message': 'message',
  assistant: 'assistant',
  'jy-assistant': 'assistant',
  checklist: 'checklist',
  'jy-checklist': 'checklist',
  notes: 'notes',
  'jy-notes': 'notes',
  works: 'works',
  'jy-works': 'works',
  release: 'release',
  'jy-release': 'release',
  draft: 'draft',
  'jy-draft': 'draft',
  filter: 'filter',
  'jy-filter': 'filter',
  help: 'help',
  'jy-help': 'help',
  refresh: 'refresh',
  'jy-refresh': 'refresh',
  download: 'download',
  'jy-download': 'download',
  upload: 'upload',
  'jy-upload': 'upload',
  edit: 'edit',
  'jy-edit': 'edit',
  link: 'link',
  'jy-link': 'link',
  building: 'building',
  'jy-building': 'building',
  panorama: 'panorama',
  'jy-panorama': 'panorama',
  cube: 'cube',
  'jy-cube': 'cube',
  weather: 'weather',
  'jy-weather': 'weather',
  backup: 'backup',
  'jy-backup': 'backup',
  diagnostics: 'diagnostics',
  'jy-diagnostics': 'diagnostics',
  admins: 'admins',
  'jy-admins': 'admins',
  key: 'key',
  'jy-key': 'key',
  lock: 'lock',
  'jy-lock': 'lock',
  eye: 'eye',
  'jy-eye': 'eye',
  quiz: 'quiz',
  'jy-quiz': 'quiz',
  applications: 'applications',
  'jy-applications': 'applications',
  celebrations: 'celebrations',
  'jy-celebrations': 'celebrations',
  preflight: 'preflight',
  'jy-preflight': 'preflight',
  'check-circle': 'check-circle',
  'jy-check-circle': 'check-circle',
  'site-copy': 'site-copy',
  'jy-site-copy': 'site-copy',
  file: 'file',
  'jy-file': 'file',
};
export const icon = (name, cls = '') => {
  const art = brandIcons812[name] || 'help';
  return `<svg class="icon jingyu-icon ${esc(cls)}" data-art="${art}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[art]}</svg>`;
};
let toastTimer;
function toastHost(t) {
  const d = document.querySelector('dialog[open]');
  (d || document.body).append(t);
  if (typeof t.showPopover === 'function') {
    t.setAttribute('popover', 'manual');
    if (!t.matches(':popover-open')) t.showPopover();
  }
}
export function toast(message, { center = false } = {}) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
  }
  t.textContent = message;
  t.classList.toggle('toast-center', center);
  toastHost(t);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      t.classList.remove('show');
      if (t.matches?.(':popover-open')) t.hidePopover();
    },
    center ? 1800 : 3500,
  );
}
let cleanupModal = null,
  previousFocus,
  restoreScroll = null;
function lockModalScroll() {
  const body = document.body;
  if (!body.style || restoreScroll) return;
  const keys = ['position', 'top', 'left', 'width', 'overflow', 'paddingRight'];
  const before = Object.fromEntries(keys.map((k) => [k, body.style[k]]));
  const x = window.scrollX,
    y = window.scrollY;
  const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  Object.assign(body.style, {
    position: 'fixed',
    top: -y + 'px',
    left: -x + 'px',
    width: '100%',
    overflow: 'hidden',
  });
  if (gap) body.style.paddingRight = gap + 'px';
  document.documentElement.classList.add('modal-open');
  restoreScroll = () => {
    Object.assign(body.style, before);
    document.documentElement.classList.remove('modal-open');
    window.scrollTo(x, y);
  };
}
export function closeModal() {
  const cleanup = cleanupModal;
  cleanupModal = null;
  const d = $('#dialog');
  try {
    if (typeof cleanup === 'function') cleanup();
  } finally {
    const t = d?.querySelector?.('#toast');
    if (t?.id === 'toast') document.body.append(t);
    if (d) {
      d.close();
      d.remove();
    }
    const unlock = restoreScroll;
    restoreScroll = null;
    unlock?.();
    previousFocus?.focus?.({ preventScroll: true });
    if (t?.id === 'toast' && t.classList.contains?.('show')) toastHost(t);
    if (typeof CustomEvent !== 'undefined')
      document.dispatchEvent?.(new CustomEvent('campus:modal-closed'));
  }
}
export function modal(title, html, setup) {
  closeModal();
  previousFocus = document.activeElement;
  const d = document.createElement('dialog');
  d.id = 'dialog';
  d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title" tabindex="-1" autofocus>${esc(title)}</h2><button type="button" class="modal-close" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body">${html}</div>`;
  document.body.append(d);
  d.querySelector('.dialog-head button').onclick = closeModal;
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeModal();
  });
  const outside = (e) => {
    const b = d.getBoundingClientRect();
    return (
      e.target === d &&
      (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
    );
  };
  let backdropPress = false;
  d.addEventListener('pointerdown', (e) => {
    backdropPress = outside(e);
  });
  d.addEventListener('pointercancel', () => {
    backdropPress = false;
  });
  d.addEventListener('click', (e) => {
    const dismiss = backdropPress && outside(e);
    backdropPress = false;
    if (dismiss) closeModal();
  });
  d.setAttribute('aria-labelledby', 'dialog-title');
  try {
    lockModalScroll();
    d.showModal();
    if (typeof document.dispatchEvent === 'function')
      document.dispatchEvent(new CustomEvent('campus:modal-open'));
    const activeToast = $('#toast');
    if (activeToast?.id === 'toast' && activeToast.classList.contains?.('show'))
      toastHost(activeToast);
    d.querySelector('#dialog-title').focus({ preventScroll: true });
    const originalCleanup = setup?.(d);
    let editorCleanup;
    void import('./editor-stability.js')
      .then((m) => {
        if (d.isConnected) editorCleanup = m.stabilizeEditor(d);
      })
      .catch(() => {});
    cleanupModal = () => {
      editorCleanup?.();
      if (typeof originalCleanup === 'function') originalCleanup();
    };
  } catch (error) {
    closeModal();
    throw error;
  }
  return d;
}
export async function formSubmit(e, work) {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('[type=submit],button:not([type])');
  if (btn) btn.disabled = true;
  const err = e.target.querySelector('.form-error');
  if (err) err.textContent = '';
  try {
    await work(Object.fromEntries(new FormData(e.target)), e.target);
  } catch (x) {
    if (err) err.textContent = x.message;
    else toast(x.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
export function field(label, name, type = 'text', value = '', extra = '') {
  const suffix = type === 'datetime-local' ? 'T23:59' : '';
  const lower = type === 'datetime-local' ? 'T00:00' : '';
  const dateRange = ['date', 'datetime-local'].includes(type)
    ? `${/\bmin\s*=/.test(extra) ? '' : `min="1000-01-01${lower}"`} ${/\bmax\s*=/.test(extra) ? '' : `max="9999-12-31${suffix}"`}`
    : '';
  return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${dateRange} ${extra}></label>`;
}
export const errorHTML = '<p class="form-error" role="alert"></p>';
function jpegCanvas(source, width, height, { maxSize = 1600, square = false } = {}) {
  if (!width || !height) throw Error('照片还没有准备好，请稍后再试。');
  const edge = Math.min(width, height),
    scale = Math.min(1, maxSize / (square ? edge : Math.max(width, height))),
    c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((square ? edge : width) * scale));
  c.height = Math.max(1, Math.round((square ? edge : height) * scale));
  const ctx = c.getContext('2d');
  if (!ctx) throw Error('当前浏览器无法处理照片，请换一个浏览器重试。');
  if (square)
    ctx.drawImage(
      source,
      (width - edge) / 2,
      (height - edge) / 2,
      edge,
      edge,
      0,
      0,
      c.width,
      c.height,
    );
  else ctx.drawImage(source, 0, 0, c.width, c.height);
  let data = c.toDataURL('image/jpeg', 0.82);
  if (!square && data.length > 1200000) data = c.toDataURL('image/jpeg', 0.68);
  if (!data.startsWith('data:image/jpeg;base64,'))
    throw Error('照片处理失败，请选择较小的 JPEG 或 PNG 照片。');
  return data;
}
export async function readPhoto(file, options) {
  if (!file || file.size > 20 * 1024 * 1024) throw Error('请选择 20MB 以内的照片');
  let bitmap;
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
        return jpegCanvas(bitmap, bitmap.width, bitmap.height, options);
      } catch {}
    }
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('照片读取失败，请重新选择照片。'));
      reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(Error('这张照片的格式无法读取。请转换为 JPEG / PNG，或用内建摄像头拍摄。'));
      image.src = data;
    });
    return jpegCanvas(img, img.naturalWidth, img.naturalHeight, options);
  } finally {
    bitmap?.close();
  }
}
const uploadAttempts = new Map();
let uploadActive = false;
const uploadQueue = [];
export function uploadPhoto(photo, options = {}) {
  return new Promise((resolve, reject) => {
    const task = () => {
      options.signal?.removeEventListener('abort', cancel);
      if (options.signal?.aborted) {
        reject(new DOMException('上传已取消', 'AbortError'));
        next();
        return;
      }
      uploadActive = true;
      const work = sendPhoto(photo, options);
      work.then(
        (value) => {
          next();
          resolve(value);
        },
        (error) => {
          next();
          reject(error);
        },
      );
    };
    const cancel = () => {
      const index = uploadQueue.indexOf(task);
      if (index >= 0) {
        uploadQueue.splice(index, 1);
        reject(new DOMException('上传已取消', 'AbortError'));
      }
    };
    if (uploadActive) {
      options.onProgress?.({ phase: 'queued' });
      uploadQueue.push(task);
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
    } else task();
  });
}
function next() {
  uploadActive = false;
  uploadQueue.shift()?.();
}
function sendPhoto(photo, { onProgress = () => {}, signal, submissionId } = {}) {
  if (!uploadAttempts.has(photo)) {
    if (uploadAttempts.size >= 8) uploadAttempts.delete(uploadAttempts.keys().next().value);
    uploadAttempts.set(photo, crypto.randomUUID());
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let finished = false;
    const abort = () => xhr.abort();
    const settle = (fn, value) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    xhr.upload.onprogress = (e) =>
      onProgress({ phase: 'upload', loaded: e.loaded, total: e.lengthComputable ? e.total : null });
    xhr.upload.onload = () => onProgress({ phase: 'save' });
    xhr.onload = () => {
      try {
        const result = parseResponse(xhr.responseText, xhr.status);
        if (typeof result?.id !== 'string') throw Error('服务器未确认照片保存，请点击重试。');
        settle(resolve, result);
      } catch (e) {
        settle(reject, e);
      }
    };
    xhr.onerror = () => settle(reject, Error('照片上传中断，请检查网络后点击重试。'));
    xhr.ontimeout = () => settle(reject, Error('照片上传超时，照片已保留，请点击重试。'));
    xhr.onabort = () => {
      const e = Error('上传已取消');
      e.name = 'AbortError';
      settle(reject, e);
    };
    try {
      xhr.open('POST', new URL('/api/media', location.href).href, true);
      xhr.timeout = 90000;
      xhr.setRequestHeader('Content-Type', 'application/json');
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        const e = Error('上传已取消');
        e.name = 'AbortError';
        settle(reject, e);
        return;
      }
      onProgress({ phase: 'upload', loaded: 0, total: null });
      xhr.send(JSON.stringify({ photo, submissionId: submissionId || uploadAttempts.get(photo) }));
    } catch {
      settle(reject, Error('无法开始上传，请刷新页面后重试。'));
    }
  });
}
const photoError = (e) =>
  /expected pattern/i.test(e?.message || '')
    ? '浏览器未能处理这张照片，请重试或选择 JPEG / PNG 照片。'
    : e?.message || '照片处理失败，请重新选择。';
// Draft images stay on this device until the enclosing point/check-in is submitted.
const photoSubmissions = new WeakMap();
const mediaIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function photoUploadStatus(p) {
  return p.phase === 'save'
    ? '照片已发送，正在确认保存…'
    : p.total
      ? '正在上传照片（' + Math.round((p.loaded / p.total) * 100) + '%）'
      : '正在上传照片…';
}
export async function releaseDraftUpload(uploaded) {
  if (!mediaIdPattern.test(uploaded?.id || '')) return;
  try {
    await fetch('/api/media/' + uploaded.id, {
      method: 'DELETE',
      credentials: 'same-origin',
      keepalive: true,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* Server expiry handles closed tabs and disconnected requests. */
  }
}
export async function discardDraftPhoto(draft) {
  let data;
  try {
    data = await draft.read();
  } catch {}
  await draft.clear();
  void releaseDraftUpload(data?.uploaded);
}
export function prepareDraftPhoto(draft, { fallback, onProgress = () => {}, signal } = {}) {
  if (photoSubmissions.has(draft)) return photoSubmissions.get(draft);
  const work = (async () => {
    let data,
      stored = true;
    try {
      await draft.flush();
      data = await draft.read();
    } catch {
      stored = false;
      data = {};
    }
    const photo =
      data.photo ||
      fallback?.preview ||
      (fallback?.url?.startsWith('data:image/jpeg;base64,') ? fallback.url : null);
    let uploaded = data.uploaded || (fallback?.id ? fallback : null);
    if (uploaded?.id && mediaIdPattern.test(uploaded.id)) {
      try {
        uploaded = await api('/api/media/' + uploaded.id);
      } catch (e) {
        if (![404, 410].includes(e.status)) throw e;
        uploaded = null;
      }
    } else uploaded = null;
    if (!uploaded) {
      if (!photo?.startsWith('data:image/jpeg;base64,')) {
        if (!photo && !data.uploaded && !fallback) return null;
        throw Error('照片临时存储已过期，请重新选择照片');
      }
      const signature = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(photo))),
      ]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const attempt =
        data.uploadAttempt?.signature === signature
          ? data.uploadAttempt
          : { id: uploadAttempts.get(photo) || crypto.randomUUID(), signature };
      if (stored) {
        try {
          await draft.update({ uploadAttempt: attempt });
        } catch {
          stored = false;
        }
      }
      uploaded = await uploadPhoto(photo, { onProgress, signal, submissionId: attempt.id });
    }
    if (stored) {
      const current = await draft.read();
      if (current.photo !== data.photo) {
        void releaseDraftUpload(uploaded);
        throw Error('照片已更换或草稿已丢弃，请重新提交');
      }
      await draft.update({ uploaded }).catch(() => {});
    }
    return { ...uploaded, preview: photo || uploaded.url };
  })();
  photoSubmissions.set(draft, work);
  work
    .finally(() => {
      if (photoSubmissions.get(draft) === work) photoSubmissions.delete(draft);
    })
    .catch(() => {});
  return work;
}
export function photoPicker(
  onSaved,
  {
    draft,
    notice,
    keepDraft = false,
    confirmedMediaId = null,
    keepDraftLabel = '照片已选好，正式提交时上传',
  } = {},
) {
  return modal(
    '留住这一刻',
    `<p class="muted">手机优先使用系统相机；无法使用时可开启网页取景。相册入口只在你主动选择时打开。</p>${keepDraft ? '<p class="tip">照片先存本机，正式提交时才上传。未绑定的临时副本会在 24 小时后自动回收。</p>' : ''}<input type="file" id="native-camera" accept="image/*" capture="environment" hidden><video id="photo-live" class="photo-live" autoplay muted playsinline hidden></video><img id="photo-preview" class="photo-preview" alt="待上传照片" hidden><div class="button-row"><button id="open-camera" class="button">${icon('camera')} 打开摄像头</button><button id="web-camera" type="button" class="button secondary">网页相机</button><label class="button secondary file-button">选择照片<input type="file" id="photo-file" accept="image/*" aria-label="从相册选择照片"></label></div><section id="photo-progress" class="photo-progress" hidden><div class="upload-caption"><span id="upload-stage" role="status">准备照片</span><b id="upload-percent"></b></div><div id="upload-meter" class="upload-meter indeterminate" role="progressbar" aria-label="照片上传进度" aria-valuemin="0" aria-valuemax="100"><span></span></div><small id="upload-hint">请保持页面打开</small></section><p class="form-error" id="camera-error" role="alert"></p><button id="retry-photo" class="button secondary wide" hidden>重试保存这张照片</button>`,
    (d) => {
      let pendingPhoto,
        uploaded,
        busy = false,
        controller;
      const native = $('#native-camera', d),
        preview = $('#photo-preview', d),
        open = $('#open-camera', d),
        file = $('#photo-file', d),
        retry = $('#retry-photo', d);
      let locallySaved = false;
      if (notice) {
        notice.box.classList.add('photo-draft-status');
        $('.dialog-body', d).prepend(notice.box);
      }
      const retain = async (patch) => {
        if (!draft) return false;
        try {
          draft.reopen();
          await draft.update(patch);
          locallySaved = true;
          return true;
        } catch {
          locallySaved = false;
          return false;
        }
      };
      let stream = null,
        starting = false,
        cameraGeneration = 0,
        preferWeb = false;
      const video = $('#photo-live', d),
        web = $('#web-camera', d);
      const mobile =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
        navigator.userAgentData?.mobile;
      web.hidden = !mobile;
      const stop = () => {
        cameraGeneration++;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        starting = false;
        video.srcObject = null;
        video.hidden = true;
        open.innerHTML = icon('camera') + ' 打开摄像头';
      };
      const startWeb = async () => {
        if (starting || stream || busy) return;
        starting = true;
        open.disabled = true;
        const generation = ++cameraGeneration;
        try {
          if (!navigator.mediaDevices?.getUserMedia)
            throw Error('当前浏览器无法开启网页相机，请使用HTTPS或本机预览。');
          const next = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          if (!d.isConnected || generation !== cameraGeneration || document.hidden) {
            next.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = next;
          video.srcObject = stream;
          video.hidden = false;
          preview.hidden = true;
          await video.play();
          if (d.isConnected && stream) {
            open.innerHTML = icon('camera') + ' 拍一张';
            $('#camera-error', d).textContent = '';
          }
        } catch (e) {
          stop();
          if (d.isConnected)
            $('#camera-error', d).textContent =
              e.name === 'NotAllowedError'
                ? '未获得相机权限。可以允许权限后重试，或主动选择相册。'
                : photoError(e);
        } finally {
          starting = false;
          if (d.isConnected) open.disabled = false;
        }
      };
      const visibility = () => {
        if (document.hidden) stop();
      };
      document.addEventListener('visibilitychange', visibility);
      web.onclick = () => {
        preferWeb = true;
        void startWeb();
      };
      const lock = (value) => {
        busy = value;
        open.disabled = value;
        file.disabled = value;
        file.closest('label').classList.toggle('disabled', value);
        native.disabled = value;
        retry.disabled = value;
      };
      const progress = (p) => {
        if (!d.isConnected) return;
        $('#photo-progress', d).hidden = false;
        const meter = $('#upload-meter', d);
        const determinate = p.phase === 'upload' && p.total;
        meter.classList.toggle('indeterminate', !determinate);
        if (determinate) {
          const percent = Math.min(100, Math.round((p.loaded / p.total) * 100));
          meter.setAttribute('aria-valuenow', percent);
          meter.firstElementChild.style.width = percent + '%';
          $('#upload-percent', d).textContent = percent + '%';
        } else {
          meter.removeAttribute('aria-valuenow');
          meter.firstElementChild.style.width = '';
          $('#upload-percent', d).textContent = '';
        }
        $('#upload-stage', d).textContent =
          p.phase === 'queued'
            ? '已加入上传队列'
            : p.phase === 'prepare'
              ? '正在读取、压缩照片'
              : p.phase === 'upload'
                ? '正在上传照片'
                : '照片已发送，正在保存';
        $('#upload-hint', d).textContent =
          p.phase === 'upload' && p.total
            ? `${(p.loaded / 1024).toFixed(0)} / ${(p.total / 1024).toFixed(0)} KB · 关闭弹窗会取消上传`
            : '请保持页面打开，完成后会自动提示';
      };
      const finish = async () => {
        if (busy || !pendingPhoto || !d.isConnected) return;
        lock(true);
        retry.hidden = true;
        $('#camera-error', d).textContent = '';
        controller = new AbortController();
        try {
          if (keepDraft) {
            await onSaved({
              id: null,
              url: pendingPhoto,
              preview: pendingPhoto,
              local: true,
              locallySaved,
            });
            if (d.isConnected) {
              closeModal();
              toast(keepDraftLabel);
            }
            return;
          }
          if (uploaded) {
            try {
              uploaded = await api('/api/media/' + uploaded.id);
            } catch (e) {
              if (![404, 410].includes(e.status)) throw e;
              uploaded = null;
            }
          }
          if (!uploaded) {
            uploaded = await uploadPhoto(pendingPhoto, {
              signal: controller.signal,
              onProgress: progress,
            });
            await retain({ photo: pendingPhoto, uploaded });
          }
          if (!d.isConnected) return;
          progress({ phase: 'save' });
          await onSaved(uploaded);
          if (draft && !keepDraft) {
            try {
              await draft.clear({ submitted: true });
            } catch {
              toast('照片已提交，但本机草稿清理失败；请稍后丢弃。');
            }
          }
          if (d.isConnected) {
            closeModal();
            toast(keepDraft ? keepDraftLabel : '照片已提交到账号');
          }
        } catch (e) {
          if (d.isConnected && e.name !== 'AbortError') {
            const msg = e.message || '照片保存失败，请重试。';
            $('#camera-error', d).textContent = /expected pattern/i.test(msg)
              ? '照片处理或服务连接异常。请重试；仍失败时选择 JPEG / PNG 照片。'
              : msg;
            retry.hidden = false;
            $('#upload-stage', d).textContent = locallySaved
              ? '提交失败，照片草稿已保存到本机'
              : '提交失败，照片暂留当前页面';
            $('#upload-hint', d).textContent = '无需重新选图，点击下方重试；也可以重新选择照片。';
            $('#upload-meter', d).classList.remove('indeterminate');
          }
        } finally {
          if (d.isConnected) lock(false);
        }
      };
      const selected = async (photo) => {
        void releaseDraftUpload(uploaded);
        pendingPhoto = photo;
        uploaded = null;
        stop();
        preview.src = photo;
        preview.hidden = false;
        await retain({ photo, uploaded: null });
        if (!d.isConnected) return;
        lock(false);
        await finish();
      };
      file.onchange = async (e) => {
        const chosen = e.target.files?.[0];
        if (!chosen || busy) return;
        lock(true);
        retry.hidden = true;
        $('#camera-error', d).textContent = '';
        progress({ phase: 'prepare' });
        try {
          const data = await readPhoto(chosen);
          if (d.isConnected) await selected(data);
        } catch (e) {
          if (d.isConnected) {
            $('#camera-error', d).textContent = photoError(e);
            $('#photo-progress', d).hidden = true;
          }
        } finally {
          file.value = '';
          if (d.isConnected) lock(false);
        }
      };
      native.onchange = file.onchange;
      native.addEventListener('cancel', () => {
        preferWeb = true;
        if (d.isConnected) {
          open.innerHTML = icon('camera') + ' 开启网页相机';
          $('#camera-error', d).textContent =
            '没有拍摄照片。再次点击可使用网页取景，不会自动打开相册。';
        }
      });
      open.onclick = async () => {
        if (busy || starting) return;
        if (stream) {
          try {
            await selected(jpegCanvas(video, video.videoWidth, video.videoHeight));
          } catch (e) {
            $('#camera-error', d).textContent = photoError(e);
          }
          return;
        }
        if (mobile && 'capture' in native && !preferWeb) {
          native.value = '';
          native.click();
        } else await startWeb();
      };
      retry.onclick = finish;
      if (draft) {
        lock(true);
        draft
          .read()
          .then(async (data) => {
            if (!d.isConnected) return;
            if (data.uploaded?.id === confirmedMediaId) {
              await draft.clear({ submitted: true });
              return;
            }
            if (
              typeof data.photo === 'string' &&
              data.photo.startsWith('data:image/jpeg;base64,')
            ) {
              pendingPhoto = data.photo;
              uploaded = data.uploaded?.id ? data.uploaded : null;
              locallySaved = true;
              preview.src = pendingPhoto;
              preview.hidden = false;
              retry.hidden = false;
              retry.textContent = keepDraft ? '使用恢复的照片' : '提交恢复的照片';
            }
          })
          .catch(() => {})
          .finally(() => {
            if (d.isConnected) lock(false);
          });
      }
      if (notice)
        notice.discard.onclick = async () => {
          if (busy) return;
          lock(true);
          try {
            await discardDraftPhoto(draft);
            if (keepDraft) await onSaved(null);
            pendingPhoto = null;
            uploaded = null;
            locallySaved = false;
            preview.hidden = true;
            preview.removeAttribute('src');
            retry.hidden = true;
            $('#photo-progress', d).hidden = true;
            $('#camera-error', d).textContent = '';
            stop();
          } catch {
          } finally {
            if (d.isConnected) lock(false);
          }
        };
      return () => {
        controller?.abort();
        stop();
        document.removeEventListener('visibilitychange', visibility);
        notice?.unsubscribe();
      };
    },
  );
}
export function passwordDialog() {
  modal(
    '修改密码',
    `<form id="pw-form">${field('当前密码', 'currentPassword', 'password', '', 'required autocomplete="current-password"')}${field('新密码（至少 8 位）', 'newPassword', 'password', '', 'required minlength="8" maxlength="128" autocomplete="new-password"')}${field('再次输入新密码', 'confirm', 'password', '', 'required autocomplete="new-password"')}${errorHTML}<button type="submit" class="button wide">保存新密码</button></form>`,
    (d) => {
      $('#pw-form', d).onsubmit = (e) =>
        formSubmit(e, async (f) => {
          if (f.newPassword !== f.confirm) throw Error('两次新密码不一致');
          await api('/api/auth/password', 'PATCH', f);
          closeModal();
          toast('密码已修改，其他登录已失效');
        });
    },
  );
}

// The same authorized URL serves a bounded thumbnail; detail links keep the full photo.
export function thumbnail(url) {
  const value = String(url || '');
  return value.startsWith('/') && !value.startsWith('//')
    ? value + (value.includes('?') ? '&' : '?') + 'size=thumb'
    : value;
}
