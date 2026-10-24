import { $, api, esc, modal, closeModal, toast } from '/shared/ui.js';
import { richHTML } from '/shared/rich-message.js';
import { onboardingState } from '/shared/onboarding-state.js';
import { showFeatureTour, tourIsOpen } from '/shared/feature-tour.js';
export const adminUpdatesPage = () =>
  '<section id="admin-updates"><p role="status">正在加载更新与引导…</p></section>';
const steps = [
  [
    '.admin-notification-button',
    'message',
    '从消息与待办开始',
    '这里汇总获授权的审核与用户联系。筛选类别后可选择消息、批量标为已读；已读不等于已经处理。',
    '',
  ],
  [
    '.admin-dock a',
    'check',
    '审核前先核对变化',
    '工作台的审核队列支持筛选与批量处理。打开记录，检查原内容和修改内容，确认保存结果；多人编辑发生冲突时重新载入核对。',
    'works',
  ],
  [
    '.admin-dock a[href="#users"]',
    'people',
    '用户与权限',
    '处理探索官申请、核查用户资料。管理员只能操作获授权的功能；新增管理员和权限分配由顶级管理员负责。',
    'users',
  ],
  [
    '.admin-dock a[href="#points"]',
    'pin',
    '维护校园地点和真实机位',
    '校园点位是地点，真实机位进一步描述站在哪里、朝向哪里。填写开放时段、构图建议、样片来源和最近核验日期，不把参考配图当作实拍。',
    'points',
  ],
  [
    '.admin-dock a[href="#points"]',
    'book',
    '指南、路线与校园活动',
    '内容维护中管理拍摄指南、探索路线、打卡护照、活动专题和开屏公告。先保存草稿、预览，再发布；下线会停止新的公开展示。',
    'content',
  ],
  [
    '.admin-notification-button',
    'message',
    '认清留言者，再建立联系',
    '消息卡片显示昵称和账号。回应用户留言后建立聊天连接，双方通过气泡对话继续沟通，附件和链接在发送前检查。',
    'messages',
  ],
  [
    '.admin-dock a[href="#audit"]',
    'clock',
    '操作记录和运行状态',
    '记录栏目按权限查看维护历史。顶级管理员可在设置查看接口耗时、错误率、数据库、缓存和上传指标，协助定位问题。',
    'audit',
  ],
  [
    '#admin-edit-profile',
    'user',
    '自己的资料与外观',
    '点头像修改昵称和头像；账户设置中修改密码，并选择跟随系统、浅色或深色外观。不要把管理员账号分享给其他人。',
    '',
  ],
  [
    '.admin-dock',
    'book',
    '每次更新都有说明',
    '更新与引导保留管理端操作说明。新功能到来会显示本次更新；完整引导可随时重看。顶级管理员会收到自动生成的双端更新草稿：新版发现、护照、常用工具与活动下一站均已更新引导，检查两份说明后再发布。',
    '',
  ],
];
function fullTour(account, done) {
  const allowed = steps
    .filter((s) => !s[4] || account.effectivePermissions?.includes(s[4] + '.read'))
    .map((s) => s.slice(0, 4));
  showFeatureTour({ steps: allowed, audience: 'admin', label: '管理端操作引导', done });
}
export function pendingPrompt(data, account) {
  const pending = data.pending?.find((p) => p.version === data.version) || data.pending?.[0];
  if (
    !pending ||
    account.role !== 'owner' ||
    !['', '#', '#overview'].includes(location.hash.split('?')[0]) ||
    document.querySelector('dialog[open]') ||
    tourIsOpen()
  )
    return;
  const key = `explore-release-review:${account.id}:${pending.id}:${pending.revision}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, 'shown');
  } catch {}
  modal(
    '新版本日志已生成草稿',
    `<p>v${esc(pending.version)} 的双端更新说明等待检查。新草稿尚未发布。</p><p class="muted">请分别检查用户与管理端内容，预览后再发布到消息中心。</p><button class="button wide" id="review-release-draft">检查更新日志</button>`,
    (d) => {
      $('#review-release-draft', d).onclick = () => {
        closeModal();
        location.hash = 'updates';
      };
    },
  );
}
export async function bindAdminGuidance(account) {
  try {
    const data = await api('/api/admin/updates');
    if (!document.querySelector('#admin-edit-profile') || tourIsOpen()) return;
    const history = onboardingState('admin', account);
    const guide = $('#admin-guide');
    if (guide) guide.onclick = () => fullTour(account, () => history.finish(data.version));
    if (!history.experienced()) {
      fullTour(account, () => {
        history.finish(data.version);
        pendingPrompt(data, account);
      });
      return;
    }
    if (data.published && !history.seen(data.version) && !document.querySelector('dialog[open]')) {
      history.finish(data.version);
      modal(
        '管理端 · 本次更新',
        `<article class="release-note"><span class="release-kicker">WHAT’S NEW · v${esc(data.version)}</span><h2>${esc(data.title)}</h2><p class="message-copy">${esc(data.body)}</p></article><button class="button wide" id="admin-update-done">了解了</button>`,
        (d) => {
          $('#admin-update-done', d).onclick = () => {
            closeModal();
            pendingPrompt(data, account);
          };
        },
      );
      return;
    }
    pendingPrompt(data, account);
  } catch {
    /* Guidance cannot block normal management when offline. */
  }
}
export async function bindAdminUpdates(state) {
  const host = $('#admin-updates'),
    account = state.account;
  if (!host) return;
  try {
    const data = await api('/api/admin/updates');
    if (!host.isConnected || state.account?.id !== account.id) return;
    host.innerHTML = `<header class="section-heading"><div><span class="release-kicker">管理端 · v${esc(data.version)}</span><h2>更新与操作引导</h2></div><button class="button secondary" id="admin-replay-tour">完整操作引导</button></header><article class="release-note"><h3>${esc(data.title)}</h3><p class="message-copy">${esc(data.body)}</p></article>${account.role === 'owner' ? `<section class="panel"><h2>双端更新日志</h2><p class="muted">部署自动生成，未经检查不发送。发布后进入消息中心的更新日志栏，并向已经看过完整引导的用户展示 What’s New。</p>${(data.releases || data.pending).map((p) => `<article class="review-card"><strong>${esc(p.title)}</strong><p>v${esc(p.version)} · ${p.published ? '已发布' : '草稿 / 已撤回'} · 修订 ${Number(p.revision)}</p><button class="button" data-review-release="${esc(p.id)}">检查 / 修改 / 发布</button></article>`).join('') || '<p>暂时没有更新日志。</p>'}</section>` : ''}`;
    $('#admin-replay-tour', host).onclick = () =>
      fullTour(account, () => onboardingState('admin', account).finish(data.version));
    host
      .querySelectorAll('[data-review-release]')
      .forEach((b) => (b.onclick = () => editRelease(b.dataset.reviewRelease, state)));
  } catch (e) {
    if (host.isConnected) host.textContent = e.message;
  }
}
async function editRelease(id, state) {
  try {
    const data = await api('/api/admin/announcements'),
      row = data.items.find((r) => r.id === id);
    if (!row) throw Error('草稿已变化，请刷新');
    const content = row.draft;
    modal(
      '检查双端更新日志',
      `<form id="release-edit"><span class="release-kicker">v${esc(row.releaseVersion)} · 修订 ${Number(row.revision)}</span><label>标题<input name="title" maxlength="80" required value="${esc(content.title)}"></label><label>用户端更新说明<textarea name="body" rows="8" maxlength="6000" required>${esc(content.body)}</textarea></label><label>管理端更新说明<textarea name="adminBody" rows="8" maxlength="6000" required>${esc(row.adminDraft || '')}</textarea></label><section class="release-preview" id="release-preview" hidden></section><label class="release-confirm"><input type="checkbox" name="checked"><span>已检查双端更新说明，确认发布并发送用户通知</span></label><p class="form-error" role="alert"></p><div class="button-row"><button type="button" class="button secondary" id="release-preview-button">预览</button><button class="button secondary" type="submit" value="draft">保存草稿</button><button class="button" type="submit" value="publish">发布更新通知</button>${row.published ? '<button class="button secondary" type="submit" value="unpublish">撤回并继续编辑</button>' : ''}<button class="button danger" type="button" id="release-delete">删除日志</button></div></form>`,
      (d) => {
        const form = $('#release-edit', d);
        $('#release-delete', d).onclick = () => {
          modal(
            '删除这份更新日志？',
            '<p>删除后停止展示和投递；已收到的通知会静默移除，不向用户发送撤回提示。此版本草稿不会在重启后重新生成。</p><p class="form-error" role="alert"></p><button class="button danger" id="release-delete-confirm">确认删除</button>',
            (next) => {
              $('#release-delete-confirm', next).onclick = async (event) => {
                event.currentTarget.disabled = true;
                try {
                  await api('/api/admin/announcements/' + id, 'DELETE', { revision: row.revision });
                  closeModal();
                  toast('更新日志已删除');
                  await bindAdminUpdates(state);
                } catch (e) {
                  $('.form-error', next).textContent = e.message;
                  event.currentTarget.disabled = false;
                }
              };
            },
          );
        };
        const read = () => ({
          ...content,
          channels: ['web', 'mini'],
          title: form.elements.title.value.trim(),
          body: form.elements.body.value.trim(),
        });
        $('#release-preview-button', d).onclick = () => {
          const p = $('#release-preview', d);
          p.hidden = false;
          p.innerHTML = `<article class="release-note"><h3>${esc(read().title)}</h3>${richHTML(read())}</article><article class="release-note"><span class="release-kicker">管理端预览</span><p class="message-copy">${esc(form.elements.adminBody.value)}</p></article>`;
        };
        form.onsubmit = async (e) => {
          e.preventDefault();
          const action = e.submitter?.value || 'draft';
          if (action === 'publish' && !form.elements.checked.checked) {
            $('.form-error', form).textContent = '请先检查并勾选发布确认';
            return;
          }
          form.querySelectorAll('button').forEach((b) => (b.disabled = true));
          try {
            await api('/api/admin/announcements/' + id, 'PUT', {
              revision: row.revision,
              action,
              content: read(),
              adminBody: form.elements.adminBody.value.trim(),
            });
            closeModal();
            toast(
              action === 'publish'
                ? '更新已发布，用户进入消息中心时收到通知'
                : action === 'unpublish'
                  ? '更新已撤回，可以继续编辑'
                  : '草稿已保存，尚未发送',
            );
            await bindAdminUpdates(state);
          } catch (error) {
            $('.form-error', form).textContent = error.message;
          } finally {
            form.querySelectorAll('button').forEach((b) => (b.disabled = false));
          }
        };
      },
    );
  } catch (e) {
    toast(e.message);
  }
}
