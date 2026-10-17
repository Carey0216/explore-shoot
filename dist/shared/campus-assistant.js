import { $, api, esc, modal } from '/shared/ui.js';

import { featureVisible } from '/shared/features.js';
export function openCampusAssistant({ purpose = 'search' } = {}) {
  if (!featureVisible(purpose === 'support' ? 'support' : 'assistant')) return;
  const dialog = modal(
    '校园拍照助手',
    `<form id="campus-question"><label>想了解什么？<textarea name="question" maxlength="300" rows="3" required placeholder="例如：图书馆适合怎么拍？"></textarea></label><p class="tip">检索已发布的校园资料，回答附来源。未确认的机位和开放时间不会当作已知信息。</p><label class="assistant-choice"><input type="checkbox" name="generate" disabled> 使用模型整理回答</label><p class="muted" id="assistant-provider-note">正在读取模型配置状态…</p><button class="button" type="submit">查找资料</button><p class="form-error" role="alert"></p></form><section id="campus-answer" aria-live="polite"></section>`,
  );
  const form = $('#campus-question', dialog),
    result = $('#campus-answer', dialog);
  void api('/api/assistant/capabilities')
    .then((status) => {
      if (!dialog.isConnected) return;
      form.elements.generate.disabled = !status.generationAvailable;
      $('#assistant-provider-note', dialog).textContent = status.generationAvailable
        ? '勾选后会将问题及匹配的公开校园资料发送给已配置的模型服务；不会发送私人打卡或照片。'
        : '当前可使用本地资料检索，尚未配置生成模型。';
    })
    .catch(() => {
      if (dialog.isConnected)
        $('#assistant-provider-note', dialog).textContent =
          '暂时无法读取模型状态，可重试资料检索。';
    });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    $('.form-error', form).textContent = '';
    result.textContent = '正在查找校园资料…';
    try {
      const data = await api('/api/assistant/query', 'POST', {
        question: form.elements.question.value,
        generate: form.elements.generate.checked,
        purpose,
      });
      if (!dialog.isConnected) return;
      result.innerHTML = `<p class="pill">${data.mode === 'generated' ? 'AI依据资料整理' : '资料检索结果'}</p><p class="site-copy">${esc(data.answer)}</p>${data.notices.map((n) => `<p class="tip">${esc(n)}</p>`).join('')}${data.places.length ? `<h3>相关地点</h3><div class="chips">${data.places.map((p) => `<a class="chip" href="#place/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join('')}</div>` : ''}<h3>资料来源</h3>${data.sources.map((s) => `<article class="assistant-source"><strong>${esc(s.title)}</strong><p class="site-copy muted">${esc(s.excerpt)}</p>${s.path && /^#place\/[a-z0-9-]+$/.test(s.path) ? `<a href="${esc(s.path)}">查看地点</a>` : ''}${s.sourceUrl && /^https:\/\//.test(s.sourceUrl) ? `<a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">原始资料 ↗</a>` : ''}</article>`).join('') || '<p class="muted">暂无匹配的已发布资料。</p>'}`;
      for (const link of result.querySelectorAll('a[href^="#place/"]'))
        link.onclick = () => dialog.close();
    } catch (error) {
      if (dialog.isConnected) {
        result.textContent = '';
        $('.form-error', form).textContent = error.message;
      }
    } finally {
      button.disabled = false;
    }
  };
  return dialog;
}
