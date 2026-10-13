// Keep existing URLs; five primary groups replace the long flat menu on both screens.
export const adminGroups = [
  { id: 'overview', label: '工作台', icon: 'discover', pages: ['overview'] },
  { id: 'users', label: '社区', icon: 'people', pages: ['users', 'applications', 'invites'] },
  {
    id: 'points',
    label: '内容',
    icon: 'pin',
    pages: ['points', 'campus-map', 'content', 'reports'],
  },
  { id: 'audit', label: '记录', icon: 'clock', pages: ['audit'] },
  { id: 'settings', label: '设置', icon: 'settings', pages: ['settings', 'admins'] },
];
export function currentGroup(page) {
  return adminGroups.find((g) => g.pages.includes(page)) || adminGroups[0];
}
