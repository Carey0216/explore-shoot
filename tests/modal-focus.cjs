const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  let current = null,
    cleaned = 0;
  const trigger = {
    focus() {
      document.activeElement = this;
    },
  };
  global.document = {
    activeElement: trigger,
    querySelector: () => current,
    body: {
      append(d) {
        current = d;
      },
    },
    createElement() {
      const close = {
          onclick: null,
          focus() {
            document.activeElement = this;
          },
        },
        title = {
          focus() {
            document.activeElement = this;
          },
        };
      return {
        handlers: {},
        getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 500 }),
        attributes: {},
        innerHTML: '',
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        querySelector(s) {
          return s === '#dialog-title' ? title : close;
        },
        addEventListener(k, v) {
          this.handlers[k] = v;
        },
        showModal() {
          close.focus();
        },
        close() {},
        remove() {
          current = null;
        },
        title,
        closeButton: close,
      };
    },
  };
  const { modal, closeModal, formSubmit } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(fs.readFileSync('dist/shared/ui.js', 'utf8')).toString('base64')
  );
  const d = modal('标题 <script>', '<p>内容</p>', () => () => cleaned++);
  assert.equal(
    document.activeElement,
    d.title,
    'Opening dialog should focus the heading rather than outline the close button',
  );
  assert.equal(d.attributes['aria-labelledby'], 'dialog-title');
  assert(d.innerHTML.includes('标题 &lt;script&gt;'));
  d.closeButton.onclick();
  assert.equal(current, null);
  assert.equal(document.activeElement, trigger);
  assert.equal(cleaned, 1);
  closeModal();
  assert.equal(cleaned, 1);
  const second = modal('第二个', '', () => () => cleaned++);
  let prevented = false;
  second.handlers.cancel({
    preventDefault() {
      prevented = true;
    },
  });
  assert(prevented);
  assert.equal(current, null);
  assert.equal(document.activeElement, trigger);
  assert.equal(cleaned, 2);
  const drag = modal('拖动文字', '');
  drag.handlers.pointerdown({ target: {}, clientX: 150, clientY: 150 });
  drag.handlers.click({ target: drag, clientX: 600, clientY: 600 });
  assert.equal(current, drag, 'Dragging selection from inside to outside must not dismiss');
  drag.handlers.pointerdown({ target: drag, clientX: 600, clientY: 600 });
  drag.handlers.click({ target: drag, clientX: 600, clientY: 600 });
  assert.equal(current, null, 'A real backdrop press and release still dismisses');
  const originalFormData = global.FormData;
  global.FormData = class {
    *[Symbol.iterator]() {
      yield ['name', 'example'];
    }
  };
  const implicitButton = { disabled: false };
  const error = { textContent: '' };
  const form = { querySelector: (q) => (q === '.form-error' ? error : implicitButton) };
  let saved = 0;
  await formSubmit({ target: form, preventDefault() {} }, async (values) => {
    assert(implicitButton.disabled);
    assert.equal(values.name, 'example');
    saved++;
  });
  assert.equal(saved, 1, 'Implicit submit buttons must still save');
  assert.equal(implicitButton.disabled, false);
  await formSubmit({ target: form, preventDefault() {} }, async () => {
    throw Error('save failed');
  });
  assert.equal(error.textContent, 'save failed');
  assert.equal(implicitButton.disabled, false);
  global.FormData = originalFormData;
  console.log('PASS modal heading focus, accessible title, close/Escape cleanup and return focus');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
