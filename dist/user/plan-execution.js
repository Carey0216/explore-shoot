import { collectionEntry } from './collection-preview.js';
import { $, api, esc, icon, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
import { featureOn, featureVisible } from '/shared/features.js';
import { loadCampusWeather, weatherLine, weatherSymbol } from './photo-timing.js';
import { sharePlan } from './workflow.js';
import { openPlanPreview } from './plan-preview.js';
import { mountNextStop, replacePlanStop } from './plan-next.js';
export const departureChecks = {
  battery: '电量充足',
  storage: '存储空间够用',
  weather: '看过天气与光线',
  access: '确认开放与通行',
  gear: '带好需要的器材',
};
export function reorder(items, from, to) {
  const out = [...items];
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= out.length ||
    to >= out.length
  )
    return out;
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}
export function restorePlanDraft(plan, editable = {}) {
  const metadata = new Map(plan.items.map((i) => [i.id, i]));
  return {
    ...plan,
    title: editable.title ?? plan.title,
    departure: editable.departure ?? plan.departure,
    checklist: editable.checklist ?? plan.checklist,
    items: (editable.items || plan.items).map((i) => ({
      ...metadata.get(i.id),
      ...i,
      title: metadata.get(i.id)?.title || '待核对机位',
    })),
  };
}
function localTime(value) {
  if (!value) return '';
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
    return parts.replace(' ', 'T');
  } catch {
    return '';
  }
}
const safeItems = (p) =>
  p.items.map(({ id, spotId, composition, done, minutes = 5 }) => ({
    id,
    spotId,
    composition,
    done,
    minutes,
  }));
const draftKey = (owner, id) => 'explore-plan-v72:' + owner + ':' + id;
export async function mountPlanExecution({ root, state, requireAccount, alive }) {
  if (!state.account) {
    root.innerHTML =
      '<h1>拍摄清单</h1><p class="muted">把想拍的角落安排进下一次出发。</p><button class="button" id="plan-login">登录后创建</button>';
    $('#plan-login', root).onclick = requireAccount;
    return;
  }
  const owner = state.account.id;
  let busy = false;
  const key = (p) => draftKey(owner, p.id);
  const draft = (p) => {
    try {
      localStorage.setItem(
        key(p),
        JSON.stringify({
          revision: p.revision,
          at: Date.now(),
          plan: {
            title: p.title,
            items: safeItems(p),
            departure: p.departure || '',
            checklist: p.checklist || {},
          },
        }),
      );
    } catch {
      toast('本机草稿未能保存，请保持页面打开');
    }
  };
  const load = async () => {
    const data = await api('/api/my/plans');
    if (!alive() || state.account?.id !== owner) return;
    for (const p of data.items)
      try {
        const saved = JSON.parse(localStorage.getItem(key(p)) || 'null');
        if (saved && Date.now() - saved.at < 7 * 86400000) {
          p.hasDraft = true;
          if (saved.revision === p.revision) {
            Object.assign(p, restorePlanDraft(p, saved.plan));
          } else p.staleDraft = true;
        }
      } catch {}
    root.innerHTML = `<a class="page-back" href="#me">‹ 返回我的</a><header class="plan-heading"><span class="eyebrow">下一次出发，从这里开始</span><h1>拍摄清单</h1><p>默认仅自己可见。计划勾选完成不会自动获得打卡印章。</p><div class="button-row"><button class="button" id="new-plan">${icon('plus')} 新建清单</button><button class="button secondary" id="preview-plan">帮我安排一次</button><a class="text-btn" href="#guides">拍摄指南 ↗</a></div></header>${collectionEntry()}<div class="plan-stack">${
      data.items
        .map(
          (p) =>
            `<article class="plan-execution" data-execution="${p.id}"><header><div><h2>${esc(p.title)}</h2><p>${p.items.filter((i) => i.done).length} / ${p.items.length} 已完成</p></div><button class="icon-btn" data-share-plan="${p.id}" aria-label="分享${esc(p.title)}">${icon('share')}</button></header>${p.hasDraft ? `<p class="plan-draft-notice">${p.staleDraft ? '另一设备已更新清单，本机旧草稿仍保留，可导出核对。' : '已恢复本机未保存安排，请核对后保存。'} <button class="text-btn" data-export-plan="${p.id}">导出本机草稿</button>${p.staleDraft ? `<button class="text-btn" data-discard-plan="${p.id}">使用账号最新版本</button>` : ''}</p>` : ''}<form class="plan-arrangement" data-plan-form="${p.id}"><section class="departure-summary81"><h3>出发准备卡</h3><p>${p.items.length} 个机位 · ${p.items.map((i) => esc(i.title)).join(' → ')}</p>${featureVisible('weather') ? '<p class="muted" data-departure-weather81>天气正在准备…</p>' : ''}<small>时间、开放检查与器材清单都在这张安排里。</small></section><label>出发时间 <small>北京时间</small><input type="datetime-local" name="departure" aria-label="${esc(p.title)}出发时间" value="${esc(localTime(p.departure))}"></label><ol class="execution-stops">${p.items.map((item, index) => `<li class="execution-stop" draggable="true" data-plan-item="${index}" data-plan-owner="${p.id}"><div class="execution-stop-head"><button class="drag-handle" data-no-liquid type="button" aria-label="拖动调整${esc(item.title)}顺序" data-drag-item="${index}">⠿</button><span class="stop-number">${index + 1}</span><a href="#spot/${esc(item.spotId)}">${esc(item.title)}</a><label class="completion-check"><input type="checkbox" data-done="${index}" ${item.done ? 'checked' : ''}><span class="sr-only">${esc(item.title)}计划已完成</span></label></div><p>${esc(item.composition || '还没写构图想法，出发前加一句吧。')}</p><div class="execution-item-actions"><label>停留 <input type="number" inputmode="numeric" min="1" max="60" value="${Number(item.minutes || 5)}" data-minutes="${index}" aria-label="${esc(item.title)}停留分钟"> 分钟</label><button type="button" class="icon-btn" data-plan-move="${index}" data-delta="-1" aria-label="上移${esc(item.title)}" ${index ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn" data-plan-move="${index}" data-delta="1" aria-label="下移${esc(item.title)}" ${index === p.items.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="text-btn" data-edit-composition="${index}">构图</button><button type="button" class="text-btn" data-remove-item="${index}">移除</button></div></li>`).join('') || '<li class="plan-empty">从真实机位详情加入想拍的地点，或使用拍摄计划预览。</li>'}</ol><details class="departure-checks" ${p.items.length ? 'open' : ''}><summary>出发前，检查一下</summary><div>${Object.entries(
              departureChecks,
            )
              .map(
                ([id, label]) =>
                  `<label><input type="checkbox" name="${id}" ${p.checklist?.[id] ? 'checked' : ''}>${label}</label>`,
              )
              .join(
                '',
              )}</div></details><div class="schedule-result"><strong>行程检查</strong><p>${p.departure ? '已按保存的出发时间检查' : '设置出发时间后，可检查预计到达是否赶得上开放时段。'}</p>${(p.schedule?.warnings || []).map((w) => `<p class="schedule-${w.level}">${esc(w.message)}</p>`).join('')}${p.schedule?.stops
              ?.filter((s) => s.arrival)
              .map(
                (s) =>
                  `<p class="arrival-row"><span>${esc(s.title)}</span><time>${esc(localTime(s.arrival).replace('T', ' '))}</time></p>`,
              )
              .join(
                '',
              )}<small>${esc(p.schedule?.estimateNotice || '')}</small></div><div class="plan-save-row"><button class="button" type="submit" ${p.staleDraft ? 'disabled' : ''}>保存安排</button><span role="status" data-plan-status>${p.hasDraft ? '有本机草稿待核对' : '已保存到账号'}</span></div></form><footer><button class="text-btn" data-rename-plan="${p.id}">重命名</button><button class="text-btn" data-delete-plan="${p.id}">删除清单</button></footer></article>`,
        )
        .join('') ||
      '<div class="guide-empty"><span>' +
        icon('camera') +
        '</span><h2>先挑一个想拍的角落</h2><p>浏览真实机位，加入清单，再安排出发时间。</p><a class="button secondary" href="#shots">去找机位</a></div>'
    }</div>`;
    if (featureVisible('weather') && featureOn('weather'))
      void loadCampusWeather()
        .then((w) => {
          if (alive())
            root
              .querySelectorAll('[data-departure-weather81]')
              .forEach(
                (el) =>
                  (el.textContent = w.available
                    ? weatherSymbol(w.code) + ' ' + w.label + ' · ' + weatherLine(w)
                    : '天气暂不可用，请出发前再次确认'),
              );
        })
        .catch(() => {
          if (alive())
            root
              .querySelectorAll('[data-departure-weather81]')
              .forEach((el) => (el.textContent = '天气暂不可用，可保留清单稍后重试'));
        });
    $('#preview-plan', root).onclick = () => openPlanPreview({}, state.account);
    $('#new-plan', root).onclick = () =>
      textDialog('新清单名称', '校园拍摄', 80, async (value) => {
        await api('/api/my/plans', 'POST', { title: value, items: [] });
      });
    const collect = (p) => {
      const form = root.querySelector(`[data-plan-form="${p.id}"]`);
      if (!form) return;
      const value = form.elements.departure.value;
      p.departure = value ? new Date(value + ':00+08:00').toISOString() : '';
      p.checklist = Object.fromEntries(
        Object.keys(departureChecks).map((id) => [id, form.elements[id].checked]),
      );
      p.items.forEach((item, i) => {
        item.minutes = Number(form.querySelector(`[data-minutes="${i}"]`)?.value || 5);
        item.done = !!form.querySelector(`[data-done="${i}"]`)?.checked;
      });
    };
    const save = async (p) => {
      if (busy) return false;
      busy = true;
      const form = root.querySelector(`[data-plan-form="${p.id}"]`),
        status = $('[data-plan-status]', form);
      status.textContent = '正在保存…';
      form.setAttribute('aria-busy', 'true');
      draft(p);
      try {
        await api('/api/my/plans/' + p.id, 'PUT', {
          title: p.title,
          revision: p.revision,
          items: safeItems(p),
          departure: p.departure || '',
          checklist: p.checklist || {},
        });
        try {
          localStorage.removeItem(key(p));
        } catch {}
        if (alive()) await load();
        return true;
      } catch (error) {
        if (alive()) {
          status.textContent = error.message + ' · 未保存安排已留在本机';
          toast(error.message);
        }
        return false;
      } finally {
        busy = false;
        if (form.isConnected) form.removeAttribute('aria-busy');
      }
    };
    function textDialog(title, value, max, work) {
      modal(
        title,
        `<form id="execution-text"><label>${esc(title)}<textarea name="value" maxlength="${max}" required>${esc(value)}</textarea></label>${errorHTML}<button class="button" type="submit">保存</button></form>`,
        (d) => {
          $('#execution-text', d).onsubmit = (e) =>
            formSubmit(e, async (f) => {
              await work(f.value);
              closeModal();
              if (alive()) await load();
            });
        },
      );
    }
    for (const p of data.items) {
      const form = root.querySelector(`[data-plan-form="${p.id}"]`);
      const next = document.createElement('section');
      next.className = 'next-stop813';
      form.prepend(next);
      void mountNextStop(next, p, alive);
      form.querySelectorAll('[data-remove-item]').forEach((b) => {
        const swap = document.createElement('button');
        swap.type = 'button';
        swap.className = 'text-btn';
        swap.textContent = '换一站';
        swap.onclick = () => {
          if (busy || p.staleDraft) return;
          collect(p);
          replacePlanStop(p, Number(b.dataset.removeItem), state.catalog.points, save);
        };
        b.before(swap);
      });
      if (p.hasDraft)
        $('.schedule-result', form).innerHTML =
          '<strong>本机安排待保存</strong><p>保存后重新检查到达时间与开放冲突。</p>';
      if (p.staleDraft) form.inert = true;
      form.oninput = () => {
        collect(p);
        draft(p);
        $('[data-plan-status]', form).textContent = '未保存 · 本机草稿已保留';
        $('.schedule-result', form).innerHTML =
          '<strong>安排尚未保存</strong><p>保存后重新检查到达时间与开放冲突。</p>';
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        if (!form.reportValidity() || p.staleDraft) return;
        collect(p);
        void save(p);
      };
      const move = async (from, to) => {
        if (busy || p.staleDraft) return;
        collect(p);
        p.items = reorder(p.items, from, to);
        await save(p);
      };
      form
        .querySelectorAll('[data-plan-move]')
        .forEach(
          (b) =>
            (b.onclick = () =>
              void move(
                Number(b.dataset.planMove),
                Number(b.dataset.planMove) + Number(b.dataset.delta),
              )),
        );
      form.querySelectorAll('[data-remove-item]').forEach(
        (b) =>
          (b.onclick = () => {
            if (busy) return;
            collect(p);
            p.items.splice(Number(b.dataset.removeItem), 1);
            void save(p);
          }),
      );
      form.querySelectorAll('[data-edit-composition]').forEach(
        (b) =>
          (b.onclick = () => {
            collect(p);
            const item = p.items[Number(b.dataset.editComposition)];
            textDialog('想拍的构图', item.composition || '', 500, async (value) => {
              item.composition = value;
              await save(p);
            });
          }),
      );
      let dragFrom = null;
      form.querySelectorAll('[data-plan-item]').forEach((item) => {
        item.ondragstart = (e) => {
          if (busy || p.staleDraft) {
            e.preventDefault();
            return;
          }
          dragFrom = Number(item.dataset.planItem);
          e.dataTransfer.setData('text/plain', p.id);
          e.dataTransfer.effectAllowed = 'move';
          item.classList.add('dragging');
        };
        item.ondragend = () => {
          dragFrom = null;
          item.classList.remove('dragging');
        };
        item.ondragover = (e) => e.preventDefault();
        item.ondrop = (e) => {
          e.preventDefault();
          if (e.dataTransfer.getData('text/plain') === p.id && dragFrom !== null)
            void move(dragFrom, Number(item.dataset.planItem));
        };
      });
      form.querySelectorAll('[data-drag-item]').forEach((handle) => {
        let start = null;
        handle.onpointerdown = (e) => {
          if (busy || p.staleDraft) return;
          e.preventDefault();
          e.stopPropagation();
          handle.closest('[data-plan-item]').classList.add('dragging');
          start = { y: e.clientY, index: Number(handle.dataset.dragItem) };
          handle.setPointerCapture(e.pointerId);
        };
        handle.onpointerup = (e) => {
          handle.closest('[data-plan-item]').classList.remove('dragging');
          if (!start) return;
          const source = start;
          start = null;
          if (Math.abs(e.clientY - source.y) < 12) return;
          const target = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest('[data-plan-item]');
          if (target?.dataset.planOwner === p.id)
            void move(source.index, Number(target.dataset.planItem));
        };
        handle.onpointercancel = () => {
          handle.closest('[data-plan-item]').classList.remove('dragging');
          start = null;
        };
      });
    }
    root
      .querySelectorAll('[data-share-plan]')
      .forEach(
        (b) => (b.onclick = () => sharePlan(data.items.find((p) => p.id === b.dataset.sharePlan))),
      );
    root.querySelectorAll('[data-rename-plan]').forEach(
      (b) =>
        (b.onclick = () => {
          const p = data.items.find((p) => p.id === b.dataset.renamePlan);
          textDialog('清单名称', p.title, 80, async (value) => {
            p.title = value;
            collect(p);
            await save(p);
          });
        }),
    );
    root.querySelectorAll('[data-export-plan]').forEach(
      (b) =>
        (b.onclick = () => {
          try {
            const content = localStorage.getItem(draftKey(owner, b.dataset.exportPlan));
            if (!content) return;
            const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = '拍摄清单草稿.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch {
            toast('无法导出本机草稿');
          }
        }),
    );
    root.querySelectorAll('[data-discard-plan]').forEach(
      (b) =>
        (b.onclick = () => {
          try {
            localStorage.removeItem(draftKey(owner, b.dataset.discardPlan));
          } catch {}
          void load();
        }),
    );
    root.querySelectorAll('[data-delete-plan]').forEach(
      (b) =>
        (b.onclick = () => {
          const p = data.items.find((p) => p.id === b.dataset.deletePlan);
          modal(
            '删除这份清单？',
            `<p>仅删除这份计划，打卡和照片会保留；已有分享链接将失效。</p><form id="delete-execution">${errorHTML}<button class="button danger">确认删除清单</button></form>`,
            (d) => {
              $('#delete-execution', d).onsubmit = (e) =>
                formSubmit(e, async () => {
                  await api('/api/my/plans/' + p.id, 'DELETE', { revision: p.revision });
                  try {
                    localStorage.removeItem(key(p));
                  } catch {}
                  closeModal();
                  await load();
                });
            },
          );
        }),
    );
  };
  await load();
}
