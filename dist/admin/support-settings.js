import { $, api, esc, toast, errorHTML } from '/shared/ui.js';
const destinations = {
  '': '不附入口',
  '#guides': '拍摄指南',
  '#discover': '发现首页',
  '#settings': '设置',
  '#contact': '联系管理员',
  '#publish': '发布发现',
  '#me': '我的',
  '#plans': '拍摄清单',
  '#passport': '校园护照',
  '#shots': '机位',
  '#notifications': '消息中心',
};
function row(p) {
  return `<fieldset class="support-preset-editor" data-preset-id="${esc(p.id)}"><legend>问题预设</legend><label>问题名称<input name="title" maxlength="50" required value="${esc(p.title)}"></label><label>匹配关键词<input name="keywords" maxlength="260" required value="${esc(p.keywords.join('、'))}" placeholder="用顿号分隔，例如：收藏、取消收藏"></label><label>直接回复<textarea name="answer" rows="4" maxlength="1200" required>${esc(p.answer)}</textarea></label><label>附带入口<select name="path">${Object.entries(
    destinations,
  )
    .map(
      ([path, name]) =>
        `<option value="${path}" ${path === p.path ? 'selected' : ''}>${name}</option>`,
    )
    .join(
      '',
    )}</select></label><button type="button" class="text-btn" data-remove-preset>移除此预设</button></fieldset>`;
}
export async function mountSupportSettings(parent) {
  const data = await api('/api/admin/support-settings');
  if (!parent.isConnected) return;
  const host = document.createElement('section');
  host.className = 'support-policy-editor';
  host.innerHTML = `<h2>校园助手 · 预设与进一步回答</h2><p class="muted">命中关键词时直接用预设回复；其余问题才尝试大模型。进一步回答按钮可关闭，关闭不影响预设帮助。</p><form id="support-policy-form"><label class="support-policy-toggle"><input name="furtherEnabled" type="checkbox" ${data.furtherEnabled ? 'checked' : ''}><span>显示“进一步回答”按钮</span></label><label>按钮中的模型称呼<input name="modelLabel" maxlength="30" required value="${esc(data.modelLabel)}" placeholder="例如：校园AI"></label><small>按钮显示为“使用校园AI进一步回答”，不会向用户展示密钥和接口地址。</small><div class="support-preset-editors">${data.presets.map(row).join('')}</div><button type="button" class="button secondary" id="support-preset-add">新增预设</button>${errorHTML}<p class="support-policy-status" role="status">尚未修改。</p><button class="button" type="submit">保存客服预设</button></form>`;
  parent.append(host);
  const form = $('#support-policy-form', host),
    list = $('.support-preset-editors', form),
    status = $('.support-policy-status', form);
  let revision = data.revision;
  form.addEventListener('input', () => (status.textContent = '有未保存的修改。'));
  list.onclick = (e) => {
    const b = e.target.closest('[data-remove-preset]');
    if (b) {
      b.closest('fieldset').remove();
      status.textContent = '有未保存的修改。';
    }
  };
  $('#support-preset-add', host).onclick = () => {
    if (list.children.length >= 20) {
      toast('最多保留20条预设');
      return;
    }
    list.insertAdjacentHTML(
      'beforeend',
      row({ id: crypto.randomUUID(), title: '', keywords: [], answer: '', path: '' }),
    );
    list.lastElementChild.querySelector('input').focus();
    status.textContent = '有未保存的修改。';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const presets = [...list.children].map((f) => ({
      id: f.dataset.presetId,
      title: $('[name="title"]', f).value.trim(),
      keywords: $('[name="keywords"]', f)
        .value.split(/[，,、\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      answer: $('[name="answer"]', f).value.trim(),
      path: $('[name="path"]', f).value,
    }));
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach((b) => (b.disabled = true));
    $('.form-error', form).textContent = '';
    status.textContent = '正在保存…';
    try {
      const result = await api('/api/admin/support-settings', 'PUT', {
        revision,
        presets,
        furtherEnabled: form.elements.furtherEnabled.checked,
        modelLabel: form.elements.modelLabel.value.trim(),
      });
      revision = result.revision;
      status.textContent = '已保存，用户下次打开助手时读取。';
      toast('客服预设已保存');
    } catch (error) {
      $('.form-error', form).textContent = error.message;
      status.textContent = '尚未保存，请核对后重试。';
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };
}
