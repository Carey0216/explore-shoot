import { $, api, modal, closeModal, esc, toast, formSubmit, errorHTML } from '/shared/ui.js';

export async function publishEntry({ state, authDialog, render }) {
  if (!state.account) return authDialog();
  if (state.account.scoutStatus === 'approved') {
    location.hash = 'publish';
    return;
  }
  const owner = state.account.id;
  try {
    const status = await api('/api/scout/quiz');
    if (state.account?.id !== owner) return;
    modal(
      '成为校园探索官',
      `<div class="publish-gate"><h2>您目前还不是校园探索官</h2><p class="muted">完成5道社区规范题，答对3题即可解锁。每人共5次机会，开始即计一次，答卷15分钟有效。</p><p>剩余 ${status.remaining} 次机会</p>${status.remaining ? '<button class="button" id="start-scout-quiz">答题解锁发布</button>' : ''}<a class="button secondary" href="#me" id="scout-manual-apply">向管理员申请</a></div>`,
      (d) => {
        $('#scout-manual-apply', d).onclick = closeModal;
        $('#start-scout-quiz', d)?.addEventListener('click', async (e) => {
          e.target.disabled = true;
          try {
            const paper = await api('/api/scout/quiz/start', 'POST', {});
            if (state.account?.id !== owner) return;
            modal(
              '社区规范小测',
              `<form id="scout-paper">${paper.questions.map((q, i) => `<fieldset><legend>${i + 1}. ${esc(q.title)}</legend><div class="quiz-options">${q.options.map((o, n) => `<label><input required type="radio" name="${esc(q.id)}" value="${n}"><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`).join('')}${errorHTML}<button class="button wide" type="submit">提交答卷</button></form>`,
              (next) => {
                $('#scout-paper', next).onsubmit = (e) =>
                  formSubmit(e, async (f) => {
                    if (state.account?.id !== owner) throw Error('登录账号已改变');
                    const answers = Object.fromEntries(
                      Object.entries(f).map(([k, v]) => [k, Number(v)]),
                    );
                    const result = await api('/api/scout/quiz/submit', 'POST', {
                      id: paper.id,
                      answers,
                    });
                    if (state.account?.id !== owner) return;
                    if (result.passed) {
                      state.account = (await api('/api/auth/me')).account;
                      closeModal();
                      await render();
                      toast('已通过！探索官资格与站内通知已更新');
                      location.hash = 'publish';
                    } else {
                      closeModal();
                      toast(`答对${result.score}题，尚未通过，剩余${result.remaining}次机会`);
                      await publishEntry({ state, authDialog, render });
                    }
                  });
              },
            );
          } catch (error) {
            if (d.isConnected) {
              e.target.disabled = false;
              toast(error.message);
            }
          }
        });
      },
    );
  } catch (e) {
    toast(e.message);
  }
}
