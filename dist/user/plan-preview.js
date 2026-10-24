import { $, api, esc, icon, toast } from '/shared/ui.js';
import { authURL } from '/shared/auth-routing.js';
import { floatingPanel } from '/shared/floating-panel.js';

export async function openPlanPreview(options = {}, account = null) {
  floatingPanel({
    title: '安排一次拍摄',
    anchor: options.anchor || document.activeElement,
    className: 'plan-composer-popover',
    body: `<form id="preview-request" class="preview-request"><label>想拍什么？<input name="question" maxlength="300" value="${esc(options.question || '')}" placeholder="例如：周末想拍图书馆与建筑线条"></label><label>留出多少时间<select name="budget">${[15, 20, 30, 45, 60, 90].map((n) => `<option value="${n}" ${n === Number(options.budget || 20) ? 'selected' : ''}>${n} 分钟</option>`).join('')}</select></label><button class="button" type="submit">${icon('camera')} 预览拍摄安排</button></form><div id="plan-preview-result" role="status"></div>`,
    mount(dialog, close) {
      let serial = 0;
      $('#preview-request', dialog).onsubmit = async (event) => {
        event.preventDefault();
        const stamp = ++serial,
          form = event.currentTarget,
          button = $('button[type="submit"]', form),
          result = $('#plan-preview-result', dialog);
        button.disabled = true;
        result.textContent = '正在按已发布机位安排…';
        try {
          const data = await api('/api/assistant/plan-preview', 'POST', {
            question: form.elements.question.value,
            budget: Number(form.elements.budget.value),
            ...(options.guideId ? { guideId: options.guideId } : {}),
          });
          if (!dialog.isConnected || stamp !== serial) return;
          result.innerHTML = `<section class="plan-preview"><p class="preview-label">预览 · 尚未保存</p><h3>${esc(data.plan.title)}</h3><p>${esc(data.notice)}</p><ol class="preview-stops">${data.plan.items.map((item, index) => `<li><span class="stop-number">${index + 1}</span><div><a href="#spot/${esc(item.spotId)}" data-preview-place>${esc(item.title)} ↗</a><p>${esc(item.composition)}</p><small>拍摄约 ${item.minutes} 分钟</small></div></li>`).join('')}</ol>${data.canSave ? `<p class="muted">预计约 ${data.schedule.estimatedMinutes} 分钟 · 含20%余量</p><p class="muted">${esc(data.schedule.estimateNotice)}</p>${account ? '<button class="button wide" id="confirm-preview-plan">确认加入我的清单</button>' : `<a class="button wide" href="${esc(authURL('user', 'login', '/' + location.hash))}" data-preview-place>登录后保存计划</a>`}` : '<a class="button secondary" href="#guides" data-preview-place>先看看校园拍摄指南</a>'}</section>`;
          result.querySelectorAll('[data-preview-place]').forEach((a) => (a.onclick = close));
          $('#confirm-preview-plan', dialog)?.addEventListener('click', async function () {
            this.disabled = true;
            try {
              await api('/api/my/plans', 'POST', {
                title: data.plan.title,
                items: data.plan.items.map(({ id, spotId, composition, done, minutes }) => ({
                  id,
                  spotId,
                  composition,
                  done,
                  minutes,
                })),
                departure: '',
                checklist: {},
              });
              if (!dialog.isConnected) return;
              close();
              toast('已保存到你的拍摄清单');
              location.hash = 'plans';
            } catch (error) {
              if (dialog.isConnected) {
                this.disabled = false;
                const p = document.createElement('p');
                p.className = 'form-error';
                p.textContent = error.message;
                result.append(p);
              }
            }
          });
        } catch (error) {
          if (dialog.isConnected && stamp === serial) result.textContent = error.message;
        } finally {
          if (dialog.isConnected) button.disabled = false;
        }
      };
      return () => {
        serial++;
      };
    },
  });
}
