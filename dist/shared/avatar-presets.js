// 原创 SVG 头像，不依赖外部图床；ID 与 Java 白名单共同校验。
export const avatarPresets = [
  {
    id: 'alpine',
    name: '雪山晨光',
    category: '风景',
  },
  {
    id: 'cat',
    name: '奶油猫',
    category: '动物',
  },
  {
    id: 'astronaut',
    name: '星际旅人',
    category: '卡通',
  },
  {
    id: 'anime-sakura',
    name: '樱花少女',
    category: '动漫',
  },
  {
    id: 'sea',
    name: '海边日落',
    category: '风景',
  },
  {
    id: 'forest',
    name: '林间小路',
    category: '风景',
  },
  {
    id: 'lake',
    name: '月色湖泊',
    category: '风景',
  },
  {
    id: 'dog',
    name: '柴犬',
    category: '动物',
  },
  {
    id: 'fox',
    name: '小狐狸',
    category: '动物',
  },
  {
    id: 'panda',
    name: '熊猫',
    category: '动物',
  },
  {
    id: 'rabbit',
    name: '垂耳兔',
    category: '动物',
  },
  {
    id: 'bear',
    name: '小棕熊',
    category: '动物',
  },
  {
    id: 'penguin',
    name: '企鹅',
    category: '动物',
  },
  {
    id: 'koala',
    name: '考拉',
    category: '动物',
  },
  {
    id: 'robot',
    name: '圆圆机器人',
    category: '卡通',
  },
  {
    id: 'cloud',
    name: '微笑云朵',
    category: '卡通',
  },
  {
    id: 'sprout',
    name: '小小绿芽',
    category: '卡通',
  },
  {
    id: 'anime-blue',
    name: '蓝发少年',
    category: '动漫',
  },
  {
    id: 'anime-mint',
    name: '薄荷少女',
    category: '动漫',
  },
  {
    id: 'anime-night',
    name: '夜色少年',
    category: '动漫',
  },
];
export function presetAvatar(id) {
  return avatarPresets.find((x) => x.id === id);
}
export function presetURL(id) {
  return presetAvatar(id) ? '/shared/avatars/' + id + '.svg' : '';
}
