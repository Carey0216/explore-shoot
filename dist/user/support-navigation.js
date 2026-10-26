import { assistantGuidance } from '/shared/assistant-guidance.js';
import { showFeatureTour, tourIsOpen } from '/shared/feature-tour.js';
import { getPreferenceAccountId } from '/shared/preferences.js';

let cancelPending;
export function followAssistantLink(link, close) {
  cancelPending?.();
  const steps = assistantGuidance(link),
    owner = getPreferenceAccountId();
  close();
  if (!steps.length) {
    location.hash = link.path;
    return;
  }
  let finished = false,
    scheduled = false;
  const finish = () => {
    finished = true;
    observer.disconnect();
    clearTimeout(timer);
    window.removeEventListener('hashchange', routeChanged);
  };
  const ready = () => {
    if (finished || scheduled || location.hash !== link.path) return;
    const target = document.querySelector(steps[0].web);
    if (
      !target ||
      !target.getClientRects().length ||
      document.querySelector('#main[aria-busy="true"]')
    )
      return;
    scheduled = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        scheduled = false;
        if (finished || location.hash !== link.path || owner !== getPreferenceAccountId())
          return finish();
        if (tourIsOpen()) return;
        finish();
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        showFeatureTour({
          label: '助手带你继续',
          showGuides: false,
          endLabel: '完成检查',
          steps: steps.map((s) => [s.web, s.icon, s.title, s.copy]),
        });
      }),
    );
  };
  const routeChanged = () => (location.hash === link.path ? ready() : finish());
  const observer = new MutationObserver(ready);
  const timer = setTimeout(finish, 30000);
  observer.observe(document.querySelector('#main'), {
    childList: true,
    subtree: true,
    attributes: true,
  });
  window.addEventListener('hashchange', routeChanged);
  cancelPending = finish;
  location.hash = link.path;
  ready();
}
