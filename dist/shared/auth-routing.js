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
    'topics',
    'support',
  ],
  admin: [
    'overview',
    'invites',
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
  const place =
    audience === 'user' &&
    typeof value === 'string' &&
    /^\/#(?:place|checkin|spot)\/[a-z0-9-]+(?:\?(?:shot|spot)=[a-z0-9-]+)?$/.test(value);
  return typeof value === 'string' && (place || allowed.some((p) => value === '/#' + p))
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
