import { $, api, esc, toast, errorHTML, formSubmit } from '/shared/ui.js';
export const quizPage = () =>
  '<section class="panel" id="quiz-admin"><p>正在打开题库…</p></section>';
export async function bindQuiz() {
  const host = $('#quiz-admin');
  if (!host) return;
  try {
    const data = await api('/api/admin/scout-quiz');
    if (!host.isConnected) return;
    let questions = data.questions;
    const draw = () => {
      host.innerHTML = `<h2>探索官社区规范题库</h2><p class="muted">每次随机5题，答对3题通过。开始、退出和过期均计入5次机会；用尽后仅可人工申请。题库修改不改变已发出的答卷。</p><form id="quiz-bank"><div class="stack">${questions.map((q, i) => `<fieldset data-question="${i}"><legend>第${i + 1}题 · ${esc(q.id)}</legend><label>题目<input name="title-${i}" required maxlength="200" value="${esc(q.title)}"></label>${q.options.map((o, n) => `<label>选项${n + 1}<input name="option-${i}-${n}" required maxlength="150" value="${esc(o)}"></label>`).join('')}<label>正确答案<select name="answer-${i}">${q.options.map((_, n) => `<option value="${n}" ${q.answer === n ? 'selected' : ''}>选项${n + 1}</option>`).join('')}</select></label><button type="button" class="text-btn" data-remove-question="${i}">移除此题</button></fieldset>`).join('')}</div>${errorHTML}<div class="confirm-toolbar"><button type="button" id="add-quiz-question" class="button secondary">添加题目</button><button class="button" type="submit">确认修改</button></div></form>`;
      const form = $('#quiz-bank', host);
      const read = () =>
        questions.map((q, i) => ({
          ...q,
          title: form.elements[`title-${i}`].value,
          options: q.options.map((_, n) => form.elements[`option-${i}-${n}`].value),
          answer: Number(form.elements[`answer-${i}`].value),
        }));
      $('#add-quiz-question', host).onclick = () => {
        questions = read();
        questions.push({
          id: crypto.randomUUID(),
          title: '',
          options: ['', '', '', ''],
          answer: 0,
        });
        draw();
      };
      host.querySelectorAll('[data-remove-question]').forEach(
        (b) =>
          (b.onclick = () => {
            questions = read();
            questions.splice(Number(b.dataset.removeQuestion), 1);
            draw();
          }),
      );
      form.onsubmit = (e) =>
        formSubmit(e, async () => {
          await api('/api/admin/scout-quiz', 'PUT', { questions: read(), revision: data.revision });
          toast('题库已保存');
          await bindQuiz();
        });
    };
    draw();
  } catch (e) {
    if (host.isConnected) host.innerHTML = `<p role="alert">${esc(e.message)}</p>`;
  }
}
