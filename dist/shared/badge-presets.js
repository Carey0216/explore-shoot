// 50 original, editable vector medal designs.
export const badgePresets = [
  {
    id: 'badge-01',
    title: '鎏金 · 光影之心',
  },
  {
    id: 'badge-02',
    title: '鎏金 · 第一缕月光',
  },
  {
    id: 'badge-03',
    title: '鎏金 · 建筑拾光',
  },
  {
    id: 'badge-04',
    title: '鎏金 · 镜头诗人',
  },
  {
    id: 'badge-05',
    title: '鎏金 · 一叶知秋',
  },
  {
    id: 'badge-06',
    title: '鎏金 · 逐光罗盘',
  },
  {
    id: 'badge-07',
    title: '鎏金 · 莲湖来信',
  },
  {
    id: 'badge-08',
    title: '鎏金 · 钟楼守望',
  },
  {
    id: 'badge-09',
    title: '鎏金 · 书海漫游',
  },
  {
    id: 'badge-10',
    title: '鎏金 · 星河收藏家',
  },
  {
    id: 'badge-11',
    title: '月银 · 光影之心',
  },
  {
    id: 'badge-12',
    title: '月银 · 第一缕月光',
  },
  {
    id: 'badge-13',
    title: '月银 · 建筑拾光',
  },
  {
    id: 'badge-14',
    title: '月银 · 镜头诗人',
  },
  {
    id: 'badge-15',
    title: '月银 · 一叶知秋',
  },
  {
    id: 'badge-16',
    title: '月银 · 逐光罗盘',
  },
  {
    id: 'badge-17',
    title: '月银 · 莲湖来信',
  },
  {
    id: 'badge-18',
    title: '月银 · 钟楼守望',
  },
  {
    id: 'badge-19',
    title: '月银 · 书海漫游',
  },
  {
    id: 'badge-20',
    title: '月银 · 星河收藏家',
  },
  {
    id: 'badge-21',
    title: '玫瑰金 · 光影之心',
  },
  {
    id: 'badge-22',
    title: '玫瑰金 · 第一缕月光',
  },
  {
    id: 'badge-23',
    title: '玫瑰金 · 建筑拾光',
  },
  {
    id: 'badge-24',
    title: '玫瑰金 · 镜头诗人',
  },
  {
    id: 'badge-25',
    title: '玫瑰金 · 一叶知秋',
  },
  {
    id: 'badge-26',
    title: '玫瑰金 · 逐光罗盘',
  },
  {
    id: 'badge-27',
    title: '玫瑰金 · 莲湖来信',
  },
  {
    id: 'badge-28',
    title: '玫瑰金 · 钟楼守望',
  },
  {
    id: 'badge-29',
    title: '玫瑰金 · 书海漫游',
  },
  {
    id: 'badge-30',
    title: '玫瑰金 · 星河收藏家',
  },
  {
    id: 'badge-31',
    title: '青玉 · 光影之心',
  },
  {
    id: 'badge-32',
    title: '青玉 · 第一缕月光',
  },
  {
    id: 'badge-33',
    title: '青玉 · 建筑拾光',
  },
  {
    id: 'badge-34',
    title: '青玉 · 镜头诗人',
  },
  {
    id: 'badge-35',
    title: '青玉 · 一叶知秋',
  },
  {
    id: 'badge-36',
    title: '青玉 · 逐光罗盘',
  },
  {
    id: 'badge-37',
    title: '青玉 · 莲湖来信',
  },
  {
    id: 'badge-38',
    title: '青玉 · 钟楼守望',
  },
  {
    id: 'badge-39',
    title: '青玉 · 书海漫游',
  },
  {
    id: 'badge-40',
    title: '青玉 · 星河收藏家',
  },
  {
    id: 'badge-41',
    title: '星曜 · 光影之心',
  },
  {
    id: 'badge-42',
    title: '星曜 · 第一缕月光',
  },
  {
    id: 'badge-43',
    title: '星曜 · 建筑拾光',
  },
  {
    id: 'badge-44',
    title: '星曜 · 镜头诗人',
  },
  {
    id: 'badge-45',
    title: '星曜 · 一叶知秋',
  },
  {
    id: 'badge-46',
    title: '星曜 · 逐光罗盘',
  },
  {
    id: 'badge-47',
    title: '星曜 · 莲湖来信',
  },
  {
    id: 'badge-48',
    title: '星曜 · 钟楼守望',
  },
  {
    id: 'badge-49',
    title: '星曜 · 书海漫游',
  },
  {
    id: 'badge-50',
    title: '星曜 · 星河收藏家',
  },
];
export const badgeURL = (id) =>
  '/shared/badges/' + (/^badge-(0[1-9]|[1-4][0-9]|50)$/.test(id || '') ? id : 'badge-01') + '.png';
