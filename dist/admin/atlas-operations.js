import { $, api, esc, modal, closeModal, toast, date } from '/shared/ui.js';
import { atlasHTML } from '/shared/passport-atlas.js';
export function bindAtlasOperations(host, { state, atlas, reload }) {
  if (state.account?.role !== 'owner') return;
  const tools = document.createElement('div');
  tools.className = 'button-row';
  tools.innerHTML =
    '<button class="button secondary" data-atlas-history>编辑历史与恢复</button><button class="button" data-atlas-people>按点位管理打卡</button>';
  host.prepend(tools);
  const people = async (pointId) => {
    const points = state.data.points;
    modal(
      '点位打卡与收集统计',
      `<p class="muted">取消后，该用户在此点位的既有打卡不再计入收集图；重新真实打卡可再次点亮。原始照片与留言保留，可恢复原统计。</p><label>选择点位<select data-checkin-point>${points.map((p) => `<option value="${esc(p.id)}" ${p.id === pointId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><div data-participants role="status">正在读取…</div>`,
      (d) => {
        const select = $('[data-checkin-point]', d),
          list = $('[data-participants]', d);
        const draw = async () => {
          try {
            const chosen = select.value,
              data = await api(
                '/api/admin/passport/point-checkins?pointId=' + encodeURIComponent(chosen),
              );
            if (!d.isConnected || select.value !== chosen) return;
            list.innerHTML =
              data.items
                .map(
                  (r) =>
                    `<article class="atlas-history-row813"><div><strong>${esc(r.nickname)} <small>@${esc(r.username)}</small></strong><small>${r.activeCount} 条计入收集${r.reset ? ' · 已取消过原统计' : ''}</small></div>${r.activeCount ? `<button class="text-btn" data-reset-user="${esc(r.userId)}">取消此点位收集统计</button>` : ''}${r.reset ? `<button class="text-btn" data-restore-user="${esc(r.userId)}">恢复原统计</button>` : ''}</article>`,
                )
                .join('') || '<p>此点位暂无打卡用户。</p>';
            list.querySelectorAll('[data-reset-user],[data-restore-user]').forEach(
              (b) =>
                (b.onclick = () => {
                  const action = b.dataset.resetUser ? 'reset' : 'restore',
                    row = data.items.find(
                      (r) => r.userId === (b.dataset.resetUser || b.dataset.restoreUser),
                    );
                  modal(
                    action === 'reset' ? '取消这个用户的收集统计？' : '恢复这个用户的原统计？',
                    `<p>${esc(row.nickname)} · ${esc(points.find((p) => p.id === chosen)?.name)}</p><p>本次操作先备份并记录操作者。原始照片和私人留言保留。</p><button class="button" data-credit-confirm>确认${action === 'reset' ? '取消' : '恢复'}</button><p class="form-error" role="alert"></p>`,
                    (confirm) => {
                      $('[data-credit-confirm]', confirm).onclick = async (e) => {
                        e.currentTarget.disabled = true;
                        try {
                          await api('/api/admin/passport/point-checkins', 'POST', {
                            pointId: chosen,
                            userId: row.userId,
                            marker: row.marker,
                            action,
                          });
                          toast('收集统计已更新');
                          void people(chosen);
                        } catch (error) {
                          $('.form-error', confirm).textContent = error.message;
                          e.currentTarget.disabled = false;
                        }
                      };
                    },
                  );
                }),
            );
          } catch (e) {
            list.textContent = e.message;
          }
        };
        select.onchange = draw;
        void draw();
      },
    );
  };
  $('[data-atlas-people]', tools).onclick = () => void people(state.data.points[0]?.id);
  $('[data-atlas-history]', tools).onclick = async () => {
    try {
      const data = await api('/api/admin/passport/history');
      modal(
        '校园收集图 · 编辑历史',
        `<p class="muted">每次保存前保留一份修改前状态。恢复只影响选中建筑，并再次备份当前版本。</p><div class="atlas-history813">${data.items.map((r) => `<article class="atlas-history-row813"><div><strong>${esc(r.name)}</strong><small>${date(r.savedAt)} · ${esc(r.actorName)} · v${r.fromRevision} → v${r.toRevision}</small></div><button class="text-btn" data-atlas-snapshot="${r.snapshotId}">预览 / 恢复</button></article>`).join('') || '<p>尚无编辑备份。</p>'}</div>`,
        (d) => {
          d.querySelectorAll('[data-atlas-snapshot]').forEach(
            (b) =>
              (b.onclick = async () => {
                try {
                  const snap = await api('/api/admin/passport/history/' + b.dataset.atlasSnapshot),
                    current = atlas.buildings.find((x) => x.id === snap.id);
                  if (!current) throw Error('建筑已变化，请重新加载');
                  const preview = (which) =>
                    atlasHTML(
                      {
                        ...atlas,
                        buildings: atlas.buildings.map((x) =>
                          x.id === current.id ? { ...x, ...snap[which], collected: true } : x,
                        ),
                      },
                      current.frame,
                      current.id,
                    );
                  modal(
                    '预览这次建筑修改',
                    `<div class="atlas-history-preview813">${['before', 'after'].map((k, i) => `<section><h3>${i ? '修改后' : '修改前'}</h3><p>${esc(snap[k].name)} · ${(snap[k].pointIds || []).length} 个关联地点</p>${preview(k)}</section>`).join('')}</div><p class="muted">将恢复“修改前”的楼名、关联和轮廓。当前版本 v${current.revision} 会先备份。</p><button class="button" data-history-restore>恢复为修改前版本</button><p class="form-error" role="alert"></p>`,
                    (view) => {
                      $('[data-history-restore]', view).onclick = async (event) => {
                        event.currentTarget.disabled = true;
                        try {
                          await api('/api/admin/passport/buildings', 'PUT', {
                            id: current.id,
                            revision: current.revision,
                            restoreFrom: snap.snapshotId,
                            checksum: snap.checksum,
                          });
                          closeModal();
                          await reload();
                          toast('已恢复，原版本已另行备份');
                        } catch (e) {
                          $('.form-error', view).textContent = e.message;
                          event.currentTarget.disabled = false;
                        }
                      };
                    },
                  );
                } catch (e) {
                  toast(e.message);
                }
              }),
          );
        },
      );
    } catch (e) {
      toast(e.message);
    }
  };
}
