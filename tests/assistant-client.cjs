const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const form = { elements: { question: { value: '图书馆怎么拍' }, generate: { checked: true } } };
  const button = {},
    error = {},
    note = {},
    result = { innerHTML: '', textContent: '', querySelectorAll: () => [] };
  form.querySelector = () => button;
  const dialog = {
    isConnected: true,
    close() {
      this.isConnected = false;
    },
  };
  const elements = {
    '#campus-question': form,
    '#campus-answer': result,
    '#assistant-provider-note': note,
    '.form-error': error,
  };
  let complete;
  const requests = [];
  global.__assistantTest = {
    $: (selector) => elements[selector],
    api(path, method, body) {
      requests.push({ path, method, body });
      return path.endsWith('capabilities')
        ? Promise.resolve({ generationAvailable: true })
        : new Promise((resolve) => (complete = resolve));
    },
    esc: (value) =>
      String(value).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      ),
    modal: () => dialog,
  };
  const source = fs
    .readFileSync('dist/shared/campus-assistant.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const module = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const featureVisible=()=>true;const {$,api,esc,modal}=globalThis.__assistantTest;\n' +
          source,
      ).toString('base64')
  );
  module.openCampusAssistant();
  await Promise.resolve();
  assert.equal(form.elements.generate.disabled, false);
  const pending = form.onsubmit({ preventDefault() {} });
  assert.equal(requests[1].body.question, '图书馆怎么拍');
  assert.equal(requests[1].body.generate, true);
  complete({
    mode: 'generated',
    answer: '<script>bad()</script>',
    notices: ['<img>'],
    places: [],
    sources: [
      {
        title: '<b>标题</b>',
        excerpt: '<img onerror=bad>',
        path: 'javascript:alert(1)',
        sourceUrl: 'javascript:bad',
      },
    ],
  });
  await pending;
  assert(result.innerHTML.includes('AI依据资料整理'));
  assert(result.innerHTML.includes('&lt;script&gt;'));
  assert(!result.innerHTML.includes('<script>'));
  assert(!result.innerHTML.includes('href="javascript:'));
  const late = form.onsubmit({ preventDefault() {} });
  dialog.close();
  const before = result.innerHTML;
  complete({ mode: 'retrieved', answer: 'late', sources: [], places: [], notices: [] });
  await late;
  assert.equal(result.innerHTML, before);
  delete global.__assistantTest;
  console.log(
    'PASS campus assistant: opt-in generation, escaped evidence, safe source links and no late update after closing.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
