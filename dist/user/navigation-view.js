import { $, icon } from '/shared/ui.js';

export function navigationViewHTML() {
  return `<section id="navigation-view" class="navigation-view" hidden aria-label="全屏步行导航"><div class="navigation-turn glass-surface"><b id="navigation-arrow" aria-hidden="true">↑</b><div><span class="navigation-kicker">校园轻导航</span><p id="navigation-cue" aria-live="polite">正在获取位置…</p></div></div><button id="navigation-exit" class="button secondary navigation-exit" aria-label="结束导航">${icon('close')}</button><div class="navigation-bottom glass-surface"><div class="navigation-destination"><span>正在前往</span><b id="navigation-destination"></b></div><div class="navigation-remaining"><strong id="navigation-time"></strong><span id="navigation-distance"></span><small id="navigation-eta"></small></div><div class="navigation-meter" role="progressbar" aria-label="导航进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="navigation-progress"></span></div><div class="navigation-buttons"><button id="navigation-recenter" class="button secondary">${icon('pin')} 跟随位置</button><button id="navigation-voice" class="button secondary">语音提示：关</button><button id="navigation-maps" class="button secondary" aria-label="选择地图">${icon('map')}</button></div><p class="navigation-local-note">轨迹仅留在本次导航，结束即清除。</p></div></section>`;
}

// Keep the existing SDK canvas alive. A fixed viewport also works on iPhone,
// where a browser cannot promise to remove Safari's own toolbar.
export function mountNavigationView({ onExit, onRecenter, onVoice, onMaps, onResize }) {
  const root = $('#journey-layout'),
    view = $('#navigation-view');
  let active = false,
    focus = null,
    inert = [];
  const set = (id, text) => {
    $('#' + id).textContent = text;
  };
  function resize() {
    onResize?.(active);
  }
  function enter(destination) {
    if (active) return;
    active = true;
    focus = document.activeElement;
    inert = [
      ...document.querySelectorAll(
        '#sidebar,#topbar,#mobile-nav,.app-shell>footer,.mobile-publish,.journey-heading,.journey-data,.outing-tabs',
      ),
    ].map((node) => [node, node.inert]);
    inert.forEach(([node]) => (node.inert = true));
    root.classList.add('is-navigating');
    document.body.classList.add('journey-navigating');
    view.hidden = false;
    set('navigation-destination', destination.name);
    view.querySelector('.navigation-local-note').hidden = false;
    $('#navigation-exit').focus({ preventScroll: true });
    resize();
  }
  function leave() {
    if (!active) return;
    active = false;
    view.hidden = true;
    root.classList.remove('is-navigating');
    document.body.classList.remove('journey-navigating');
    inert.forEach(([node, value]) => (node.inert = value));
    inert = [];
    resize();
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  }
  function render({
    instruction,
    symbol,
    time,
    distance,
    progress = 0,
    following = true,
    voice = false,
  }) {
    set('navigation-cue', instruction);
    set('navigation-arrow', symbol || '↑');
    set('navigation-time', time);
    set('navigation-distance', distance);
    set('navigation-voice', '语音提示：' + (voice ? '开' : '关'));
    const minutes = Number.parseInt(time, 10);
    set(
      'navigation-eta',
      Number.isFinite(minutes)
        ? new Date(Date.now() + minutes * 60000).toLocaleTimeString(
            document.documentElement.lang || 'zh-CN',
            { hour: '2-digit', minute: '2-digit' },
          )
        : '',
    );
    const percentage = Math.max(0, Math.min(100, progress));
    $('#navigation-progress').style.width = percentage + '%';
    $('#navigation-progress').parentElement.setAttribute(
      'aria-valuenow',
      String(Math.round(percentage)),
    );
    $('#navigation-recenter').setAttribute('aria-pressed', String(following));
    $('#navigation-recenter').innerHTML = icon('pin') + (following ? ' 跟随中' : ' 回到我的位置');
  }
  $('#navigation-exit').onclick = onExit;
  $('#navigation-recenter').onclick = onRecenter;
  $('#navigation-voice').onclick = onVoice;
  $('#navigation-maps').onclick = onMaps;
  const key = (e) => {
    if (active && e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      onExit();
    }
  };
  document.addEventListener('keydown', key);
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  return {
    enter,
    leave,
    render,
    get active() {
      return active;
    },
    destroy() {
      leave();
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    },
  };
}
