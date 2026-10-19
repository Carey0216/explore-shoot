// Keep existing URLs; five primary groups replace the long flat menu on both screens.
export const adminGroups = [
  {
    id: 'overview',
    label: '工作台',
    icon: 'discover',
    pages: ['overview', 'inbox', 'review-queue'],
  },
  {
    id: 'users',
    label: '用户与权限',
    icon: 'people',
    pages: ['users', 'applications', 'scout-quiz', 'messages'],
  },
  {
    id: 'points',
    label: '内容维护',
    icon: 'pin',
    pages: [
      'points',
      'shooting-spots',
      'passport',
      'site-content',
      'announcements',
      'knowledge',
      'topics',
      'works',
      'work-reports',
      'campus-map',
      'content',
      'reports',
    ],
  },
  { id: 'audit', label: '记录', icon: 'clock', pages: ['audit'] },
  {
    id: 'settings',
    label: '账户设置与管理员管理',
    icon: 'settings',
    pages: ['settings', 'admins', 'features', 'ai-settings'],
  },
];
export function currentGroup(page) {
  return adminGroups.find((g) => g.pages.includes(page)) || adminGroups[0];
}
