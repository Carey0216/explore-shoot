import { $, api, esc, modal, closeModal, toast, date } from '/shared/ui.js';
import { atlasHTML } from '/shared/passport-atlas.js';
export function bindAtlasOperations(host, { state, atlas, reload }) {
  if (state.account?.role !== 'owner') return;
  const tools = document.createElement('div');
  tools.className = 'button-row';
  tools.innerHTML =
    '<button class="button secondary" data-atlas-history>编辑历史与恢复</button><button class="button" data-atlas-people>按点位管理打卡</button><button class="button secondary" data-atlas-export>导出标注供版本同步</button>';
  host.prepend(tools);
  $('[data-atlas-export]', tools).onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const envelope = await api('/api/admin/passport/export');
      const snapshot = JSON.parse(envelope.payload);
      modal(
        '导出校园建筑标注',
        `<p>本次导出 ${snapshot.buildings.length} 栋建筑，其中 ${snapshot.buildings.filter((b) => b.pointIds.length).length} 栋已关联地点。</p><p class="muted">下载只保留一份快照，不改变云端标注。完成全部标注后，再将最终文件核对并同步到源码。已有环境以数据库中的标注为准。</p><p>导出时间：${esc(date(snapshot.exportedAt))}</p><p class="muted" style="overflow-wrap:anywhere">SHA-256：${esc(envelope.checksum)}</p><button class="button" data-download-atlas>下载标注文件</button>`,
        (dialog) => {
          $('[data-download-atlas]', dialog).onclick = () => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(envelope, null, 2) + '\n'], { type: 'application/json' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download =
              'jingyu-atlas-' +
              snapshot.exportedAt.slice(0, 10) +
              '-' +
              envelope.checksum.slice(0, 12) +
              '.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          };
        },
      );
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };
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
            const actions = {
              reset: '取消收集统计',
              restore: '恢复原统计',
              delete: '删除已撤销打卡',
            };
            const creditButton = (row, action) =>
              `<button class="text-btn" data-credit-action="${action}" data-credit-user="${esc(row.userId)}">${actions[action]}</button>`;
            list.innerHTML =
              data.items
                .map(
                  (row) =>
                    `<article class="atlas-history-row813"><div><strong>${esc(row.nickname)} <small>@${esc(row.username)}</small></strong><small>${row.activeCount} 条计入收集 · ${row.revokedCount} 条已撤销</small></div><div>${row.activeCount ? creditButton(row, 'reset') : ''}${row.revokedCount ? creditButton(row, 'restore') + creditButton(row, 'delete') : ''}</div></article>`,
                )
                .join('') || '<p>此点位暂无打卡用户。</p>';
            list.querySelectorAll('[data-credit-action]').forEach(
              (b) =>
                (b.onclick = () => {
                  const action = b.dataset.creditAction,
                    row = data.items.find((r) => r.userId === b.dataset.creditUser),
                    deleting = action === 'delete';
                  const description = deleting
                    ? `永久删除已撤销的 ${row.revokedCount} 条打卡及相关公开作品，清理无引用的照片。此操作无法恢复，审计会保留操作记录。`
                    : '本次操作会备份并记录操作者。原始照片和私人留言保留。';
                  modal(
                    actions[action] + '？',
                    `<p>${esc(row.nickname)} · ${esc(points.find((p) => p.id === chosen)?.name)}</p><p>${description}</p><button class="button" data-credit-confirm>${deleting ? '永久删除' : '确认'}</button><p class="form-error" role="alert"></p>`,
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
                          toast(deleting ? '打卡已删除' : '收集统计已更新');
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
