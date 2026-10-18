import {
  $,
  esc,
  api,
  icon,
  toast,
  formSubmit,
  field,
  errorHTML,
  prepareDraftPhoto,
  discardDraftPhoto,
  photoUploadStatus,
  modal,
  closeModal,
} from '/shared/ui.js';
import { campusMap, inCampus } from '/shared/map.js';
import { bindDraftForm } from '/shared/drafts.js';

// 点位发布、文字/照片草稿与地图选点。业务规则与权限由 Java 接口处理。
export function createPublishPages({
  state,
  loginGate,
  authDialog,
  heading,
  applyScout,
  accountDraft,
  draftPhoto,
  pointDialog,
}) {
  async function publishPage() {
    if (!state.account) {
      $('#main').innerHTML = loginGate(
        '分享发现，先认识一下',
        '注册普通账号后可申请校园探索官；填写有效邀请码可直接加入。',
      );
      $('#gate-login').onclick = () => authDialog('register');
      return;
    }
    if (state.account.scoutStatus !== 'approved') {
      $('#main').innerHTML =
        `${heading()}<div class="empty"><h2>成为校园探索官，再分享新发现</h2><p>${state.account.scoutStatus === 'pending' ? '你的申请正在审核中。' : '发布权限会在管理员通过申请后开启。'}</p>${state.account.scoutStatus === 'pending' ? '<a href="#me" class="button secondary">查看申请状态</a>' : '<button class="button" id="publish-apply">申请成为校园探索官</button>'}</div>`;
      $('#publish-apply')?.addEventListener('click', applyScout);
      return;
    }
    const ownerId = state.account.id;
    let photo = null,
      coord = null;
    $('#main').innerHTML =
      `<section class="compose-page"><header class="compose-header"><a class="icon-btn" href="#discover" aria-label="返回社区">${icon('close')}</a><span>发布发现</span><button type="button" class="text-btn" id="compose-preview">预览</button></header><form class="compose-form" id="publish-form" novalidate><button class="compose-photo" type="button" id="publish-photo" aria-label="拍摄或选择点位照片">${icon('camera')}<strong>把新发现放进这里</strong><span>拍一张，或从相册选一张</span><small>一张真实照片，就可以开始分享</small></button><p class="compose-photo-tip">先留下画面，再说说这里为什么值得来。</p><input class="compose-title" name="name" required maxlength="60" aria-label="发现标题" placeholder="给这个发现取个名字"><textarea class="compose-description" name="description" required minlength="5" maxlength="1200" rows="4" aria-label="发现描述" placeholder="这里有什么打动你？光线、角度，或是一个小惊喜…"></textarea><div class="compose-tags" role="group" aria-label="选择发现分类">${['建筑', '自然', '人文', '运动'].map((t) => `<button type="button" data-compose-theme="${t}"># ${t}</button>`).join('')}</div><select name="theme" aria-label="发现分类" hidden><option>建筑</option><option>自然</option><option>人文</option><option>运动</option></select><details class="compose-row" id="compose-location"><summary>${icon('pin')}<span><b>这个发现在哪里</b><small id="picked-coordinate">点一下，在校园地图上标记</small></span><i>⌄</i></summary><div id="publish-map" class="map-canvas publish-map"></div><button type="button" class="text-btn" id="compose-map-retry" hidden>重试加载地图</button><p class="muted">在安全公共区域标记地点，可连续点选调整。</p></details><details class="compose-row" id="compose-condition"><summary>${icon('sun')}<span><b>通行与拍摄提醒</b><small id="compose-condition-summary">开放时间、好光线、需要注意的地方</small></span><i>⌄</i></summary><textarea name="condition" required maxlength="500" rows="3" aria-label="通行与拍摄条件" placeholder="比如：从东侧公共步道进入，下午有侧光；请勿踩踏草坪。"></textarea></details><details class="compose-row"><summary>${icon('people')}<span><b>公开 · 所有人可见</b><small>管理员会核对资料与内容</small></span><i>⌄</i></summary><p class="muted">发布后会标注社区共创；管理员确认后显示认证。仅上传原创或获授权照片，不公开他人隐私。</p></details>${errorHTML}<div class="compose-actions"><button class="compose-draft" type="button" id="compose-save-draft">${icon('book')}<span>存草稿</span></button><button class="button compose-submit" type="submit">${icon('plus')} 发布这个发现</button></div></form></section>`;
    const form = $('#publish-form'),
      draft = accountDraft('publish'),
      photoDraft = accountDraft('publish-photo');
    let map,
      ready = false,
      submissionId;
    const photoButton = $('#publish-photo'),
      coordinateLabel = $('#picked-coordinate');
    const showCoord = (p) => {
      coord = p;
      coordinateLabel.textContent = p ? '位置已标记 · 点击展开可调整' : '点一下，在校园地图上标记';
      map?.pick(p);
    };
    const binding = bindDraftForm(form, draft, ['name', 'description', 'theme', 'condition'], {
      noun: '点位文字与位置',
      onRestore: (data) => {
        if (data.coordinate && inCampus(data.coordinate, state.catalog.campus))
          showCoord(data.coordinate);
        submissionId = data.submissionId;
      },
      onDiscard: async () => {
        showCoord(null);
        submissionId = null;
        await discardDraftPhoto(photoDraft);
        photo = null;
        photoButton.innerHTML =
          icon('camera') +
          '<strong>把新发现放进这里</strong><span>拍一张，或从相册选一张</span><small>一张真实照片，就可以开始分享</small>';
      },
    });
    const draftHint = form.querySelector('.draft-notice>small');
    if (draftHint) {
      const details = document.createElement('details');
      details.className = 'compose-draft-help';
      details.innerHTML = '<summary>草稿与隐私说明</summary>';
      details.append(draftHint);
      form.querySelector('.draft-notice').append(details);
    }
    state.publishBinding = binding;
    await binding.ready;
    if (!form.isConnected) return;
    ready = true;
    try {
      const restored = await photoDraft.read();
      if (!form.isConnected) return;
      if (restored.photo) {
        photo = {
          ...(restored.uploaded || {}),
          url: restored.photo,
          preview: restored.photo,
          local: !restored.uploaded?.id,
        };
        photoButton.innerHTML = `<img src="${esc(restored.photo)}" alt="恢复的点位照片"><small>${restored.uploaded?.id ? '本机照片已恢复 · 提交时检查原临时上传' : '照片草稿仅保存在本机 · 发布时上传'} · 点击可更换</small>`;
      }
    } catch {
      toast('照片草稿读取失败，请勿关闭尚未提交的页面');
    }
    photoButton.onclick = () =>
      draftPhoto(
        async (m) => {
          if (!form.isConnected || state.account?.id !== ownerId)
            throw Error('请回到当前账号的发布页面后重试');
          photo = m;
          if (!m) {
            photoButton.innerHTML =
              icon('camera') +
              '<strong>把新发现放进这里</strong><span>拍一张，或从相册选一张</span><small>一张真实照片，就可以开始分享</small>';
            return;
          }
          photoButton.innerHTML = `<img src="${esc(m.url)}" alt="待发布的点位照片"><small>${m.locallySaved === false ? '照片暂留当前页面，请及时提交' : '照片仅存本机，发布时上传'} · 点击更换</small>`;
        },
        'publish-photo',
        { keepDraft: true },
      );
    form.onsubmit = (e) =>
      formSubmit(e, async (f) => {
        if (!form.isConnected || state.account?.id !== ownerId)
          throw Error('页面或账号已改变，请重新提交');
        if (!photo) throw Error('请先添加点位照片');
        if (!f.name.trim()) {
          form.elements.name.focus();
          throw Error('给这个发现取个名字吧');
        }
        if (f.description.trim().length < 5) {
          form.elements.description.focus();
          throw Error('再写一点发现吧，至少5个字');
        }
        if (!f.condition.trim()) {
          $('#compose-condition').open = true;
          form.elements.condition.focus();
          throw Error('补充一句通行与拍摄提醒，帮助后来的人');
        }
        if (!coord) {
          $('#compose-location').open = true;
          throw Error('请在校园地图上标记这个发现');
        }
        submissionId ||= crypto.randomUUID();
        await draft.update({ fields: f, coordinate: coord, submissionId }).catch(() => {});
        const selected = photo,
          accountId = state.account?.id;
        const uploaded = await prepareDraftPhoto(photoDraft, {
          fallback: selected,
          onProgress: (p) => {
            if (form.isConnected && photo === selected)
              photoButton.querySelector('small').textContent = photoUploadStatus(p);
          },
        });
        if (!form.isConnected || state.account?.id !== accountId || photo !== selected)
          throw Error('页面、账号或照片已改变，请重新提交');
        if (!uploaded) throw Error('请先添加点位照片');
        photo = uploaded;
        photoButton.innerHTML = `<img src="${esc(uploaded.preview)}" alt="待发布的点位照片"><small>临时照片尚未发布 · 点击更换</small>`;
        const point = await api('/api/points', 'POST', {
          ...f,
          ...coord,
          mediaId: uploaded.id,
          submissionId,
        });
        await Promise.all([binding.clear(), photoDraft.clear({ submitted: true })]).catch(() =>
          toast('点位已发布，但本机草稿未能清理，请稍后丢弃。'),
        );
        try {
          state.catalog = await api('/api/catalog');
        } catch {
          state.catalog.points = state.catalog.points
            .filter((p) => p.id !== point.id)
            .concat(point);
          toast('点位已发布，列表同步暂时中断，联网后会刷新');
        }
        state.theme = '全部';
        state.query = '';
        location.hash = 'discover';
        toast('新发现已发布，等待管理员认证');
        pointDialog(point.id);
      });
    const syncTheme = () =>
      form
        .querySelectorAll('[data-compose-theme]')
        .forEach((b) =>
          b.classList.toggle('active', b.dataset.composeTheme === form.elements.theme.value),
        );
    syncTheme();
    form.querySelectorAll('[data-compose-theme]').forEach(
      (b) =>
        (b.onclick = () => {
          form.elements.theme.value = b.dataset.composeTheme;
          form.dispatchEvent(new Event('change', { bubbles: true }));
          syncTheme();
        }),
    );
    form.elements.condition.addEventListener('input', () => {
      $('#compose-condition-summary').textContent =
        form.elements.condition.value.trim() || '开放时间、好光线、需要注意的地方';
    });
    $('#compose-save-draft').onclick = async () => {
      try {
        await draft.update({
          fields: Object.fromEntries(new FormData(form)),
          coordinate: coord,
          submissionId,
        });
        await Promise.all([draft.flush(), photoDraft.flush()]);
        toast('草稿已保存在本机，下次可以继续');
      } catch {
        toast('草稿保存失败，请先不要关闭页面');
      }
    };
    $('#compose-preview').onclick = () =>
      modal(
        '发布预览',
        `<article class="compose-preview">${photo ? `<img src="${esc(photo.preview || photo.url)}" alt="待发布照片">` : '<p class="muted">还没有选择照片</p>'}<span class="pill">${esc(form.elements.theme.value)} · 社区共创</span><h2>${esc(form.elements.name.value || '还没取名字的发现')}</h2><p>${esc(form.elements.description.value || '用自己的话，分享这个角落。')}</p><small>${esc(form.elements.condition.value || '通行与拍摄提醒待补充')}</small><p class="muted">${coord ? '位置已标记' : '尚未标记位置'} · 预览不会发布内容</p></article><button type="button" id="compose-return" class="button wide">继续编辑</button>`,
        (d) => {
          $('#compose-return', d).onclick = closeModal;
        },
      );
    const el = $('#publish-map');
    let loading = false;
    const loadMap = async () => {
      if (map || loading || !form.isConnected) return;
      loading = true;
      $('#compose-map-retry').hidden = true;
      try {
        map = await campusMap(el, state.catalog, {
          canPick: () => ready && !form.querySelector('[type=submit]').disabled,
          onPick: (p) => {
            if (!inCampus(p, state.catalog.campus)) {
              toast('请在校园内的公共区域标记位置');
              return false;
            }
            showCoord(p);
            draft.reopen();
            draft.update({ coordinate: p }).catch(() => {});
          },
        });
        if (el.isConnected) {
          state.map = map;
          if (coord) map.pick(coord);
        } else map.destroy();
      } catch (e) {
        if (el.isConnected) {
          coordinateLabel.textContent = '地图暂时不可用，草稿会保留。' + e.message;
          $('#compose-map-retry').hidden = false;
        }
      } finally {
        loading = false;
      }
    };
    $('#compose-location').ontoggle = () => {
      if ($('#compose-location').open) void loadMap();
    };
    $('#compose-map-retry').onclick = () => void loadMap();
  }
  return { publishPage };
}
