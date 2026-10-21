import { $, esc, errorHTML, formSubmit } from '/shared/ui.js';

export function quizSession(paper) {
  let index = 0;
  const answers = {};
  return {
    get index() {
      return index;
    },
    get question() {
      return paper.questions[index];
    },
    get answers() {
      return { ...answers };
    },
    get complete() {
      return paper.questions.every((q) => Number.isInteger(answers[q.id]));
    },
    choose(value) {
      if (!Number.isInteger(value) || value < 0 || value >= paper.questions[index].options.length)
        throw Error('请选择有效选项');
      answers[paper.questions[index].id] = value;
    },
    move(delta) {
      index = Math.max(0, Math.min(paper.questions.length - 1, index + delta));
    },
  };
}

export function mountScoutPaper(dialog, paper, submit) {
  const session = quizSession(paper),
    form = $('#scout-paper', dialog);
  let timer,
    disposed = false,
    submitting = false;
  const draw = (focus = true) => {
    const q = session.question,
      n = session.index,
      last = n === paper.questions.length - 1;
    form.innerHTML = `<div class="quiz-progress"><span role="status">第 ${n + 1} / ${paper.questions.length} 题</span><span>已选 ${Object.keys(session.answers).length} 题</span><progress value="${Object.keys(session.answers).length}" max="${paper.questions.length}" aria-label="答题进度"></progress></div><fieldset class="quiz-question"><legend tabindex="-1">${esc(q.title)}</legend><p class="quiz-hint">选择一项后进入下一题，提交前可返回修改。</p><div class="quiz-options">${q.options.map((text, i) => `<label class="quiz-option"><input type="radio" name="answer" value="${i}" ${session.answers[q.id] === i ? 'checked' : ''}><span class="quiz-option-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${esc(text)}</span></label>`).join('')}</div></fieldset>${errorHTML}<footer class="quiz-footer"><button type="button" class="button secondary" data-quiz-prev ${n ? '' : 'disabled'}>上一题</button><span>${last ? '<button class="button" type="submit" data-quiz-submit ' + (session.complete ? '' : 'hidden') + '>提交答卷</button>' : '<button type="button" class="button secondary" data-quiz-next ' + (session.answers[q.id] === undefined ? 'disabled' : '') + '>下一题</button>'}</span></footer>`;
    form.dataset.direction = 'forward';
    if (focus) $('.quiz-question legend', form).focus({ preventScroll: true });
    $('.dialog-body', dialog).scrollTop = 0;
    $('[data-quiz-prev]', form).onclick = () => {
      clearTimeout(timer);
      session.move(-1);
      draw();
      form.dataset.direction = 'back';
    };
    $('[data-quiz-next]', form)?.addEventListener('click', () => {
      clearTimeout(timer);
      session.move(1);
      draw();
    });
  };
  form.onchange = (e) => {
    if (submitting || e.target.name !== 'answer') return;
    session.choose(Number(e.target.value));
    clearTimeout(timer);
    if (session.index < paper.questions.length - 1) {
      $('[data-quiz-next]', form).disabled = false;
      timer = setTimeout(() => {
        if (!disposed) {
          session.move(1);
          draw();
        }
      }, 230);
    } else $('[data-quiz-submit]', form).hidden = !session.complete;
  };
  form.onsubmit = (e) => {
    if (submitting) {
      e.preventDefault();
      return;
    }
    clearTimeout(timer);
    return formSubmit(e, async () => {
      if (!session.complete) throw Error('请完成全部题目');
      submitting = true;
      form.querySelectorAll('input,button').forEach((el) => (el.disabled = true));
      try {
        await submit(session.answers);
      } finally {
        submitting = false;
        if (!disposed && dialog.isConnected) {
          draw(false);
        }
      }
    });
  };
  draw(false);
  return () => {
    disposed = true;
    clearTimeout(timer);
  };
}
