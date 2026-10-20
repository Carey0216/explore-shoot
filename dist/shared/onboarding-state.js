// Audience/account separated, browser-local history. A new browser gets the complete tour.
export function onboardingState(audience, account, storage = localStorage) {
  const id = account?.id || 'guest';
  const base = `explore-tour:${audience}:${id}`;
  return {
    experienced() {
      try {
        if (storage.getItem(base + ':seen')) return true;
        if (audience === 'user')
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (
              key?.startsWith('explore-onboarding:') &&
              key.endsWith(':' + id) &&
              storage.getItem(key) === 'done'
            )
              return true;
          }
      } catch {
        /* Storage is optional. */
      }
      return false;
    },
    seen(version) {
      try {
        return storage.getItem(base + ':update:' + version) === 'seen';
      } catch {
        return false;
      }
    },
    finish(version) {
      try {
        storage.setItem(base + ':seen', 'yes');
        if (version) storage.setItem(base + ':update:' + version, 'seen');
      } catch {}
    },
  };
}
