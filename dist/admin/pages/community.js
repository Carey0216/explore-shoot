import {
  $,
  thumbnail,
  api,
  esc,
  date,
  toast,
  modal,
  closeModal,
  formSubmit,
  field,
  errorHTML,
  readPhoto,
  uploadPhoto,
  releaseDraftUpload,
} from '/shared/ui.js';
import { conditionLabels } from '/shared/shooting-conditions.js';
import { pointEditMapHTML, setupPointEditMap } from '../point-map.js';
const statusText = {
  draft: '草稿',
  pending: '待审核',
  published: '已发布',
  rejected: '未通过',
  approved: '已公开',
  withdrawn: '已撤回',
  hidden: '已隐藏',
  resolved: '已处理',
};
export function createCommunityPages({ state, table, refresh, pointName }) {
  const matching = (rows) =>
    rows.filter(
      (x) =>
        !state.query ||
        [x.title, x.caption, x.description, x.authorName, pointName(x.pointId)]
          .join(' ')
          .includes(state.query),
    );
  function shootingSpots() {
    const rows = matching(state.data.shootingSpots || []);
    return `<div class="toolbar"><input id="table-search" aria-label="搜索真实机位" placeholder="搜索机位或所属地点" value="${esc(state.query)}"><button class="button" id="new-shooting-spot">新增真实机位</button></div><p class="muted">只填写核实过的站位；旧拍摄建议不会自动转换成真实机位。</p><section class="panel">${table(
      ['机位 / 地点', '站位与朝向', '适合时间', '状态', '操作'],
      rows.map(
        (s) =>
          `<tr><td><strong>${esc(s.title)}</strong><small>${esc(pointName(s.pointId))}</small></td><td>${esc(s.standDescription)}<small>${s.lng}, ${s.lat} · ${s.bearing}°</small></td><td>${esc(s.bestTime)}</td><td>${statusText[s.status] || ''}</td><td><button class="button secondary small" data-edit-spot="${s.id}">编辑机位</button></td></tr>`,
      ),
    )}</section>`;
  }
  function editSpot(s = null) {
    let uploaded = null,
      saved = false,
      photoData = null;
    const initial = state.data.points.find((p) => p.id === s?.pointId) || state.data.points[0];
    modal(
      s ? '编辑真实机位' : '新增真实机位',
      `<form id="spot-edit-form"><label>所属地点<select name="pointId" required ${s ? 'disabled' : ''}><option value="">请选择地点</option>${state.data.points.map((p) => `<option value="${esc(p.id)}" ${s?.pointId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>${field('机位名称', 'title', 'text', s?.title || '', 'required maxlength="80"')}<label>站位说明<textarea name="standDescription" required maxlength="1000" placeholder="说明站在哪条步道、哪侧台阶或哪处公共区域">${esc(s?.standDescription || '')}</textarea></label><div class="form-grid">${field('经度（WGS84）', 'lng', 'number', s?.lng ?? '', 'required step="any"')}${field('纬度（WGS84）', 'lat', 'number', s?.lat ?? '', 'required step="any"')}</div>${pointEditMapHTML()}${field('拍摄朝向（度）', 'bearing', 'number', s?.bearing ?? '', 'required min="0" max="359.99" step="any"')}<p class="muted">正北0°、正东90°、正南180°、正西270°。</p>${field('建议镜头距地高度（米，可留空）', 'heightMeters', 'number', s?.heightMeters ?? '', 'min="0.3" max="3" step="0.1"')}${field('拍摄高度补充说明', 'heightAdvice', 'text', s?.heightAdvice || '', 'maxlength="120"')}${field('适合的时间', 'bestTime', 'text', s?.bestTime || '', 'required maxlength="200"')}<fieldset class="condition-editor"><legend>拍照条件</legend>${Object.entries(
        conditionLabels,
      )
        .map(
          ([id, text]) =>
            `<label><input type="checkbox" name="condition" value="${id}" ${(s?.conditions || []).includes(id) ? 'checked' : ''}>${text}</label>`,
        )
        .join(
          '',
        )}</fieldset><label>现场构图练习（选填）<textarea name="compositionTip" maxlength="500" placeholder="写一条可在此站位直接照做的手机拍摄建议">${esc(s?.compositionTip || '')}</textarea></label>${field('最近实地核验日期', 'verifiedAt', 'date', s?.verifiedAt || '')}<label>可计算开放时段（选填）<textarea name="openingWindows" rows="3" placeholder="1,2,3,4,5 08:00-18:00">${esc((s?.openingWindows || []).map((w) => w.days.join(',') + ' ' + w.start + '-' + w.end).join('\n'))}</textarea><small>每行一组：星期数字（1周一至7周日） 开始-结束；支持跨午夜，留空则只提示用户核对。</small></label>${field('开放时间', 'openingHours', 'text', s?.openingHours || '', 'maxlength="300"')}<label>当前通行状态<select name="availability">${[
        ['unknown', '待确认'],
        ['open', '正常开放'],
        ['limited', '通行受限'],
        ['closed', '临时关闭'],
      ]
        .map(
          ([id, text]) =>
            `<option value="${id}" ${(s?.availability || 'unknown') === id ? 'selected' : ''}>${text}</option>`,
        )
        .join(
          '',
        )}</select></label><label>施工 / 入口变化提醒<textarea name="accessNotice" maxlength="1000">${esc(s?.accessNotice || '')}</textarea></label><div class="community-example"><img id="spot-example-preview" ${s?.photo ? `src="${esc(s.photo)}"` : 'hidden'} alt="机位示例照片"><div class="button-row"><label class="button secondary file-button">选择示例照片<input type="file" id="spot-example-file" accept="image/*" aria-label="选择机位示例照片"></label><button type="button" class="text-btn" id="spot-example-remove">移除示例照片</button></div><p class="muted">使用你有权公开的照片，发布机位后展示。</p></div><label>展示状态<select name="status">${['draft', 'pending', 'published', 'rejected'].map((k) => `<option value="${k}" ${(s?.status || 'draft') === k ? 'selected' : ''}>${statusText[k]}</option>`).join('')}</select></label>${errorHTML}<button class="button wide" type="submit">保存机位</button></form>`,
      (d) => {
        const form = $('#spot-edit-form', d),
          picker = setupPointEditMap(d, form, s ? { ...s, name: s.title } : initial);
        let mediaId = s?.exampleMediaId || null;
        const file = $('#spot-example-file', d);
        file.onchange = async () => {
          if (!file.files?.[0]) return;
          try {
            const data = await readPhoto(file.files[0]);
            if (!d.isConnected) return;
            photoData = data;
            if (uploaded) void releaseDraftUpload(uploaded);
            uploaded = null;
            const img = $('#spot-example-preview', d);
            img.src = data;
            img.hidden = false;
          } catch (e) {
            if (d.isConnected) toast(e.message);
          }
        };
        $('#spot-example-remove', d).onclick = () => {
          if (uploaded) void releaseDraftUpload(uploaded);
          uploaded = null;
          photoData = null;
          mediaId = null;
          $('#spot-example-preview', d).hidden = true;
        };
        form.onsubmit = (e) =>
          formSubmit(e, async (f) => {
            picker.validate();
            if (photoData && !uploaded) {
              file.disabled = true;
              $('#spot-example-remove', d).disabled = true;
              try {
                uploaded = await uploadPhoto(photoData);
                mediaId = uploaded.id;
              } finally {
                if (d.isConnected) {
                  file.disabled = false;
                  $('#spot-example-remove', d).disabled = false;
                }
              }
            }
            if (!d.isConnected) {
              if (uploaded) void releaseDraftUpload(uploaded);
              throw Error('页面已关闭，请重新编辑机位');
            }
            await api('/api/admin/shooting-spots' + (s ? '/' + s.id : ''), s ? 'PATCH' : 'POST', {
              pointId: s?.pointId || f.pointId,
              title: f.title,
              standDescription: f.standDescription,
              lng: Number(f.lng),
              lat: Number(f.lat),
              bearing: Number(f.bearing),
              heightMeters: f.heightMeters ? Number(f.heightMeters) : null,
              heightAdvice: f.heightAdvice,
              bestTime: f.bestTime,
              compositionTip: f.compositionTip,
              verifiedAt: f.verifiedAt,
              openingWindows: f.openingWindows.trim()
                ? f.openingWindows
                    .trim()
                    .split('\n')
                    .map((line) => {
                      const m = /^([1-7](?:,[1-7])*)\s+([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/.exec(
                        line.trim(),
                      );
                      if (!m) throw Error('开放时段格式：1,2,3 08:00-18:00');
                      return { days: m[1].split(',').map(Number), start: m[2], end: m[3] };
                    })
                : [],
              conditions: new FormData(form).getAll('condition'),
              openingHours: f.openingHours,
              availability: f.availability,
              accessNotice: f.accessNotice,
              exampleMediaId: mediaId,
              status: f.status,
              ...(s ? { revision: s.revision } : {}),
            });
            saved = true;
            closeModal();
            await refresh();
            toast('真实机位已保存');
          });
        return () => {
          picker.destroy();
          if (uploaded && !saved) void releaseDraftUpload(uploaded);
        };
      },
    );
  }
  function works() {
    const rows = matching(state.data.works || []).filter(
      (w) => state.filter === 'all' || w.status === 'pending',
    );
    return `<div class="toolbar"><input id="table-search" aria-label="搜索打卡作品" placeholder="搜索作品配文、作者或地点" value="${esc(state.query)}"><div class="button-row"><button class="button secondary" data-filter="pending">待审核</button><button class="button secondary" data-filter="all">全部记录</button></div></div><p class="muted">仅审核用户主动提交的照片和配文，不能查看私人打卡感受或定位。</p><div class="admin-work-grid">${
      rows
        .slice()
        .reverse()
        .map(
          (w) =>
            `<article class="review-card admin-work-card">${w.photo ? `<a href="${esc(w.photo)}" target="_blank" rel="noopener"><img src="${esc(thumbnail(w.photo))}" alt="待审核打卡作品" loading="lazy" decoding="async"></a>` : ''}<span class="pill">${statusText[w.status] || ''}</span><h3>${esc(pointName(w.pointId))}</h3><p>${esc(state.data.shootingSpots.find((s) => s.id === w.spotId)?.title || '机位已移除')}</p><p>${esc(w.caption || '')}</p><small>${esc(w.authorName)} · ${date(w.createdAt)}</small>${w.reviewNote ? `<p class="notice">${esc(w.reviewNote)}</p>` : ''}<div class="button-row">${w.status === 'pending' ? `<button class="button small" data-review-work="${w.id}" data-status="approved">通过公开</button><button class="button secondary small" data-review-work="${w.id}" data-status="rejected">不予通过</button>` : w.status === 'approved' ? `<button class="button secondary small" data-review-work="${w.id}" data-status="hidden">隐藏作品</button>` : ''}</div></article>`,
        )
        .join('') || '<p class="empty">没有符合条件的作品。</p>'
    }</div>`;
  }
  function reviewWork(w, status) {
    modal(
      '作品审核',
      `<p class="muted">${esc(statusText[status])}</p><form id="work-review-form"><label>审核说明<textarea name="note" maxlength="1000" placeholder="这段说明会发送给作品作者"></textarea></label>${errorHTML}<button class="button wide" type="submit">确认审核</button></form>`,
      (d) => {
        $('#work-review-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/works/' + w.id, 'PATCH', {
              status,
              note: f.note,
              revision: w.revision,
            });
            closeModal();
            await refresh();
            toast('审核结果已发送站内通知');
          });
      },
    );
  }
  function workReports() {
    const rows = matching(state.data.workReports || []).filter(
      (r) => state.filter === 'all' || r.status === 'pending',
    );
    return `<div class="toolbar"><input id="table-search" aria-label="搜索作品举报" placeholder="搜索举报说明或地点" value="${esc(state.query)}"><div class="button-row"><button class="button secondary" data-filter="pending">待处理</button><button class="button secondary" data-filter="all">全部记录</button></div></div><div class="stack">${
      rows
        .slice()
        .reverse()
        .map(
          (r) =>
            `<article class="review-card"><h3>${esc(pointName(r.pointId))}</h3><span class="pill">${statusText[r.status] || ''}</span><p>${esc(r.description)}</p>${r.note ? `<p class="notice">${esc(r.note)}</p>` : ''}${r.status === 'pending' ? `<button class="button secondary" data-review-work-report="${r.id}">处理作品举报</button>` : ''}</article>`,
        )
        .join('') || '<p class="empty">暂无作品举报。</p>'
    }</div>`;
  }
  function reviewReport(r) {
    modal(
      '处理作品举报',
      `<p>${esc(r.description)}</p><form id="wall-report-form"><label>处理方式<select name="action"><option value="hide">核实问题并隐藏作品</option><option value="resolve">已处理，保持作品状态</option><option value="reject">暂不采纳</option></select></label><label>处理说明<textarea name="note" maxlength="1000" placeholder="说明会发送给举报者"></textarea></label>${errorHTML}<button class="button wide" type="submit">保存处理结果</button></form>`,
      (d) => {
        $('#wall-report-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/work-reports/' + r.id, 'PATCH', f);
            closeModal();
            await refresh();
            toast('举报处理结果已发送');
          });
      },
    );
  }
  function bindCommunity() {
    $('#new-shooting-spot')?.addEventListener('click', () => editSpot());
    const each = (selector, fn) =>
      document.querySelectorAll(selector).forEach((b) => (b.onclick = () => fn(b)));
    each('[data-edit-spot]', (b) =>
      editSpot(state.data.shootingSpots.find((s) => s.id === b.dataset.editSpot)),
    );
    each('[data-review-work]', (b) =>
      reviewWork(
        state.data.works.find((w) => w.id === b.dataset.reviewWork),
        b.dataset.status,
      ),
    );
    each('[data-review-work-report]', (b) =>
      reviewReport(state.data.workReports.find((r) => r.id === b.dataset.reviewWorkReport)),
    );
  }
  return { shootingSpots, works, workReports, bindCommunity };
}
