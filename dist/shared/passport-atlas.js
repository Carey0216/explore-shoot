import { esc } from './ui.js';
let sequence = 0;
const ringPath = (ring) =>
  ring.map(([x, y], i) => `${i ? 'L' : 'M'}${Number(x)},${Number(y)}`).join(' ') + 'Z';
export const buildingPath = (b) => [b.outline, ...(b.holes || [])].map(ringPath).join(' ');

// One source image, separate even-odd masks for every roof. No duplicate bitmap downloads.
export function atlasHTML(atlas, frame = 'photo', selected = '') {
  const uid = 'atlas-' + ++sequence;
  const photo = frame === 'photo';
  const width = photo ? atlas.photoWidth : atlas.planWidth;
  const height = photo ? atlas.photoHeight : atlas.planHeight;
  const image = photo ? atlas.photoURL : atlas.planURL;
  const buildings = atlas.buildings.filter((b) => b.frame === frame);
  return `<svg class="passport-atlas" viewBox="0 0 ${photo ? height : width} ${photo ? width : height}" role="group" aria-label="校园楼宇打卡点亮图"><defs><filter id="${uid}-gray"><feColorMatrix type="saturate" values="0"/></filter>${buildings.map((b, i) => `<clipPath id="${uid}-${i}"><path d="${buildingPath(b)}" clip-rule="evenodd"/></clipPath>`).join('')}</defs><g ${photo ? `transform="translate(0,${width}) rotate(-90)"` : ''}><image href="${esc(image)}" width="${width}" height="${height}" filter="url(#${uid}-gray)" opacity=".35"/>${buildings.map((b, i) => `<g role="button" tabindex="0" data-atlas-building="${esc(b.id)}" aria-label="${esc(b.name)} · ${b.collected ? '已点亮' : b.pointIds.length ? '未打卡' : '待关联点位'}"><title>${esc(b.name)} · ${b.collected ? '已点亮' : '未点亮'}</title><image href="${esc(image)}" width="${width}" height="${height}" clip-path="url(#${uid}-${i})" ${b.collected ? '' : `filter="url(#${uid}-gray)" opacity=".75"`}/><path d="${buildingPath(b)}" fill="${b.collected ? '#f2bb43' : '#839295'}" fill-opacity="${b.collected ? '.08' : '.22'}" fill-rule="evenodd" stroke="${b.id === selected ? '#e35b45' : b.collected ? '#e6ae31' : '#667a7e'}" stroke-width="${b.id === selected ? 4 : b.collected ? 2 : 1}" vector-effect="non-scaling-stroke"/></g>`).join('')}</g></svg>`;
}
export function bindAtlas(root, onSelect) {
  root.querySelectorAll('[data-atlas-building]').forEach((b) => {
    b.onclick = () => onSelect(b.dataset.atlasBuilding);
    b.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        b.click();
      }
    };
  });
}
