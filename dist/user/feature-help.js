import { featureDemo } from '/shared/feature-demos.js';
import { showFeatureTour, tourIsOpen } from '/shared/feature-tour.js';
import { getPreferenceAccountId } from '/shared/preferences.js';

export function installFeatureHelp(launcher, panel, hide) {
  const hint = document.createElement('span');
  hint.className = 'feature-help-hint';
  hint.hidden = true;
  hint.setAttribute('aria-hidden', 'true');
  document.body.append(hint);
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'support-plan-entry feature-help-replay';
  replay.hidden = true;
  panel.querySelector('.support-transcript').before(replay);
  let route,
    timer,
    hintTimer,
    shown = false;
  const seen = new Set();
  const english = () => document.documentElement.lang.startsWith('en');
  const page = () => location.hash.slice(1).split(/[/?]/)[0];
  const cancel = () => {
    clearTimeout(timer);
    clearTimeout(hintTimer);
    hint.hidden = true;
  };
  const modalActive = () =>
    tourIsOpen() ||
    document.hidden ||
    document.querySelector(
      'dialog[open], .activity-reward-island, .message-island812:not([hidden])',
    ) ||
    document.activeElement?.matches('input, textarea, select, [contenteditable]') ||
    launcher.getAttribute('aria-expanded') === 'true' ||
    launcher.hidden ||
    !launcher.getClientRects().length;
  const play = () => {
    const demo = featureDemo(page(), english());
    if (!demo) return;
    const key = `jingyu-feature-demo:${getPreferenceAccountId() || 'guest'}:${page()}`;
    hide();
    cancel();
    if (
      !showFeatureTour({
        steps: [[demo.web, demo.icon, demo.title, demo.copy, demo.actions]],
        label: english() ? 'Quick demo' : '操作演示',
        endLabel: english() ? 'Done' : '开始体验',
        showGuides: false,
      })
    )
      return;
    seen.add(key);
    try {
      localStorage.setItem(key, 'seen');
    } catch {
      /* Keep this session's state. */
    }
    shown = true;
  };
  replay.onclick = play;
  const enter = () => {
    const current = location.hash;
    if (route !== current) {
      cancel();
      route = current;
      shown = false;
    }
    const demo = featureDemo(page(), english());
    replay.hidden = !demo;
    replay.textContent = english() ? 'Forgot a step? Watch the demo' : '忘了怎么做？看操作演示';
    if (!demo || shown) return;
    const key = `jingyu-feature-demo:${getPreferenceAccountId() || 'guest'}:${page()}`;
    let experienced = seen.has(key);
    try {
      experienced ||= localStorage.getItem(key) === 'seen';
    } catch {
      /* Storage is optional. */
    }
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        if (modalActive() || location.hash !== current || !document.querySelector(demo.web)) return;
        if (!experienced) return play();
        const rect = launcher.getBoundingClientRect();
        hint.textContent = english() ? 'Need a quick demo?' : '忘了怎么做？';
        hint.style.right = Math.max(6, innerWidth - rect.left + 8) + 'px';
        hint.style.bottom = innerHeight - rect.bottom + (rect.height - 30) / 2 + 'px';
        hint.hidden = false;
        shown = true;
        hintTimer = setTimeout(() => {
          hint.hidden = true;
        }, 3200);
      },
      experienced ? 5000 : 800,
    );
  };
  document.addEventListener('campus:page-ready', enter);
  document.addEventListener('campus:tour-closed', enter);
  for (const event of [
    'pointerdown',
    'input',
    'keydown',
    'wheel',
    'touchstart',
    'visibilitychange',
    'campus:modal-open',
  ])
    document.addEventListener(event, cancel, { capture: true, passive: true });
  window.addEventListener('hashchange', () => {
    cancel();
    replay.hidden = true;
    enter();
  });
  enter();
}
