import { cropHTML, mountAvatarCrop } from './avatar-crop.js';
import {
  $,
  esc,
  field,
  errorHTML,
  modal,
  closeModal,
  formSubmit,
  toast,
  parseResponse,
} from './ui.js';

export function saveProfile(body, { onProgress = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const abort = () => request.abort();
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    request.upload.onprogress = (e) =>
      onProgress({ phase: 'upload', loaded: e.loaded, total: e.lengthComputable ? e.total : null });
    request.upload.onload = () => onProgress({ phase: 'save' });
    request.onload = () => {
      try {
        const result = parseResponse(request.responseText, request.status);
        if (!result?.account?.id) throw Error('服务器未确认资料保存，请重试');
        finish(resolve, result);
      } catch (e) {
        finish(reject, e);
      }
    };
    request.onerror = () => finish(reject, Error('上传中断，请检查网络后重试。'));
    request.ontimeout = () => finish(reject, Error('保存超时，请重试。'));
    request.onabort = () => {
      const e = Error('保存已取消');
      e.name = 'AbortError';
      finish(reject, e);
    };
    if (signal?.aborted) {
      request.onabort();
      return;
    }
    try {
      request.open('PATCH', new URL('/api/auth/profile', location.href).href, true);
      request.timeout = 90000;
      request.setRequestHeader('Content-Type', 'application/json');
      signal?.addEventListener('abort', abort, { once: true });
      request.send(JSON.stringify(body));
    } catch {
      finish(reject, Error('无法开始保存，请刷新后重试。'));
    }
  });
}

export function avatarHTML(account, classes = '') {
  const name = account?.nickname || account?.name || account?.username || '我';
  return `<span class="account-avatar ${esc(classes)}">${account?.hasAvatar ? `<img src="/api/auth/avatar?v=${Number(account.avatarVersion) || 0}" alt="我的头像">` : `<span aria-hidden="true">${esc(Array.from(name)[0])}</span>`}</span>`;
}

export function profileDialog(account, onSaved) {
  const admin = !!account.role,
    name = admin ? account.name : account.nickname;
  return modal(
    '编辑个人资料',
    `<form id="profile-form"><section class="profile-avatar-editor"><div id="profile-avatar-preview">${avatarHTML(account, 'large')}</div><div><label class="button secondary file-button">选择头像<input type="file" id="avatar-file" accept="image/*" aria-label="选择头像照片"></label><button type="button" class="text-btn" id="avatar-reset">恢复默认头像</button><p class="tip">选择照片后可拖动和缩放，自由选取头像区域。</p></div></section>${cropHTML()}${field('昵称', 'nickname', 'text', name, `required maxlength="${admin ? 30 : 24}" autocomplete="nickname" placeholder="大家怎么称呼你"`)}<p class="tip">登录账号 @${esc(account.username)} 保持不变。</p><p id="profile-status" role="status" class="muted"></p><div id="avatar-progress" class="upload-meter" role="progressbar" aria-label="个人资料上传进度" aria-valuemin="0" aria-valuemax="100" hidden><span></span></div>${errorHTML}<button class="button wide" type="submit">保存个人资料</button></form>`,
    (d) => {
      let avatar,
        reading = false,
        closed = false,
        controller,
        crop,
        ticket = 0;
      const file = $('#avatar-file', d),
        save = $('[type=submit]', d),
        reset = $('#avatar-reset', d),
        preview = $('#profile-avatar-preview', d),
        status = $('#profile-status', d),
        meter = $('#avatar-progress', d);
      file.onchange = async () => {
        const selected = file.files?.[0];
        if (!selected || reading) return;
        reading = true;
        const id = ++ticket;
        file.disabled = true;
        save.disabled = true;
        reset.disabled = true;
        crop?.destroy();
        crop = null;
        status.textContent = '正在读取头像…';
        $('.form-error', d).textContent = '';
        try {
          const editor = await mountAvatarCrop(selected, $('#avatar-crop', d), (photo) => {
            if (closed || id !== ticket) return;
            avatar = photo;
            preview.innerHTML = `<span class="account-avatar large"><img src="${photo}" alt="新头像预览"></span>`;
          });
          if (closed || id !== ticket) {
            editor.destroy();
            return;
          }
          crop = editor;
          status.textContent = '可拖动、缩放选取区域，保存后生效。';
        } catch (e) {
          if (!closed) {
            $('.form-error', d).textContent = e.message;
            status.textContent = '未替换原头像，可以重新选图。';
          }
        } finally {
          file.value = '';
          reading = false;
          if (!closed) {
            save.disabled = false;
            reset.disabled = false;
            file.disabled = false;
          }
        }
      };
      reset.onclick = () => {
        ticket++;
        crop?.destroy();
        crop = null;
        avatar = null;
        preview.innerHTML = avatarHTML({ ...account, hasAvatar: false }, 'large');
        status.textContent = '保存后将恢复默认头像。';
      };
      $('[name=nickname]', d).oninput = (e) => {
        if (avatar === null || (avatar === undefined && !account.hasAvatar))
          preview.innerHTML = avatarHTML(
            {
              ...account,
              hasAvatar: false,
              [admin ? 'name' : 'nickname']: e.target.value.trim() || name,
            },
            'large',
          );
      };
      $('#profile-form', d).onsubmit = (e) => {
        if (reading) {
          e.preventDefault();
          return;
        }
        formSubmit(e, async (f) => {
          file.disabled = true;
          reset.disabled = true;
          $('#avatar-crop', d).inert = true;
          status.textContent = avatar ? '正在上传头像并保存资料…' : '正在保存资料…';
          controller = new AbortController();
          meter.hidden = false;
          meter.classList.add('indeterminate');
          meter.removeAttribute('aria-valuenow');
          meter.firstElementChild.style.width = '';
          try {
            const result = await saveProfile(
              { nickname: f.nickname, ...(avatar !== undefined ? { avatar } : {}) },
              {
                signal: controller.signal,
                onProgress: (p) => {
                  if (closed) return;
                  const percentage = p.total ? Math.round((p.loaded / p.total) * 100) : null;
                  meter.classList.toggle('indeterminate', percentage === null);
                  if (percentage !== null) {
                    meter.setAttribute('aria-valuenow', percentage);
                    meter.firstElementChild.style.width = percentage + '%';
                  } else {
                    meter.removeAttribute('aria-valuenow');
                    meter.firstElementChild.style.width = '';
                  }
                  status.textContent =
                    p.phase === 'save'
                      ? '已上传，正在保存资料…'
                      : percentage !== null
                        ? '正在上传 ' + percentage + '%'
                        : '正在上传资料…';
                },
              },
            );
            if (closed) return;
            try {
              await onSaved(result.account);
            } catch {
              closeModal();
              toast('资料已保存，请刷新页面查看');
              return;
            }
            closeModal();
            toast('个人资料已更新');
          } catch (e) {
            if (!closed) {
              status.textContent = '这次未能保存，预览和昵称已保留，可再次保存。';
              throw e;
            }
          } finally {
            if (!closed) {
              file.disabled = false;
              reset.disabled = false;
              $('#avatar-crop', d).inert = false;
              meter.hidden = true;
            }
          }
        });
      };
      return () => {
        closed = true;
        ticket++;
        crop?.destroy();
        controller?.abort();
      };
    },
  );
}
