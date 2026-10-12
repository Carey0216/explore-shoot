import {
  $,
  esc,
  date,
  api,
  icon,
  toast,
  modal,
  closeModal,
  formSubmit,
  field,
  errorHTML,
} from '/shared/ui.js';

// 邀请码列表与编辑。业务规则与权限由 Java 接口处理。
export function createInvitesPages({ table, state, badge, refresh }) {
  function invites() {
    return `<div class="toolbar"><div><h2 class="section-title">邀请新伙伴</h2><p class="muted" style="margin:0">自动生成或手动填写；总邀请名额可随时调整，有效邀请码注册直接成为校园探索官；不填写邀请码可注册普通账号。</p></div><button id="new-invite" class="button">${icon('plus')} 生成邀请码</button></div><section class="panel invite-panel">${table(
      ['邀请码 / 备注', '邀请名额', '有效期', '生成者', '状态', '操作'],
      [...state.data.invites]
        .reverse()
        .map(
          (i) =>
            `<tr><td><strong class="code">${esc(i.code)}</strong><small>${i.generationMode === 'manual' ? '手动填写' : '自动生成'} · ${esc(i.note || '无备注')}</small></td><td><div class="invite-quota"><b>${i.used} <span>/ ${i.maxUses}</span></b><small>剩余 ${Math.max(0, i.maxUses - i.used)} 个名额</small><span class="quota-meter"><i style="width:${Math.min(100, (i.used / i.maxUses) * 100)}%"></i></span></div></td><td>${date(i.expiresAt)}</td><td>${esc(i.creator)}</td><td>${badge(!i.enabled ? '已停用' : Date.parse(i.expiresAt) <= Date.now() ? '已过期' : i.used >= i.maxUses ? '已用完' : '可使用', i.enabled && i.used < i.maxUses && Date.parse(i.expiresAt) > Date.now() ? 'green' : '')}</td><td><div class="button-row"><button class="button secondary small" data-copy="${i.code}">复制</button><button class="button secondary small" data-invite-edit="${i.id}">调整名额</button><button class="text-btn" data-invite-usage="${i.id}">使用记录</button><button class="text-btn" data-invite-toggle="${i.id}">${i.enabled ? '停用' : '启用'}</button></div></td></tr>`,
        ),
    )}</section>`;
  }

  function newInvite() {
    modal(
      '生成邀请码',
      `<form id="invite-form"><fieldset class="generation-choice"><legend>生成方式</legend><div class="segmented-choice"><label><input type="radio" name="mode" value="auto" checked><span>自动生成</span></label><label><input type="radio" name="mode" value="manual"><span>手动生成</span></label></div></fieldset><div id="manual-invite-field" hidden>${field('自定义邀请码（6—30 位字母或数字）', 'code', 'text', '', 'disabled minlength="6" maxlength="30" pattern="[A-Za-z0-9]{6,30}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="例如：CAMPUS26 或 123456"')}<p class="tip">支持纯数字，英文字母统一转为大写。不能使用已有的邀请码。</p></div><div class="form-grid">${field('总邀请名额', 'maxUses', 'number', '1', 'required min="1" max="500" step="1"')}${field('有效期（天）', 'days', 'number', '7', 'required min="1" max="90" step="1"')}</div>${field('备注', 'note', 'text', '', 'maxlength="100" placeholder="例如：第一轮校园内测"')}${errorHTML}<button class="button wide" type="submit">创建邀请码</button></form>`,
      (d) => {
        document.querySelectorAll('[name=mode]').forEach(
          (r) =>
            (r.onchange = () => {
              const manual = $('[name=mode]:checked', d).value === 'manual';
              $('#manual-invite-field', d).hidden = !manual;
              const input = $('[name=code]', d);
              input.disabled = !manual;
              input.required = manual;
              if (manual) input.focus();
            }),
        );
        $('#invite-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            const i = await api('/api/admin/invites', 'POST', {
              ...f,
              maxUses: Number(f.maxUses),
              days: Number(f.days),
            });
            closeModal();
            await refresh();
            modal(
              '邀请码已生成',
              `<p class="muted">将这个邀请码提供给参与试点的用户。</p><p class="generated-code">${esc(i.code)}</p><p class="muted">最多注册 ${i.maxUses} 个账号 · ${date(i.expiresAt)} 到期</p><button class="button wide" id="copy-new">复制邀请码</button>`,
              (d) => {
                $('#copy-new', d).onclick = () => copy(i.code);
              },
            );
          });
      },
    );
  }

  function editInvite(i) {
    modal(
      '调整邀请名额',
      `<form id="invite-edit-form"><p class="generated-code">${esc(i.code)}</p><p class="muted">已经有 ${i.used} 个用户通过此码注册。调整名额会即时生效，已注册用户与归属记录不受影响。</p>${field('总邀请名额', 'maxUses', 'number', i.maxUses, 'required min="' + Math.max(1, i.used) + '" max="500" step="1"')}<p class="tip" id="invite-remaining">当前剩余 ${Math.max(0, i.maxUses - i.used)} 个名额</p>${field('备注', 'note', 'text', i.note, 'maxlength="100"')}${errorHTML}<button class="button wide" type="submit">保存调整</button></form>`,
      (d) => {
        $('[name=maxUses]', d).oninput = (e) => {
          const n = Number(e.target.value);
          $('#invite-remaining', d).textContent =
            Number.isInteger(n) && n >= Math.max(1, i.used)
              ? '调整后剩余 ' + (n - i.used) + ' 个名额'
              : '总名额不能小于 ' + Math.max(1, i.used);
        };
        $('#invite-edit-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/invites/' + i.id, 'PATCH', {
              maxUses: Number(f.maxUses),
              note: f.note,
            });
            closeModal();
            await refresh();
            toast('邀请名额已更新');
          });
      },
    );
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制');
    } catch {
      modal(
        '复制内容',
        `<input value="${esc(text)}" readonly aria-label="待复制内容"><p class="muted">浏览器未允许自动复制，可以选中文字手动复制。</p>`,
      );
    }
  }
  return { invites, newInvite, editInvite, copy };
}
