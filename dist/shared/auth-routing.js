const pages = {
  user: [
    'discover',
    'shots',
    'search',
    'map',
    'navigate',
    'routes',
    'active',
    'notes',
    'me',
    'publish',
    'settings',
    'passport',
    'notifications',
    'my-works',
    'plans',
    'collections',
    'shared-plan',
    'topics',
    'support',
    'contact',
  ],
  admin: [
    'overview',
    'inbox',
    'messages',
    'review-queue',
    'users',
    'applications',
    'scout-quiz',
    'points',
    'campus-map',
    'shooting-spots',
    'passport',
    'site-content',
    'announcements',
    'knowledge',
    'topics',
    'features',
    'ai-settings',
    'works',
    'work-reports',
    'reports',
    'content',
    'admins',
    'settings',
    'audit',
  ],
};
export function safeReturn(audience, value) {
  const allowed = pages[audience] || pages.user;
  const detail =
    typeof value === 'string' &&
    (audience === 'admin'
      ? /^\/#messages\/[a-f0-9-]{36}$/.test(value)
      : /^\/#(?:conversation|notice|topic|shared-plan)\/[a-z0-9-]+$/.test(value));
  const place =
    audience === 'user' &&
    typeof value === 'string' &&
    /^\/#(?:place|checkin|spot)\/[a-z0-9-]+(?:\?(?:shot|spot)=[a-z0-9-]+)?$/.test(value);
  return typeof value === 'string' && (detail || place || allowed.some((p) => value === '/#' + p))
    ? value
    : '/#' + allowed[0];
}
export function authURL(audience, mode = 'login', target) {
  return (
    (audience === 'user' && mode === 'register' ? '/register.html' : '/login.html') +
    '?' +
    new URLSearchParams({ return: safeReturn(audience, target) })
  );
}
