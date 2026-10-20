import { icon } from '/shared/ui.js';
export const outingPages = ['map', 'navigate', 'routes', 'active'];
export const mobileItems = [
  ['discover', 'discover', '社区'],
  ['topics', 'leaf', '活动'],
  ['map', 'walk', '出行'],
  ['me', 'user', '我的'],
];
export function navSelected(item, page) {
  if (item === 'discover')
    return ['discover', 'search', 'shots', 'place', 'spot', 'checkin', 'publish'].includes(page);
  if (item === 'topics') return ['topics', 'topic'].includes(page);
  if (item === 'map') return outingPages.includes(page);
  if (item === 'me')
    return [
      'me',
      'settings',
      'passport',
      'notes',
      'notifications',
      'notice',
      'contact',
      'conversation',
      'my-works',
      'plans',
      'support',
    ].includes(page);
  return item === page;
}
export function communityTabs(page) {
  return ['discover', 'shots', 'place', 'spot', 'search'].includes(page)
    ? `<nav class="community-tabs" aria-label="社区内容"><a href="#discover" class="${['discover', 'search', 'place'].includes(page) ? 'active' : ''}">发现</a><a href="#shots" class="${['shots', 'spot'].includes(page) ? 'active' : ''}">机位</a></nav>`
    : '';
}
export function outingTabs(page) {
  return outingPages.includes(page)
    ? `<nav class="outing-tabs chips" aria-label="出行方式">${[
        ['map', 'map', '地图'],
        ['navigate', 'pin', '导航'],
        ['routes', 'walk', '探索'],
      ]
        .map(
          ([id, image, name]) =>
            `<a href="#${id}" class="chip ${page === id || (id === 'routes' && page === 'active') ? 'active' : ''}" ${page === id || (id === 'routes' && page === 'active') ? 'aria-current="page"' : ''}>${icon(image)}${name}</a>`,
        )
        .join('')}</nav>`
    : '';
}
