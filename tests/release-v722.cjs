const assert = require('node:assert/strict');
const fs = require('node:fs');
let serial = 0;
async function load(file, bindings = {}) {
  global.__v722 = bindings;
  const source = fs.readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(
        `const {${Object.keys(bindings).join(',')}}=globalThis.__v722;\n` +
          source +
          `\n// ${serial++}`,
      ).toString('base64')
  );
}
(async () => {
  const events = new Map();
  const document = {
    documentElement: { dataset: {} },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name, fn) => {
      if (events.get(name) === fn) events.delete(name);
    },
  };
  const { controlPopover } = await load('dist/shared/popover-controller.js', {
    document,
    matchMedia: () => ({ matches: false }),
  });
  let opened = false,
    focus = 0,
    animations = [],
    changes = [];
  const button = {
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    contains: (node) => node === button,
    focus: () => focus++,
  };
  const panel = {
    setAttribute(k, v) {
      this[k] = v;
    },
    classList: { add() {} },
    matches: () => opened,
    showPopover: () => {
      opened = true;
    },
    hidePopover: () => {
      opened = false;
    },
    contains: (node) => node === panel,
    animate() {
      let finish;
      const result = {
        finished: new Promise((resolve) => {
          finish = resolve;
        }),
        cancel() {},
        finish: () => finish(),
      };
      animations.push(result);
      return result;
    },
  };
  const controller = controlPopover(button, panel, { onChange: (open) => changes.push(open) });
  assert.equal(panel.popover, 'manual', 'Browser light-dismiss cannot race the trigger');
  button.onclick();
  events.get('pointerdown')({ target: button });
  assert(controller.isOpen());
  button.onclick();
  const oldClose = animations.at(-1);
  button.onclick();
  oldClose.finish();
  await Promise.resolve();
  assert(opened && controller.isOpen(), 'A stale close cannot hide a rapid reopen');
  events.get('pointerdown')({ target: panel });
  assert(controller.isOpen());
  events.get('pointerdown')({ target: {} });
  animations.at(-1).finish();
  await Promise.resolve();
  assert(!opened && !controller.isOpen());
  document.documentElement.dataset.motion = 'reduce';
  button.onclick();
  events.get('keydown')({ key: 'Escape' });
  assert(!opened);
  assert.equal(focus, 1);
  controller.destroy();
  assert.equal(events.size, 0);
  assert.equal(button.onclick, null);
  assert.deepEqual(changes, [true, false, true, false, true, false]);

  const resizeEvents = new Map(),
    visualEvents = new Map();
  const eventSurface = (events) => ({
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  });
  let anchorRight = 935,
    menuOpen = false,
    menuPosition,
    destroyed = 0;
  const menuButton = {
    setAttribute() {},
    getBoundingClientRect: () => ({ right: anchorRight, bottom: 48 }),
  };
  const menuPanel = { style: {}, setAttribute() {}, querySelectorAll: () => [] };
  const menuDocument = {
    querySelector: () => null,
    createElement: () => menuPanel,
    body: { append() {} },
  };
  const { bindAccountMenu } = await load('dist/user/account-menu.js', {
    document: menuDocument,
    window: { ...eventSurface(resizeEvents), visualViewport: eventSurface(visualEvents) },
    innerWidth: 1440,
    innerHeight: 900,
    $: (selector) => (selector === '#account-open' ? menuButton : {}),
    esc: (value) => value,
    icon: () => '',
    avatarHTML: () => '',
    controlPopover: (_button, _panel, { position }) => {
      menuPosition = position;
      return { isOpen: () => menuOpen, destroy: () => destroyed++ };
    },
  });
  bindAccountMenu({ state: { account: { nickname: '测试', username: 'test' } } });
  menuOpen = true;
  menuPosition();
  assert.equal(menuPanel.style.left, '647px');
  anchorRight = 350;
  resizeEvents.get('resize')();
  assert.equal(
    menuPanel.style.left,
    '62px',
    'An open menu follows its anchor when the window narrows',
  );
  assert.equal(visualEvents.size, 1);
  bindAccountMenu({ state: { account: null } });
  assert.equal(resizeEvents.size, 0);
  assert.equal(visualEvents.size, 0);
  assert.equal(destroyed, 1);

  const { originalImageURL, installImageRecovery } = await load('dist/shared/image-loading.js', {
    document,
  });
  assert.equal(originalImageURL('/media/a?size=thumb&v=2'), '/media/a?v=2');
  assert.equal(originalImageURL('/shared/nmu-building.jpg?size=thumb'), '/shared/nmu-building.jpg');
  for (const value of [
    'https://other.test/a?size=thumb',
    '//other.test/a?size=thumb',
    '/admin/a?size=thumb',
    '/media/a?size=full',
  ])
    assert.equal(originalImageURL(value), '');
  installImageRecovery();
  const image = {
    tagName: 'IMG',
    dataset: {},
    getAttribute: () => '/media/a?size=thumb',
    closest: () => null,
  };
  events.get('error')({ target: image });
  assert.equal(image.src, '/media/a');
  assert.equal(image.loading, 'eager');
  image.src = 'unchanged';
  events.get('error')({ target: image });
  assert.equal(image.src, 'unchanged', 'Original fallback happens only once');

  const { safeTarget } = await load('dist/shared/rich-message.js');
  const { supportAnswerLinks } = await load('dist/user/support-chat.js', { safeTarget });
  assert.deepEqual(
    supportAnswerLinks({
      sources: [
        { title: '拍摄指南', path: '#guides' },
        { title: '坏链接', path: 'javascript:alert(1)' },
      ],
      places: [{ id: 'nmu1', name: '图书馆' }],
    }),
    [
      { title: '图书馆', path: '#place/nmu1' },
      { title: '拍摄指南', path: '#guides' },
    ],
  );
  let copied, toastMessage;
  const { pointShareURL, copyPointLink, paintQR } = await load('dist/user/place-share.js', {
    navigator: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        },
      },
    },
    toast: (message, options) => {
      toastMessage = { message, ...options };
    },
  });
  const url = pointShareURL({ id: 'nmu1' }, 'https://example.test/admin/');
  assert.equal(url, 'https://example.test/#place/nmu1?shared=1');
  assert.throws(() => pointShareURL({ id: '../private' }, 'https://example.test'));
  assert.throws(() => pointShareURL({ id: 'nmu1' }, 'javascript:alert(1)'));
  await copyPointLink(url);
  assert.equal(copied, url);
  assert.deepEqual(toastMessage, { message: '链接已复制', center: true });
  const vendor = await load('dist/shared/vendor/qr/qrcodegen.js');
  const qr = vendor.qrcodegen.QrCode.encodeText(url, vendor.qrcodegen.QrCode.Ecc.MEDIUM);
  const rectangles = [];
  const ctx = {
    fillStyle: '',
    fillRect(...rect) {
      rectangles.push({ color: this.fillStyle, rect });
    },
  };
  paintQR(ctx, qr, 48, 958, 216);
  const unit = rectangles[1].rect[2];
  assert(Number.isInteger(unit) && unit > 0);
  for (const {
    color,
    rect: [x, y, w, h],
  } of rectangles.slice(1)) {
    assert.equal(color, '#000');
    assert.equal(w, unit);
    assert.equal(h, unit);
    assert(x >= 48 + 4 * unit && y >= 958 + 4 * unit, 'QR retains a four-module quiet zone');
  }
  console.log('v7.2.2 popover race, image fallback, public sharing and QR checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
