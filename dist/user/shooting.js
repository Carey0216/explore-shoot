import { mountComparison } from './work-comparison.js';
import { renderInbox } from './inbox.js';
import { safeTarget } from '/shared/rich-message.js';
import {
  $,
  thumbnail,
  api,
  esc,
  date,
  icon,
  toast,
  modal,
  closeModal,
  formSubmit,
  errorHTML,
} from '/shared/ui.js';
import { openFraming } from './framing.js';
import { addToPlan, experienceFields, experienceValue, experienceHTML } from './photography.js';
import { featureVisible } from '/shared/features.js';
const statuses = {
  private: '仅自己可见',
  pending: '等待审核',
  approved: '已公开',
  rejected: '未通过审核',
  withdrawn: '已撤回公开',
  hidden: '已隐藏',
};
export const safePhoto = (url) =>
  /^\/api\/(works|shooting-spots)\/[a-f0-9-]+\/photo$/.test(url || '') ? url : '';
import { conditionLabels } from '/shared/shooting-conditions.js';
export { conditionLabels };
export function accessHTML(s) {
  return `<aside class="spot-access ${['limited', 'closed'].includes(s.availability) ? 'access-alert' : ''}" aria-label="开放与通行信息"><strong>${{ open: '正常开放', limited: '通行受限', closed: '临时关闭', unknown: '通行情况待确认' }[s.availability] || '通行情况待确认'}</strong><p>${esc(s.openingHours || '开放时间未填写，请以现场公告为准')}</p>${s.accessNotice ? `<p>${esc(s.accessNotice)}</p>` : ''}<div class="condition-tags">${(s.conditions || []).map((t) => `<span>${conditionLabels[t] || ''}</span>`).join('')}</div></aside>`;
}
export function spotCardHTML(s) {
  return `<a class="shooting-spot-card" href="#spot/${encodeURIComponent(s.id)}">${safePhoto(s.photo) ? `<img src="${esc(thumbnail(s.photo))}" alt="机位示例照片" loading="lazy" decoding="async" width="480" height="360">` : '<div class="spot-photo-empty">站位详情 ↗</div>'}<div><h3>${esc(s.title)}</h3><p>${esc(s.standDescription)}</p><span class="pill">${icon('clock')} <span>${esc(s.bestTime)}</span></span>${['limited', 'closed'].includes(s.availability) ? `<span class="pill">${s.availability === 'closed' ? '临时关闭' : '通行受限'}</span>` : ''}<small>查看站位与拍摄方向 ↗</small></div></a>`;
}
export function workCardHTML(w) {
  return `<article class="wall-work"><a href="${esc(safePhoto(w.photo))}" target="_blank" rel="noopener" aria-label="查看作品大图"><img src="${esc(thumbnail(safePhoto(w.photo)))}" alt="公开打卡作品" loading="lazy" decoding="async" width="480" height="360"></a><div><p>${esc(w.caption || '')}</p>${experienceHTML(w.experience)}<small>${esc(w.authorName)} · ${date(w.createdAt)}</small><button class="text-btn" type="button" data-work-report="${esc(w.id)}">举报作品</button></div></article>`;
}
function bindReports(root, requireAccount) {
  root.querySelectorAll('[data-work-report]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (!(await requireAccount())) return;
        modal(
          '举报作品',
          `<form id="work-report-form"><label>问题说明<textarea name="description" required minlength="5" maxlength="1000" placeholder="请说明作品存在的问题…"></textarea></label>${errorHTML}<button class="button wide" type="submit">提交举报</button></form>`,
          (d) => {
            $('#work-report-form', d).onsubmit = (e) =>
              formSubmit(e, async (fields) => {
                await api('/api/works/' + b.dataset.workReport + '/reports', 'POST', fields);
                closeModal();
                toast('举报已提交，处理结果会进入站内通知');
              });
          },
        );
      }),
  );
}
export function mountPlaceCommunity(host, { point, state, requireAccount }) {
  let disposed = false;
  const alive = () => !disposed && host.isConnected;
  const load = async () => {
    host.innerHTML = '<p role="status">正在加载真实机位与作品…</p>';
    try {
      const [spots, works] = await Promise.all([
        api('/api/points/' + point.id + '/shooting-spots'),
        api('/api/works?pointId=' + encodeURIComponent(point.id)).catch((e) => {
          if (!e.status || e.status === 403) return { items: [], _offline: !e.status };
          throw e;
        }),
      ]);
      if (!alive()) return;
      host.innerHTML = `<section><div class="community-section-heading"><h2>真实拍摄机位</h2>${spots._offline ? '<span class="offline-notice">离线公开资料 · 联网后请核实</span>' : ''}<span>${spots.spots.length}</span></div><p class="muted">每个机位都有独立站位；请结合现场通行情况使用。</p><div class="shooting-spot-grid">${spots.spots.map(spotCardHTML).join('') || '<p class="empty">还没有核实的独立机位，原拍摄建议仍可参考。</p>'}</div></section><section data-feature="work-wall"><h2>打卡作品墙</h2><p class="muted">用户自愿公开并通过审核的照片，供拍摄参考。</p><div class="work-wall">${works.items.map(workCardHTML).join('') || '<p class="empty">这里还没有公开作品。</p>'}</div><button type="button" class="button secondary" id="wall-more" ${works.next ? '' : 'hidden'}>更多作品</button></section>`;
      bindReports(host, requireAccount);
      let next = works.next;
      const seen = new Set(works.items.map((w) => w.id));
      $('#wall-more', host).onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          const page = await api(
            '/api/works?pointId=' +
              encodeURIComponent(point.id) +
              '&before=' +
              encodeURIComponent(next),
          );
          if (!alive()) return;
          $('.work-wall', host).insertAdjacentHTML(
            'beforeend',
            page.items
              .filter((w) => !seen.has(w.id))
              .map(workCardHTML)
              .join(''),
          );
          page.items.forEach((w) => seen.add(w.id));
          next = page.next;
          b.hidden = !next;
          bindReports(host, requireAccount);
        } catch (e) {
          if (alive()) toast(e.message);
        } finally {
          if (alive()) b.disabled = false;
        }
      };
    } catch (e) {
      if (alive()) {
        host.innerHTML = `<p role="alert">${esc(e.message)}</p><button class="button secondary" id="community-retry">重试</button>`;
        $('#community-retry', host).onclick = load;
      }
    }
  };
  void load();
  return () => {
    disposed = true;
  };
}
export function mountCheckinSharing(host, { point, spotId }) {
  let disposed = false;
  const load = async () => {
    try {
      const { spots } = await api('/api/points/' + point.id + '/shooting-spots');
      if (disposed || !host.isConnected) return;
      host.innerHTML = `<label>本次拍摄机位<select name="spotId"><option value="">未选择具体机位</option>${spots.map((s) => `<option value="${esc(s.id)}" ${s.id === spotId ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label><label class="wall-opt-in"><input type="checkbox" name="shareToWall" value="yes" ${spots.length ? '' : 'disabled'}><span>申请公开照片到机位作品墙（审核后展示）</span></label><p class="muted">默认仅自己可见。公开时只展示照片、昵称和下方配文，私人感受与定位不公开。</p><label id="public-caption-label" hidden>公开配文<textarea name="publicCaption" maxlength="500" disabled placeholder="只填写愿意公开的内容，可留空"></textarea></label>${featureVisible('experience') ? `<div id="public-experience" hidden>${experienceFields()}</div>` : ''}${spots.length ? '' : '<p class="muted">该地点尚无独立机位，暂不能投稿作品墙。</p>'}`;
      const checkbox = $('[name="shareToWall"]', host),
        caption = $('[name="publicCaption"]', host);
      checkbox.onchange = () => {
        caption.disabled = !checkbox.checked;
        $('#public-caption-label', host).hidden = !checkbox.checked;
        const ex = $('#public-experience', host);
        if (ex) {
          ex.hidden = !checkbox.checked;
          ex.querySelectorAll('input,textarea').forEach((el) => (el.disabled = !checkbox.checked));
        }
      };
    } catch (e) {
      if (!disposed && host.isConnected)
        host.innerHTML = `<p class="muted">${esc(e.message)} · 本次仍可私密打卡</p><button class="text-btn" type="button" id="sharing-retry">重试加载机位</button>`;
      $('#sharing-retry', host)?.addEventListener('click', load);
    }
  };
  void load();
  return () => {
    disposed = true;
  };
}
export async function shareCheckin(record, { state, onSaved = () => {} }) {
  const owner = state.account?.id;
  const [data, own] = await Promise.all([
    api('/api/points/' + record.pointId + '/shooting-spots'),
    api('/api/my/works'),
  ]);
  if (!owner || state.account?.id !== owner) return;
  const old = own.items.find((w) => w.checkinId === record.id);
  if (!data.spots.length) {
    modal('公开到作品墙', '<p>该地点还没有已发布的独立机位，请先保留私密打卡。</p>');
    return;
  }
  modal(
    '公开到作品墙',
    `<p class="muted">公开照片、昵称和配文，审核通过后展示。私人打卡感受和定位不会公开，可随时撤回。</p><form id="share-work-form"><label>对应机位<select name="spotId" required><option value="">请选择真实拍摄机位</option>${data.spots.map((s) => `<option value="${esc(s.id)}" ${s.id === (old?.spotId || record.spotId) ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label><label>公开配文<textarea name="caption" maxlength="500" placeholder="只填写愿意公开的内容，可留空">${esc(old?.caption || '')}</textarea></label>${featureVisible('experience') ? experienceFields(old?.experience) : ''}${errorHTML}<button class="button wide" type="submit">提交公开审核</button></form>`,
    (d) => {
      $('#share-work-form', d).onsubmit = (e) =>
        formSubmit(e, async (f) => {
          if (state.account?.id !== owner) throw Error('登录账号已改变，请重新打开页面');
          await api('/api/checkins/' + record.id + '/sharing', 'PUT', {
            public: true,
            spotId: f.spotId,
            caption: f.caption,
            experience: experienceValue(f),
          });
          closeModal();
          onSaved();
          toast('公开申请已提交，可在我的公开作品查看状态');
        });
    },
  );
}

export function mountShootingPage({ state, requireAccount }) {
  const root = $('#main'),
    page = state.page,
    owner = state.account?.id;
  let disposed = false,
    map = null;
  const alive = () =>
    !disposed && root.isConnected && state.page === page && state.account?.id === owner;
  const run = async () => {
    try {
      if (page === 'spot') {
        const s = await api('/api/shooting-spots/' + encodeURIComponent(state.placeId));
        if (!alive()) return;
        root.innerHTML = `<a class="text-btn" href="#place/${encodeURIComponent(s.pointId)}">← 返回地点</a><article class="shooting-detail">${s._offline ? `<p class="offline-notice" role="status">离线资料 · 保存于 ${new Date(s._cachedAt).toLocaleString()}，开放情况可能已变化，联网后请刷新。</p>` : ''}<header><span class="pill">独立拍摄机位</span><h1>${esc(s.title)}</h1></header><div class="shooting-detail-grid">${safePhoto(s.photo) ? `<img class="spot-example" src="${esc(s.photo)}" alt="机位示例照片">` : '<div class="spot-photo-empty">暂无示例照片</div>'}<section>${accessHTML(s)}<h2>站在哪里</h2><p>${esc(s.standDescription)}</p><div class="spot-direction"><span aria-hidden="true" style="transform:rotate(${Number(s.bearing)}deg)">↑</span><p>拍摄朝向 <b>${Number(s.bearing)}°</b><small>正北为0°，顺时针增加</small></p></div><p>${s.heightMeters ? `建议镜头高度 ${Number(s.heightMeters)} 米` : '建议高度待维护'} ${esc(s.heightAdvice || '')}</p><div class="button-row">${featureVisible('framing') ? `<button id="spot-framing" data-feature="framing" class="button">取景辅助</button>` : ''}${featureVisible('plans') ? `<button id="spot-add-plan" data-feature="plans" class="button secondary" ${s._offline ? 'disabled' : ''}>加入拍摄清单</button>` : ''}</div><div class="phone-tip"><span>${icon('camera')}</span><div><strong>现场试着这样拍</strong><p>${esc(s.compositionTip || '打开九宫格，先选一个明确主体，轻点对焦，靠近一步减少杂乱背景。')}</p><small>${esc(s.tipSource || '通用手机练习建议')}</small></div></div><h2>适合的时间</h2><p>${esc(s.bestTime)}</p><p class="spot-verified">最近核验：${esc(s.verifiedAt || '待补充')}<br><small>${esc(s.verificationNotice || '')}</small></p><p class="muted">机位坐标（WGS84）<br>${Number(s.lng).toFixed(7)}, ${Number(s.lat).toFixed(7)}</p><div class="button-row"><button class="button secondary" id="spot-map-open">在地图上查看站位</button>${s.availability === 'closed' ? '<span class="pill">机位暂时关闭</span>' : `<a class="button" href="#checkin/${encodeURIComponent(s.pointId)}?spot=${encodeURIComponent(s.id)}">在这个机位打卡</a>`}</div></section></div><div id="spot-map-holder" hidden><div id="spot-location-map" class="spot-location-map" role="region" aria-label="真实机位站位地图"></div><p class="muted">坐标和朝向用于拍摄参考，请留意现场安全与通行条件。</p></div></article>`;
        bindReports(root, requireAccount);
        $('#spot-framing')?.addEventListener('click', () => {
          state.framingCleanup?.();
          state.framingCleanup = openFraming(s);
        });
        const comparison = document.createElement('section');
        comparison.className = 'comparison-section';
        root.querySelector('.shooting-detail').append(comparison);
        comparison.dataset.feature = 'work-wall';
        if (featureVisible('work-wall'))
          void mountComparison(comparison, s.id, alive, () =>
            bindReports(comparison, requireAccount),
          );
        $('#spot-add-plan')?.addEventListener('click', () =>
          addToPlan(s, requireAccount).catch((e) => toast(e.message)),
        );
        $('#spot-map-open').onclick = async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          try {
            const { campusMap } = await import('/shared/map.js');
            if (!alive()) return;
            $('#spot-map-holder').hidden = false;
            map = await campusMap($('#spot-location-map'), {
              ...state.catalog,
              points: [{ ...s, name: s.title, open: true }],
            });
            if (!alive()) {
              map.destroy();
              return;
            }
            map.focus?.(s.id);
            b.hidden = true;
          } catch (e) {
            if (alive()) toast(e.message);
          } finally {
            if (alive()) b.disabled = false;
          }
        };
      } else if (!owner) {
        root.innerHTML =
          '<div class="empty"><h1>登录后查看</h1><button class="button" id="community-login">登录 / 注册</button></div>';
        $('#community-login').onclick = requireAccount;
      } else if (page === 'notifications') {
        await renderInbox(root, alive);
      } else {
        const data = await api('/api/my/works');
        if (!alive()) return;
        root.innerHTML = `<a class="text-btn" href="#me">← 我的</a><h1>我的公开作品</h1><p class="muted">只有审核通过的作品才会展示在机位作品墙，私人打卡保留在打卡足迹。</p><a class="button secondary" href="#passport">从打卡足迹选择照片</a><div class="stack">${
          data.items
            .slice()
            .reverse()
            .map(
              (w) =>
                `<article class="inbox-item"><span class="pill">${statuses[w.status] || '等待审核'}</span><p>${esc(w.caption || '')}</p><p class="muted">${esc(w.reviewNote || '')}</p><div class="button-row"><a class="text-btn" href="#spot/${encodeURIComponent(w.spotId)}">查看机位 ↗</a>${w.status === 'withdrawn' ? '' : `<button class="text-btn" data-withdraw-work="${esc(w.checkinId)}">撤回公开</button>`}</div></article>`,
            )
            .join('') || '<p class="empty">还没有申请公开的作品。</p>'
        }</div>`;
        root.querySelectorAll('[data-withdraw-work]').forEach(
          (b) =>
            (b.onclick = async () => {
              b.disabled = true;
              try {
                await api('/api/checkins/' + b.dataset.withdrawWork + '/sharing', 'PUT', {
                  public: false,
                });
                if (alive()) void run();
                toast('已撤回，私人打卡仍保留');
              } catch (e) {
                if (alive()) {
                  b.disabled = false;
                  toast(e.message);
                }
              }
            }),
        );
      }
    } catch (e) {
      if (alive()) {
        root.innerHTML = `<p role="alert">${esc(e.message)}</p><button class="button secondary" id="shooting-retry">重试</button>`;
        $('#shooting-retry').onclick = run;
      }
    }
  };
  void run();
  return () => {
    disposed = true;
    map?.destroy();
    state.framingCleanup?.();
  };
}
