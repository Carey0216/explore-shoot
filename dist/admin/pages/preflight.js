import { $, api, esc, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
const types = {
  points: '校园点位',
  'shooting-spots': '真实机位',
  topics: '活动专题',
  guides: '拍摄指南',
};
export function preflightPage() {
  return (
    '<section><h2>先检查，再发布</h2><p class="muted">集中核对图片、开放时间、英文校订与链接。只展示当前账号有权维护的内容。</p><div class="preflight-toolbar81"><div class="preflight-summary81" id="preflight-summary81" role="status">正在检查内容…</div><button class="button" id="preflight-run81">运行完整预检</button></div><div class="toolbar"><label>内容类型<select id="preflight-type81"><option value="all">全部内容</option>' +
    Object.entries(types)
      .map(([id, t]) => `<option value="${id}">${t}</option>`)
      .join('') +
    '</select></label><label>检查结果<select id="preflight-state81"><option value="issues">有待处理项</option><option value="all">全部内容</option><option value="error">明确问题</option></select></label></div><div id="preflight-links81"></div><div class="preflight-list81" id="preflight-list81"></div></section>'
  );
}
export function bindPreflight(state) {
  const root = $('#admin-body'),
    owner = state.account.id;
  let result,
    serial = 0;
  const alive = () => root.isConnected && state.page === 'preflight' && state.account?.id === owner;
  const draw = () => {
    if (!result) return;
    const type = $('#preflight-type81', root).value,
      filter = $('#preflight-state81', root).value;
    const visible = result.resources.filter((r) => {
      const issues = result.issues.filter((i) => i.resource === r.key);
      return (
        (type === 'all' || type === r.type) &&
        (filter === 'all' || filter === 'error'
          ? filter === 'all' || issues.some((i) => i.level === 'error')
          : issues.length > 0)
      );
    });
    $('#preflight-summary81', root).textContent =
      `已检查 ${result.summary.resources} 项 · ${result.summary.errors} 个明确问题 · ${result.summary.warnings} 项待补充`;
    $('#preflight-list81', root).innerHTML =
      visible
        .map((r) => {
          const issues = result.issues.filter((i) => i.resource === r.key);
          return `<article class="preflight-resource81"><div><small class="muted">${types[r.type]} · ${r.published ? '已发布' : '草稿 / 未发布'}</small><h3>${esc(r.title || '未填写标题')}</h3><p class="muted">${esc(r.subtitle || '')}</p></div><ul>${issues.map((i) => `<li><strong>${i.level === 'error' ? '需修复' : '待补充'}</strong> · ${esc(i.message)}</li>`).join('') || '<li>基础字段检查通过，仍请核对实际内容。</li>'}</ul><div class="button-row"><button class="button secondary small" data-preflight-preview="${r.key}">手机 / 桌面预览</button><a class="text-btn" href="${r.editRoute}">前往维护 ↗</a>${r.editable ? `<button class="text-btn" data-preflight-english="${r.key}">编辑英文内容</button>` : ''}</div></article>`;
        })
        .join('') || '<p class="empty">这个筛选下没有待处理内容。</p>';
    const checks = result.linkChecks || [];
    $('#preflight-links81', root).innerHTML = checks.length
      ? `<section class="panel"><h3>链接检查</h3><ul>${checks.map((c) => `<li><strong>${esc(c.message)}</strong> <small>${esc(c.url)}</small></li>`).join('')}</ul><p class="muted">超时、跳转与拒绝自动访问都显示“需人工确认”，不冒充链接失效。</p></section>`
      : '';
    root
      .querySelectorAll('[data-preflight-preview]')
      .forEach(
        (b) =>
          (b.onclick = () =>
            preview(result.resources.find((r) => r.key === b.dataset.preflightPreview))),
      );
    root
      .querySelectorAll('[data-preflight-english]')
      .forEach(
        (b) =>
          (b.onclick = () =>
            english(result.resources.find((r) => r.key === b.dataset.preflightEnglish))),
      );
  };
  const preview = (resource) => {
    modal(
      '发布前内容预览',
      `<div class="button-row"><button class="button secondary small" data-preview-size="phone">手机</button><button class="button secondary small" data-preview-size="desktop">桌面</button><button class="text-btn" id="preflight-preview-language81">English</button></div><p class="muted">这是内容排版预览，不会发布草稿或增加浏览统计。</p><article id="preflight-preview81" class="preflight-preview81 phone" data-i18n-skip></article>`,
      (d) => {
        d.classList.add('preflight-dialog81');
        let lang = 'zh-CN';
        const content = () => {
          const english = resource.english || {},
            title = lang === 'en-US' ? english.title || resource.title : resource.title,
            body = lang === 'en-US' ? english.body || resource.body : resource.body;
          $('#preflight-preview81', d).innerHTML =
            `${resource.photo ? `<img src="${esc(resource.photo)}" alt="${esc(title)}">` : '<div class="spot-photo-empty">专属图片待补充</div>'}<h2>${esc(title)}</h2><small>${esc(resource.subtitle)}</small><p>${esc(body)}</p>${lang === 'en-US' && (!english.title || (resource.body && !english.body)) ? '<p>English copy is incomplete; original content is shown.</p>' : ''}`;
        };
        content();
        d.querySelectorAll('[data-preview-size]').forEach(
          (b) =>
            (b.onclick = () => {
              $('#preflight-preview81', d).classList.toggle(
                'phone',
                b.dataset.previewSize === 'phone',
              );
            }),
        );
        $('#preflight-preview-language81', d).onclick = () => {
          lang = lang === 'zh-CN' ? 'en-US' : 'zh-CN';
          $('#preflight-preview-language81', d).textContent =
            lang === 'zh-CN' ? 'English' : '简体中文';
          content();
        };
      },
    );
  };
  const english = (resource) =>
    modal(
      '校订英文 · ' + resource.title,
      `<p class="muted">只修改此内容的英文版本，原文保留。已发布内容保存后会同步用户端。</p><form id="preflight-english-form81"><label>English title<input name="title" value="${esc(resource.english?.title || '')}" maxlength="160" required></label><label>English copy<textarea name="body" maxlength="4000" rows="8" ${resource.body ? 'required' : ''}>${esc(resource.english?.body || '')}</textarea></label>${errorHTML}<button class="button wide" type="submit">保存英文校订</button></form>`,
      (d) => {
        $('#preflight-english-form81', d).onsubmit = (e) =>
          formSubmit(e, async (values) => {
            if (!alive()) throw Error('页面或账号已改变');
            await api('/api/admin/preflight/english', 'PUT', {
              type: resource.type,
              id: resource.id,
              revision: resource.revision,
              title: values.title,
              body: values.body,
            });
            closeModal();
            toast('英文校订已保存');
            void load(false);
          });
      },
    );
  const load = async (links) => {
    const stamp = ++serial,
      button = $('#preflight-run81', root);
    button.disabled = true;
    try {
      const data = await api('/api/admin/preflight' + (links ? '?links=1' : ''));
      if (!alive() || stamp !== serial) return;
      while (links && data.nextLinkOffset != null) {
        const next = await api('/api/admin/preflight?links=1&offset=' + data.nextLinkOffset);
        if (!alive() || stamp !== serial) return;
        data.linkChecks.push(...next.linkChecks);
        data.nextLinkOffset = next.nextLinkOffset;
      }
      data.summary.errors =
        data.issues.filter((i) => i.level === 'error').length +
        data.linkChecks.filter((c) => c.state === 'broken').length;
      result = data;
      draw();
    } catch (e) {
      if (alive() && stamp === serial)
        $('#preflight-summary81', root).innerHTML = `<span role="alert">${esc(e.message)}</span>`;
    } finally {
      if (alive() && stamp === serial) button.disabled = false;
    }
  };
  $('#preflight-type81', root).onchange = draw;
  $('#preflight-state81', root).onchange = draw;
  $('#preflight-run81', root).onclick = () => load(true);
  void load(false);
}
export function weatherSettingsPage() {
  return '<section class="panel"><h2>校园天气与拍摄预报</h2><p class="muted">统一查询校园公共位置，不上传用户定位。使用 Open-Meteo 非商业试点接口，由服务器缓存；温度为空时明确显示不可用。</p><div id="weather-settings81" role="status">正在载入天气配置…</div></section>';
}
export async function bindWeatherSettings(state) {
  const root = $('#weather-settings81'),
    owner = state.account.id,
    alive = () => root.isConnected && state.page === 'weather' && state.account?.id === owner;
  try {
    const config = await api('/api/admin/weather');
    if (!alive()) return;
    root.innerHTML = `<form id="weather-settings-form81"><label>显示位置名称<input name="label" maxlength="30" required value="${esc(config.label)}"></label><div class="memory-fields81"><label>纬度<input name="latitude" type="number" step="0.000001" min="38" max="39" required value="${config.latitude}"></label><label>经度<input name="longitude" type="number" step="0.000001" min="105" max="107" required value="${config.longitude}"></label></div><label>缓存分钟<input name="refreshMinutes" type="number" min="10" max="120" required value="${config.refreshMinutes}"></label><p class="muted">气泡、拍摄推荐、回忆册的显示与维护开关，在“交互功能与入口”统一管理。</p>${errorHTML}<div class="button-row"><button type="submit" class="button">保存天气配置</button><button type="button" class="button secondary" id="weather-test81">检查天气接口</button></div><p id="weather-test-status81" role="status"></p></form>`;
    $('#weather-settings-form81', root).onsubmit = (e) =>
      formSubmit(e, async (values) => {
        if (!alive()) throw Error('账号已改变');
        const saved = await api('/api/admin/weather', 'PUT', {
          revision: config.revision,
          label: values.label,
          latitude: Number(values.latitude),
          longitude: Number(values.longitude),
          refreshMinutes: Number(values.refreshMinutes),
        });
        config.revision = saved.revision;
        toast('校园天气配置已保存');
      });
    $('#weather-test81', root).onclick = async function () {
      this.disabled = true;
      try {
        const data = await api('/api/admin/weather/preview');
        if (alive())
          $('#weather-test-status81', root).textContent = data.available
            ? `${data.label} · 当前 ${data.temperature}° / 最高 ${data.high}° / 最低 ${data.low}° · ${data.stale ? '上次预报' : '接口可用'}`
            : data.message;
      } catch (e) {
        if (alive()) $('#weather-test-status81', root).textContent = e.message;
      } finally {
        if (alive()) this.disabled = false;
      }
    };
  } catch (e) {
    if (alive()) root.textContent = e.message;
  }
}
