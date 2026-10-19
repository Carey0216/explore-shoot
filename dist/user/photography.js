import { mountActivities } from './activities.js';
import { mountWorkflow, sharePlan, bindTopicReminders } from './workflow.js';
import { $, api, esc, toast, modal, closeModal, errorHTML, formSubmit } from '/shared/ui.js';
import { featureVisible } from '/shared/features.js';
export function experienceFields(value = {}) {
  return `<fieldset class="experience-fields" data-feature="experience"><legend>作品经验卡（选填，公开后可见）</legend><label>拍摄时间<input type="datetime-local" name="takenAt" value="${esc(value.takenAt ? new Date(new Date(value.takenAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')}"></label><label>设备<input name="device" maxlength="100" value="${esc(value.device || '')}" placeholder="例如手机型号 / 相机"></label><label>焦段<input name="focalLength" maxlength="50" value="${esc(value.focalLength || '')}" placeholder="例如等效 35mm"></label><label>拍摄心得<textarea name="tips" maxlength="1000">${esc(value.tips || '')}</textarea></label></fieldset>`;
}
export function experienceValue(fields) {
  if (!featureVisible('experience')) return {};
  return {
    takenAt: fields.takenAt ? new Date(fields.takenAt).toISOString() : '',
    device: fields.device || '',
    focalLength: fields.focalLength || '',
    tips: fields.tips || '',
  };
}
export function experienceHTML(value) {
  if (!value || !Object.keys(value).length) return '';
  return `<aside class="experience-card" data-feature="experience"><strong>拍摄经验</strong><p>${esc([value.takenAt ? new Date(value.takenAt).toLocaleString('zh-CN') : '', value.device, value.focalLength].filter(Boolean).join(' · '))}</p><p>${esc(value.tips || '')}</p><small>作者自填，仅供参考</small></aside>`;
}
export async function addToPlan(spot, requireAccount) {
  if (!(await requireAccount())) return;
  const data = await api('/api/my/plans');
  modal(
    '加入拍摄清单',
    `<form id="add-plan-form"><label>清单<select name="plan"><option value="">创建新清单</option>${data.items.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label><label>新清单名称<input name="title" maxlength="80" value="我的校园拍摄"></label><label>想拍的构图<textarea name="composition" maxlength="500" placeholder="例如从台阶右侧拍钟楼…"></textarea></label>${errorHTML}<button class="button" type="submit">加入</button></form>`,
    (d) => {
      $('#add-plan-form', d).onsubmit = (e) =>
        formSubmit(e, async (f) => {
          const old = data.items.find((p) => p.id === f.plan);
          const items = [
            ...(old?.items || []),
            { id: crypto.randomUUID(), spotId: spot.id, composition: f.composition, done: false },
          ];
          await api('/api/my/plans' + (old ? '/' + old.id : ''), old ? 'PUT' : 'POST', {
            title: old?.title || f.title,
            items,
            ...(old ? { revision: old.revision } : {}),
          });
          closeModal();
          toast('已加入拍摄清单');
        });
    },
  );
}
export function mountPhotography({ state, requireAccount }) {
  const root = $('#main');
  let disposed = false;
  const alive = () => !disposed && root.isConnected;
  const load = async () => {
    try {
      if (['collections', 'shared-plan'].includes(state.page)) {
        await mountWorkflow({ state, requireAccount, root, alive });
        return;
      }
      if (['topics', 'topic'].includes(state.page)) {
        await mountActivities({ root, state, alive, requireAccount });
        return;
      }
      if (!state.account) {
        root.innerHTML =
          '<h1>拍摄清单</h1><button class="button" id="plan-login">登录后创建</button>';
        $('#plan-login').onclick = requireAccount;
        return;
      }
      const data = await api('/api/my/plans');
      if (!alive()) return;
      root.innerHTML = `<a class="text-btn" href="#me">← 我的</a><div class="section-heading"><h1>拍摄清单</h1><button class="button" id="new-plan">新建清单</button></div><p class="muted">默认仅自己可见，主动分享可生成7天有效的可撤销快照。完成状态是拍摄计划的记录，不会自动获得护照印章。</p><div class="stack">${data.items.map((p) => `<article class="panel plan-card"><h2>${esc(p.title)}</h2><small>${p.items.filter((i) => i.done).length}/${p.items.length} 完成</small><div class="plan-items">${p.items.map((i, n) => `<div class="plan-item"><a href="#spot/${encodeURIComponent(i.spotId)}">${esc(i.title)}</a><label><input type="checkbox" data-plan="${p.id}" data-done="${n}" ${i.done ? 'checked' : ''}>已完成</label><p>${esc(i.composition)}</p><div class="button-row"><button class="text-btn" data-edit-item="${n}" data-plan="${p.id}">编辑构图</button><button class="button secondary small" aria-label="上移" data-move="${n}" data-delta="-1" data-plan="${p.id}" ${n === 0 ? 'disabled' : ''}>↑</button><button class="button secondary small" aria-label="下移" data-move="${n}" data-delta="1" data-plan="${p.id}" ${n === p.items.length - 1 ? 'disabled' : ''}>↓</button><button class="text-btn" data-remove-item="${n}" data-plan="${p.id}">移除</button></div></div>`).join('') || '<p>从真实机位详情加入想拍的机位。</p>'}</div><div class="button-row"><button class="text-btn" data-share-plan="${p.id}">分享计划</button><button class="text-btn" data-rename-plan="${p.id}">重命名</button><button class="text-btn" data-delete-plan="${p.id}">删除清单</button></div></article>`).join('') || '<p class="empty">还没有拍摄计划。</p>'}</div>`;
      root
        .querySelectorAll('[data-share-plan]')
        .forEach(
          (b) =>
            (b.onclick = () => sharePlan(data.items.find((p) => p.id === b.dataset.sharePlan))),
        );
      const save = async (p) => {
        await api('/api/my/plans/' + p.id, 'PUT', {
          title: p.title,
          revision: p.revision,
          items: p.items.map(({ id, spotId, composition, done }) => ({
            id,
            spotId,
            composition,
            done,
          })),
        });
        await load();
      };
      const textDialog = (title, value, max, work) =>
        modal(
          title,
          `<form id="plan-text"><label>${esc(title)}<textarea name="value" required maxlength="${max}">${esc(value)}</textarea></label>${errorHTML}<button class="button">保存</button></form>`,
          (d) => {
            $('#plan-text', d).onsubmit = (e) =>
              formSubmit(e, async (f) => {
                await work(f.value);
                closeModal();
                await load();
              });
          },
        );
      $('#new-plan').onclick = () =>
        textDialog('新清单名称', '校园拍摄', 80, (v) =>
          api('/api/my/plans', 'POST', { title: v, items: [] }),
        );
      root.querySelectorAll('[data-plan]').forEach((b) => {
        const p = data.items.find((p) => p.id === b.dataset.plan);
        b[b.type === 'checkbox' ? 'onchange' : 'onclick'] = async () => {
          try {
            if (b.dataset.editItem !== undefined) {
              const item = p.items[Number(b.dataset.editItem)];
              return textDialog('想拍的构图', item.composition, 500, (v) => {
                item.composition = v;
                return save(p);
              });
            }
            if (b.dataset.done !== undefined) p.items[Number(b.dataset.done)].done = b.checked;
            if (b.dataset.move !== undefined) {
              const a = +b.dataset.move,
                c = a + +b.dataset.delta;
              [p.items[a], p.items[c]] = [p.items[c], p.items[a]];
            }
            if (b.dataset.removeItem !== undefined) p.items.splice(+b.dataset.removeItem, 1);
            b.disabled = true;
            await save(p);
          } catch (e) {
            toast(e.message);
            await load();
          }
        };
      });
      root.querySelectorAll('[data-rename-plan]').forEach(
        (b) =>
          (b.onclick = () => {
            const p = data.items.find((p) => p.id === b.dataset.renamePlan);
            textDialog('清单名称', p.title, 80, (v) => {
              p.title = v;
              return save(p);
            });
          }),
      );
      root.querySelectorAll('[data-delete-plan]').forEach(
        (b) =>
          (b.onclick = () => {
            const p = data.items.find((p) => p.id === b.dataset.deletePlan);
            modal(
              '删除清单？',
              `<p>仅删除这份计划，打卡和照片会保留。</p><form id="delete-plan">${errorHTML}<button class="button danger">确认删除</button></form>`,
              (d) => {
                $('#delete-plan', d).onsubmit = (e) =>
                  formSubmit(e, async () => {
                    await api('/api/my/plans/' + p.id, 'DELETE', { revision: p.revision });
                    closeModal();
                    await load();
                  });
              },
            );
          }),
      );
    } catch (e) {
      if (alive()) {
        root.innerHTML = `<p role="alert">${esc(e.message)}</p><button id="photo-retry" class="button">重试</button>`;
        $('#photo-retry').onclick = load;
      }
    }
  };
  void load();
  return () => {
    disposed = true;
  };
}
