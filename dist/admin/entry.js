import { api } from '/shared/ui.js';
import { authURL } from '/shared/auth-routing.js';
// A visitor goes straight to login without downloading the management feature graph.
async function enter() {
  try {
    const { account } = await api('/api/auth/me');
    if (!account) {
      location.replace(authURL('admin', 'login', '/' + (location.hash || '#overview')));
      return;
    }
    window.adminInitialAccount = account;
    await import('./app.js');
  } catch (e) {
    window.adminStartup?.fail('暂时无法连接工作台，请检查网络后重试。');
  }
}
enter();
