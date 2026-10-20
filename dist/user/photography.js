import { mountPlanExecution } from './plan-execution.js';
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
      await mountPlanExecution({ root, state, requireAccount, alive });
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
