const root = '/pages/discover/index';
const publicPages = new Set([
  'discover',
  'shots',
  'map',
  'topics',
  'topic',
  'detail',
  'guides',
  'plan-share',
  'share',
]);
function card(page, original = {}) {
  const raw = String(original.path || ''),
    current = page.route || page.__route__ || '';
  const id = page.id || page.topicId || page.guideId || page.token;
  const proposed =
    raw ||
    '/' +
      current +
      (id && /^[a-zA-Z0-9_:-]{1,160}$/.test(String(id)) ? '?id=' + encodeURIComponent(id) : '');
  const match = /^\/pages\/([a-z-]+)\/index(?:\?(.*))?$/.exec(proposed);
  let path = root;
  if (match && publicPages.has(match[1])) {
    const query = (match[2] || '')
      .split('&')
      .filter((part) => /^(id|spot|kind|type|mode)=[a-zA-Z0-9_%:-]{1,160}$/.test(part))
      .join('&');
    // No draft content, account IDs, conversation, private media, tracking or access tokens.
    path = `/pages/${match[1]}/index` + (query ? '?' + query : '');
    if (
      ['detail', 'topic', 'plan-share', 'share'].includes(match[1]) &&
      !/(?:^|[?&])id=/.test(path)
    )
      path = root;
  }
  const publicLabel =
    match && publicPages.has(match[1])
      ? original.title || page.data?.point?.name || page.data?.topic?.title
      : '';
  const label = String(publicLabel || '在校园，遇见更多美好')
    .replace(/^景遇(?: JINGYU)?[ ·]*/, '')
    .slice(0, 48);
  return { title: '景遇 JINGYU · ' + label, path, imageUrl: '/assets/brand/jingyu-share.png' };
}
function install(definition) {
  const share = definition.onShareAppMessage;
  definition.onShareAppMessage = function (...args) {
    return card(this, share?.apply(this, args) || {});
  };
  definition.onShareTimeline = function (...args) {
    const page = (this.route || '').split('/')[1];
    const shared = card(this, share?.call(this) || {});
    return {
      title: shared.title,
      imageUrl: shared.imageUrl,
      query: publicPages.has(page) ? shared.path.split('?')[1] || '' : '',
    };
  };
}
module.exports = { card, install, publicPages };
