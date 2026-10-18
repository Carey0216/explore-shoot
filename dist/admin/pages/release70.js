import { $, api, esc, modal, closeModal, errorHTML, formSubmit, toast, field } from '/shared/ui.js';
export const release70Page = () =>
  '<section class="panel" id="release70-host"><p role="status">正在加载管理设置…</p></section>';
export function ownerAccountDialog(account) {
  modal(
    '修改顶级管理员登录资料',
    `<p>本系统只有一个顶级管理员。修改后全部登录会失效，请重新登录。</p><form id="owner-account-form">${field('登录账号', 'username', 'text', account.username, 'required minlength="3" maxlength="32"')}${field('新密码（留空不变）', 'password', 'password', '', 'minlength="8" maxlength="128" autocomplete="new-password"')}${field('当前密码', 'currentPassword', 'password', '', 'required autocomplete="current-password"')}${errorHTML}<button class="button" type="submit">保存并重新登录</button></form>`,
    (d) => {
      $('#owner-account-form', d).onsubmit = (e) =>
        formSubmit(e, async (f) => {
          await api('/api/admin/owner-account', 'PUT', f);
          location.assign('/login.html');
        });
    },
  );
}
export async function permissionDialog(account, refresh) {
  const catalog = await api('/api/admin/permissions');
  modal(
    '单账号功能授权 · ' + account.name,
    `<p class="muted">沿用角色默认权限，也可单独允许 / 禁止。账号管理、交互开关与模型配置始终由唯一顶级管理员维护。点击确认修改后生效，并撤销该账号当前登录。</p><form id="permission-form"><div class="permission-grid">${Object.entries(
      catalog.features,
    )
      .filter(([key]) => !['administrators', 'features', 'ai-settings', 'map-config'].includes(key))
      .map(
        ([key, label]) =>
          `<fieldset><legend>${esc(label)}</legend>${['read', 'write']
            .map((mode) => {
              const k = key + '.' + mode,
                v = account.permissionOverrides?.[k];
              return `<label>${mode === 'read' ? '查看' : '修改'}<select name="${k}"><option value="inherit" ${v === undefined ? 'selected' : ''}>沿用角色</option><option value="true" ${v === true ? 'selected' : ''}>允许</option><option value="false" ${v === false ? 'selected' : ''}>禁止</option></select></label>`;
            })
            .join('')}</fieldset>`,
      )
      .join(
        '',
      )}</div>${errorHTML}<div class="confirm-toolbar"><button class="button" type="submit">确认修改</button></div></form>`,
    (d) => {
      $('#permission-form', d).onsubmit = (e) =>
        formSubmit(e, async (f) => {
          const overrides = {};
          Object.entries(f).forEach(([k, v]) => {
            if (v !== 'inherit') overrides[k] = v === 'true';
          });
          await api('/api/admin/admins/' + account.id, 'PATCH', {
            permissionRevision: account.permissionRevision || 0,
            permissionOverrides: overrides,
          });
          closeModal();
          await refresh();
          toast('功能授权已更新');
        });
    },
  );
}
export async function bindRelease70({ state }) {
  const host = $('#release70-host');
  if (!host) return;
  try {
    const page = state.page;
    if (page === 'features') {
      const data = await api('/api/admin/features');
      if (!host.isConnected) return;
      host.innerHTML = `<h2>交互功能与入口</h2><p class="muted">“开放”控制接口可用性；“显示入口”控制网页和小程序入口。隐藏入口不会删除已有内容。各端刷新后读取配置。</p><form id="features-form"><div class="permission-grid">${Object.entries(
        data.labels,
      )
        .map(
          ([key, label]) =>
            `<fieldset><legend>${esc(label)}</legend><label><input type="checkbox" name="${key}:enabled" ${data.features[key].enabled ? 'checked' : ''}>开放功能</label><label><input type="checkbox" name="${key}:visible" ${data.features[key].visible ? 'checked' : ''}>显示入口</label></fieldset>`,
        )
        .join(
          '',
        )}</div>${errorHTML}<div class="confirm-toolbar"><button class="button" type="submit">确认修改</button></div></form>`;
      $('#features-form', host).onsubmit = (e) =>
        formSubmit(e, async () => {
          const values = {};
          for (const key of Object.keys(data.labels)) {
            values[key] = {};
            for (const mode of ['enabled', 'visible'])
              values[key][mode] = $(`[name="${key}:${mode}"]`, host).checked;
          }
          await api('/api/admin/features', 'PUT', { revision: data.revision, features: values });
          toast('功能设置已保存');
          await bindRelease70({ state });
        });
      return;
    }
    if (page === 'ai-settings') {
      const data = await api('/api/admin/ai-settings');
      if (!host.isConnected) return;
      host.innerHTML = `<h2>模型与AI客服配置</h2><p class="muted">兼容 Chat Completions 接口；自然语言检索和客服共用公开知识库。模型不可用时返回资料检索，密钥不回显。入口开关在“交互功能与入口”管理。</p><form id="ai-settings-form">${field('接口基础地址', 'base', 'url', data.base, 'placeholder="https://example.com/v1" maxlength="500"')}${field('模型名称', 'model', 'text', data.model, 'maxlength="150"')}${field(data.keyConfigured ? 'API Key 已配置（留空保持）' : 'API Key', 'key', 'password', '', 'autocomplete="new-password" maxlength="1000"')}<label><input type="checkbox" name="clearKey">清除已保存密钥</label>${field('当前顶级管理员密码', 'currentPassword', 'password', '', 'required autocomplete="current-password"')}${errorHTML}<button class="button" type="submit">保存受保护配置</button></form>`;
      $('#ai-settings-form', host).onsubmit = (e) =>
        formSubmit(e, async (f) => {
          await api('/api/admin/ai-settings', 'PUT', {
            ...f,
            clearKey: $('[name="clearKey"]', host).checked,
            revision: data.revision,
          });
          toast('模型配置已保存');
          await bindRelease70({ state });
        });
      return;
    }
    const data = await api('/api/admin/topics');
    if (!host.isConnected) return;
    host.innerHTML = `<div class="section-heading"><h2>季节与活动专题</h2><button id="new-topic" class="button">新增专题</button></div><p class="muted">按北京时间设置活动范围，关联公开地点与护照印章。专题统计只计算活动期间的本人真实打卡。</p><div class="stack">${data.items.map((t) => `<article class="review-card"><span class="pill">${t.published ? '已发布' : '草稿'}</span><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p><small>${new Date(t.startsAt).toLocaleString()} — ${new Date(t.endsAt).toLocaleString()}</small><button class="button secondary" data-edit-topic="${t.id}">编辑 / 下线 / 删除</button></article>`).join('') || '<p>还没有专题。</p>'}</div>`;
    const local = (v) =>
      v
        ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : '';
    const edit = (old) =>
      modal(
        old ? '编辑专题' : '新增专题',
        `<form id="topic-form">${field('标题', 'title', 'text', old?.title || '', 'required maxlength="80"')}<label>说明<textarea name="description" maxlength="2000">${esc(old?.description || '')}</textarea></label><label>类型<select name="theme">${Object.entries(
          {
            spring: '樱花季',
            graduation: '毕业季',
            autumn: '秋色',
            night: '夜景',
            other: '其他活动',
          },
        )
          .map(
            ([key, label]) =>
              `<option value="${key}" ${old?.theme === key ? 'selected' : ''}>${label}</option>`,
          )
          .join(
            '',
          )}</select></label>${field('开始时间', 'startsAt', 'datetime-local', local(old?.startsAt), 'required')}${field('结束时间', 'endsAt', 'datetime-local', local(old?.endsAt), 'required')}<label>关联地点（多选；未选表示不限地点）<select name="pointIds" multiple size="6">${state.data.points.map((p) => `<option value="${esc(p.id)}" ${old?.pointIds.includes(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>关联护照印章（多选）<select name="ruleIds" multiple size="5">${data.rules.map((r) => `<option value="${r.id}" ${old?.ruleIds.includes(r.id) ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select></label><label><input name="published" type="checkbox" ${old?.published ? 'checked' : ''}>发布</label>${errorHTML}<div class="button-row"><button class="button" type="submit">保存专题</button>${old ? '<button class="button danger" type="button" id="delete-topic">删除专题</button>' : ''}</div></form>`,
        (d) => {
          const form = $('#topic-form', d);
          form.onsubmit = (e) =>
            formSubmit(e, async (f) => {
              const fd = new FormData(form);
              await api('/api/admin/topics' + (old ? '/' + old.id : ''), old ? 'PUT' : 'POST', {
                title: f.title,
                description: f.description,
                theme: f.theme,
                startsAt: new Date(f.startsAt).toISOString(),
                endsAt: new Date(f.endsAt).toISOString(),
                pointIds: fd.getAll('pointIds'),
                ruleIds: fd.getAll('ruleIds'),
                published: $('[name="published"]', form).checked,
                ...(old ? { revision: old.revision } : {}),
              });
              closeModal();
              await bindRelease70({ state });
              toast('专题已保存');
            });
          $('#delete-topic', d)?.addEventListener('click', () => {
            modal(
              '确认删除专题？',
              `<p>删除后停止展示，保留原打卡和护照。</p><form id="topic-delete">${errorHTML}<button class="button danger">确认删除</button></form>`,
              (next) => {
                $('#topic-delete', next).onsubmit = (e) =>
                  formSubmit(e, async () => {
                    await api('/api/admin/topics/' + old.id, 'DELETE', { revision: old.revision });
                    closeModal();
                    await bindRelease70({ state });
                  });
              },
            );
          });
        },
      );
    $('#new-topic', host).onclick = () => edit(null);
    host
      .querySelectorAll('[data-edit-topic]')
      .forEach(
        (b) => (b.onclick = () => edit(data.items.find((t) => t.id === b.dataset.editTopic))),
      );
  } catch (e) {
    if (host.isConnected)
      host.innerHTML = `<p role="alert">${esc(e.message)}</p><button id="v7-retry" class="button">重试</button>`;
    $('#v7-retry', host)?.addEventListener('click', () => bindRelease70({ state }));
  }
}
