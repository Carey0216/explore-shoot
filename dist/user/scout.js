import { mountScoutPaper } from './scout-paper.js';
import { requestCelebration } from '/shared/celebrations.js';
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
            modal('社区规范小测', '<form id="scout-paper"></form>', (next) => {
              next.classList.add('scout-quiz-dialog');
              return mountScoutPaper(next, paper, async (answers) => {
                if (state.account?.id !== owner) throw Error('登录账号已改变');
                const result = await api('/api/scout/quiz/submit', 'POST', {
                  id: paper.id,
                  answers,
                });
                if (state.account?.id !== owner) return;
                if (result.passed) {
                  state.account = (await api('/api/auth/me')).account;
                  await render();
                  modal(
                    '欢迎成为校园探索官',
                    `<section class="scout-success"><span class="scout-success-icon" aria-hidden="true">✦</span><h2>校园里的新发现，等你来分享</h2><p>你已通过社区规范小测，现在可以发布校园发现。</p><p class="muted">真实记录、尊重隐私，一起照顾好这片校园。</p><button class="button wide" id="scout-start-publish">开始我的第一次发布</button></section>`,
                    (welcome) => {
                      welcome.classList.add('scout-success-dialog');
                      $('#scout-start-publish', welcome).onclick = () => {
                        closeModal();
                        location.hash = 'publish';
                      };
                      void requestCelebration(
                        'scout-passed',
                        { page: 'publish', account: state.account },
                        () => welcome.isConnected && state.account?.id === owner,
                      );
                    },
                  );
                } else {
                  modal(
                    '本次小测已完成',
                    `<div class="publish-gate"><h2>再了解一点，一起出发</h2><p>本次答对 ${Number(result.score)} 题，达到3题即可通过。</p><p class="muted">剩余 ${Number(result.remaining)} 次机会。没有显示逐题答案，你可以再熟悉一下社区规范。</p><button class="button" id="scout-result-return">返回</button></div>`,
                    (resultDialog) => {
                      $('#scout-result-return', resultDialog).onclick = () => {
                        closeModal();
                        void publishEntry({ state, authDialog, render });
                      };
                    },
                  );
                }
              });
            });
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
