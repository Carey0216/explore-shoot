import { $, esc, api, icon, toast, formSubmit, field, errorHTML } from '/shared/ui.js';
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
    let photoId = null,
      coord = null;
    $('#main').innerHTML =
      `${heading()}<div class="publish-layout"><form class="publish-form" id="publish-form"><button class="photo-upload" type="button" id="publish-photo" style="width:100%">${icon('camera')}<span>拍一张，或选择点位照片</span><small>展示现场真实画面，避免无关配图</small></button>${field('给这个地方起个名字', 'name', 'text', '', 'required maxlength="60" placeholder="例如：图书馆东侧的光影长廊"')}<label>发现了什么？<textarea name="description" required minlength="5" maxlength="1200" placeholder="介绍这个地方、推荐角度和适合前往的时间…"></textarea></label><label>点位主题<select name="theme"><option>建筑</option><option>自然</option><option>人文</option><option>运动</option></select></label><label>通行与拍摄条件<textarea name="condition" required maxlength="500" placeholder="说明开放情况、注意事项，以及适合拍摄的公共区域…"></textarea></label><label>在地图上点选准确位置</label><div id="publish-map" class="map-canvas publish-map"></div><p id="picked-coordinate" class="muted">点击校园内的位置，放下你的点位标记。</p><div class="notice">发布后即刻可见，并标注「由社区共创者上传，请自行分辨」。管理员审核通过后显示「已经过认证」。</div>${errorHTML}<button class="button wide" type="submit">发布我的发现</button></form><aside class="publish-aside"><h2>Look closer.</h2><h3>你发现的，也许是别人错过的。</h3><p>一段走廊，一个转角，<br>或者熟悉建筑里的新光线。</p><ul><li>使用自己拍摄的现场照片</li><li>位置标记尽量准确</li><li>尊重学校通行与拍摄规定</li><li>不公开他人的私人信息</li></ul></aside></div>`;
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
      coordinateLabel.textContent = p
        ? `已选择：${p.lng.toFixed(6)}, ${p.lat.toFixed(6)} · WGS84`
        : '点击校园内的位置，放下你的点位标记。';
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
        await photoDraft.clear();
        photoId = null;
        photoButton.innerHTML =
          icon('camera') +
          '<span>拍一张，或选择点位照片</span><small>展示现场真实画面，避免无关配图</small>';
      },
    });
    state.publishBinding = binding;
    await binding.ready;
    if (!form.isConnected) return;
    ready = true;
    try {
      const photo = await photoDraft.read();
      if (!form.isConnected) return;
      if (photo.photo) {
        photoId = photo.uploaded?.id || null;
        photoButton.innerHTML = `<img src="${esc(photo.photo)}" alt="恢复的点位照片"><small>${photoId ? '照片已上传，点位尚未发布' : '照片仅存本机 · 点击恢复并上传'} · 点击可更换</small>`;
      }
    } catch {
      toast('照片草稿读取失败，请勿关闭尚未提交的页面');
    }
    photoButton.onclick = () =>
      draftPhoto(
        async (m) => {
          if (!form.isConnected) throw Error('请回到发布页面后重试');
          photoId = m.id;
          photoButton.innerHTML = `<img src="${esc(m.url)}" alt="待发布的点位照片"><small>照片已上传，点位尚未发布 · 点击更换</small>`;
        },
        'publish-photo',
        { keepDraft: true },
      );
    form.onsubmit = (e) =>
      formSubmit(e, async (f) => {
        if (!photoId) throw Error('请先添加照片，或点击恢复的照片完成上传');
        if (!coord) throw Error('请在地图上选择点位位置');
        submissionId ||= crypto.randomUUID();
        await draft.update({ fields: f, coordinate: coord, submissionId }).catch(() => {});
        const point = await api('/api/points', 'POST', {
          ...f,
          ...coord,
          mediaId: photoId,
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
    const el = $('#publish-map');
    try {
      map = await campusMap(el, state.catalog, {
        canPick: () => ready && !form.querySelector('[type=submit]').disabled,
        onPick: (p) => {
          if (!inCampus(p, state.catalog.campus)) {
            toast('请在北方民族大学校内选择位置');
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
      if (el.isConnected)
        coordinateLabel.textContent =
          '地图暂时不可用，文字草稿仍可保存。请刷新后继续：' + e.message;
    }
  }
  return { publishPage };
}
