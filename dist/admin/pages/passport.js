import { bindAtlasOperations } from '../atlas-operations.js';
import { badgePresets, badgeURL } from '/shared/badge-presets.js';
import { $, api, esc, modal, closeModal, formSubmit, field, errorHTML, toast } from '/shared/ui.js';
import { atlasHTML, bindAtlas } from '/shared/passport-atlas.js';
import { mountAtlasEditor } from '../atlas-editor.js';
const kinds = { collection: '地点收集', night: '夜景照片', photos: '照片记录', visits: '打卡次数' };
const symbols = {
  building: '建筑',
  moon: '月亮',
  camera: '相机',
  leaf: '叶子',
  star: '星星',
  walk: '足迹',
};
export function createPassportPages({ state }) {
  let data = null,
    frame = 'photo',
    query = '';
  const passportPage = () =>
    '<section id="passport-admin"><p role="status">正在加载护照内容…</p></section>';
  const alive = (host) => host?.isConnected && state.page === 'passport';
  const load = async () => {
    const host = $('#passport-admin');
    try {
      const result = await api('/api/admin/passport');
      if (!alive(host)) return;
      data = result;
      draw(host);
    } catch (e) {
      if (alive(host))
        host.innerHTML = `<p role="alert">${esc(e.message)}</p><button class="button secondary" id="passport-admin-retry">重试</button>`;
      $('#passport-admin-retry')?.addEventListener('click', load);
    }
  };
  function draw(host) {
    const canCreate = ['super', 'owner'].includes(state.account.role);
    host.innerHTML = `<section class="panel"><div class="passport-section-title"><h2>主题印章与成就</h2>${canCreate ? '<button class="button" id="passport-new-theme">创建主题印章</button>' : ''}</div><p class="muted">仅超级管理员创建，所有管理员可维护规则与展示状态。用户进度按个人打卡实时计算，修改规则后进度会随之变化。</p>${canCreate ? '<div class="button-row"><button class="button secondary small" data-theme-preset="collection">校园建筑集模板</button><button class="button secondary small" data-theme-preset="night">第一次夜景拍摄模板</button></div>' : ''}<div class="admin-passport-themes">${data.themes.map((r) => `<article class="review-card"><span class="pill">${r.published ? '展示中' : '已隐藏'}</span><img class="badge-preview" src="${badgeURL(r.badgePreset)}" alt="勋章预览"><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><small>${kinds[r.kind]} · 目标 ${r.target}</small><button class="button secondary small" data-edit-theme="${r.id}">维护印章</button></article>`).join('') || '<p class="empty">还没有主题印章，请超级管理员创建。</p>'}</div></section><section class="panel passport-map-panel"><h2>逐栋楼宇与打卡地点关联</h2><p class="muted">先在图上选楼，再关联已核实的校园点位。影像轮廓与楼宇编号图分开维护，不按相近坐标猜测楼名；未关联保持灰色。</p><div class="button-row"><button class="button secondary" data-admin-frame="photo">俯瞰图</button><button class="button secondary" data-admin-frame="plan">楼宇图</button></div><div class="atlas-scroll" id="admin-passport-atlas"></div><label>搜索楼宇<input id="passport-building-query" type="search" maxlength="100" placeholder="按楼名或影像编号查找" value="${esc(query)}"></label><div class="passport-building-list" id="admin-building-list"></div></section>`;
    const atlasPanel = host.querySelector('.passport-map-panel');
    host.prepend(atlasPanel);
    bindAtlasOperations(atlasPanel, { state, atlas: data.atlas, reload: load });
    atlasPanel.querySelector('h2').textContent = '校园收集图 · 编辑与关联';
    const drawMap = () => {
      $('#admin-passport-atlas', host).innerHTML = atlasHTML(data.atlas, frame);
      bindAtlas($('#admin-passport-atlas', host), editBuilding);
      drawList();
    };
    const drawList = () => {
      $('#admin-building-list', host).innerHTML = data.atlas.buildings
        .filter((b) => b.frame === frame && b.name.includes(query))
        .map(
          (b) =>
            `<button type="button" data-edit-building="${b.id}"><span>${esc(b.name)}</span><small>${b.pointIds.length ? '已关联 ' + b.pointIds.length + ' 个地点' : '未关联'} · 编辑关联${state.account.role === 'owner' ? ' / 重新圈画' : ''}</small></button>`,
        )
        .join('');
      host
        .querySelectorAll('[data-edit-building]')
        .forEach((b) => (b.onclick = () => editBuilding(b.dataset.editBuilding)));
    };
    host.querySelectorAll('[data-admin-frame]').forEach(
      (b) =>
        (b.onclick = () => {
          frame = b.dataset.adminFrame;
          drawMap();
        }),
    );
    $('#passport-building-query', host).oninput = (e) => {
      query = e.target.value;
      drawList();
    };
    $('#passport-new-theme', host)?.addEventListener('click', () => editTheme());
    host
      .querySelectorAll('[data-theme-preset]')
      .forEach((b) => (b.onclick = () => editTheme(null, b.dataset.themePreset)));
    host
      .querySelectorAll('[data-edit-theme]')
      .forEach(
        (b) => (b.onclick = () => editTheme(data.themes.find((r) => r.id === b.dataset.editTheme))),
      );
    drawMap();
  }
  const pointChecks = (ids = []) =>
    `<div class="passport-point-options">${state.data.points.map((p) => `<label><input type="checkbox" name="pointId" value="${esc(p.id)}" ${ids.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}${p.published ? '' : '（未发布）'}</span></label>`).join('')}</div>`;
  function editTheme(old = null, preset = '') {
    const r =
      old ||
      (preset === 'night'
        ? {
            title: '第一次夜景拍摄',
            description: '在夜间留下一张校园照片。',
            kind: 'night',
            symbol: 'moon',
            target: 1,
            pointIds: [],
          }
        : preset === 'collection'
          ? {
              title: '校园建筑集',
              description: '走访校园建筑，收集不同的建筑视角。',
              kind: 'collection',
              symbol: 'building',
              target: 1,
              pointIds: state.data.points.filter((p) => p.theme === '建筑').map((p) => p.id),
            }
          : {});
    modal(
      old ? '维护主题印章' : '创建主题印章',
      `<form id="passport-theme-form">${field('印章名称', 'title', 'text', r.title || '', 'required maxlength="60"')}<label>印章说明<textarea name="description" required maxlength="500">${esc(r.description || '')}</textarea></label><div class="form-grid"><label>达成规则<select name="kind">${Object.entries(
        kinds,
      )
        .map(([id, t]) => `<option value="${id}" ${r.kind === id ? 'selected' : ''}>${t}</option>`)
        .join('')}</select></label><label>印章图案<select name="symbol">${Object.entries(symbols)
        .map(
          ([id, t]) => `<option value="${id}" ${r.symbol === id ? 'selected' : ''}>${t}</option>`,
        )
        .join(
          '',
        )}</select></label></div><fieldset><legend>选择勋章外观（50款）</legend><div class="badge-selector">${badgePresets.map((p) => `<label title="${esc(p.title)}"><img src="${badgeURL(p.id)}" alt="${esc(p.title)}" loading="lazy"><input type="radio" name="badgePreset" value="${p.id}" ${(r.badgePreset || 'badge-01') === p.id ? 'checked' : ''} aria-label="${esc(p.title)}"></label>`).join('')}</div></fieldset>${field('达成数量', 'target', 'number', r.target || 1, 'required min="1" max="10000"')}<p class="muted">地点收集按不同地点计数，须勾选地点；其他规则可不选地点，表示全校。夜景按北京时间18:00至次日06:00提交的带照片记录计算，非实地认证。</p><fieldset><legend>适用地点</legend>${pointChecks(r.pointIds)}</fieldset><label class="inline-check"><input type="checkbox" name="published" ${r.published ? 'checked' : ''}>向用户展示</label>${errorHTML}<button class="button wide" type="submit">保存主题印章</button></form>`,
      (d) => {
        const form = $('#passport-theme-form', d);
        form.onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api(
              '/api/admin/passport/themes' + (old ? '/' + old.id : ''),
              old ? 'PATCH' : 'POST',
              {
                title: f.title,
                description: f.description,
                kind: f.kind,
                symbol: f.symbol,
                badgePreset: f.badgePreset,
                target: Number(f.target),
                pointIds: new FormData(form).getAll('pointId'),
                published: form.elements.published.checked,
                ...(old ? { revision: old.revision } : {}),
              },
            );
            closeModal();
            await load();
            toast('主题印章已保存');
          });
      },
    );
  }
  function editBuilding(id) {
    const b = data.atlas.buildings.find((b) => b.id === id);
    if (!b) return;
    modal(
      '关联楼宇与打卡地点',
      `<p class="muted">${esc(b.frame === 'photo' ? '俯瞰影像轮廓' : '楼宇编号图轮廓')} · ${esc(b.id)}</p>${state.account?.role === 'owner' ? '<details class="atlas-redraw"><summary class="button secondary">重新圈画这栋楼（展开编辑器）</summary><div id="passport-outline-editor"></div><p class="muted">保存前自动备份当前轮廓；俯瞰图和楼宇图分别保存，不改变导航坐标。</p></details>' : ''}<form id="passport-building-form">${field('楼宇显示名称', 'name', 'text', b.name, 'required maxlength="80"')}<fieldset><legend>该楼宇对应的打卡地点</legend>${pointChecks(b.pointIds)}</fieldset><p class="muted">关联地点中任意一处打卡即可点亮该楼宇；取消所有勾选可解除关联。只关联确认属于该楼的点位。</p>${errorHTML}<button class="button wide" type="submit">保存楼宇关联</button></form>`,
      (d) => {
        const form = $('#passport-building-form', d);
        let drawing;
        const details = d.querySelector('.atlas-redraw');
        if (details)
          details.addEventListener('toggle', () => {
            if (details.open && !drawing)
              drawing = mountAtlasEditor($('#passport-outline-editor', d), data.atlas, b);
          });
        form.onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/passport/buildings', 'PUT', {
              id: b.id,
              name: f.name,
              pointIds: new FormData(form).getAll('pointId'),
              revision: b.revision,
              ...(drawing ? drawing.value() : {}),
            });
            closeModal();
            await load();
            toast('已保存到服务器，关联和轮廓已备份');
          });
      },
    );
  }
  return {
    passportPage,
    bindPassport: () => {
      if (state.page === 'passport') void load();
    },
  };
}
