const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
(async () => {
  const { parseResponse, uploadPhoto, readPhoto } = await import(
    'data:text/javascript;base64,' +
      fs.readFileSync(path.join(__dirname, '../dist/shared/ui.js')).toString('base64')
  );
  assert.deepEqual(parseResponse('{"id":"photo"}', 201), { id: 'photo' });
  assert.throws(() => parseResponse('<html>Gateway unavailable</html>', 503), /服务连接暂时中断/);
  assert.throws(() => parseResponse('', 200), /服务返回内容异常/);
  assert.throws(
    () => parseResponse('{"error":"登录已失效"}', 401),
    (e) => e.status === 401 && e.message === '登录已失效',
  );
  let request;
  global.location = { href: 'https://test.trycloudflare.com/#active' };
  global.XMLHttpRequest = class {
    constructor() {
      this.upload = {};
      request = this;
    }
    open(method, url) {
      assert.equal(method, 'POST');
      assert.equal(url, 'https://test.trycloudflare.com/api/media');
    }
    setRequestHeader() {}
    send(body) {
      assert.equal(JSON.parse(body).photo, 'data:image/jpeg;base64,test');
      assert.match(JSON.parse(body).submissionId, /^[a-f0-9-]{36}$/);
    }
    abort() {
      this.onabort();
    }
  };
  const progress = [];
  let pending = uploadPhoto('data:image/jpeg;base64,test', { onProgress: (p) => progress.push(p) });
  request.upload.onprogress({ loaded: 25, total: 100, lengthComputable: true });
  request.upload.onload();
  request.status = 201;
  request.responseText = '{"id":"saved"}';
  request.onload();
  assert.deepEqual(await pending, { id: 'saved' });
  assert.equal(progress[1].loaded / progress[1].total, 0.25);
  assert.equal(progress[2].phase, 'save');
  pending = uploadPhoto('data:image/jpeg;base64,test');
  request.status = 502;
  request.responseText = '<html>Bad gateway</html>';
  request.onload();
  await assert.rejects(pending, /服务连接暂时中断/);
  pending = uploadPhoto('data:image/jpeg;base64,test');
  request.status = 201;
  request.responseText = 'null';
  request.onload();
  await assert.rejects(pending, /服务器未确认照片保存/);
  pending = uploadPhoto('data:image/jpeg;base64,test');
  request.onerror();
  await assert.rejects(pending, /上传中断/);
  pending = uploadPhoto('data:image/jpeg;base64,test');
  request.ontimeout();
  await assert.rejects(pending, /上传超时/);
  const controller = new AbortController();
  pending = uploadPhoto('data:image/jpeg;base64,test', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
  controller.abort();
  await assert.rejects(
    uploadPhoto('data:image/jpeg;base64,test', { signal: controller.signal }),
    (e) => e.name === 'AbortError',
  );
  // Safari fallback: bitmap decoding can fail even when Image can decode the same file.
  global.createImageBitmap = async () => {
    throw new Error('The string did not match the expected pattern.');
  };
  global.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,test';
      this.onload();
    }
  };
  global.Image = class {
    naturalWidth = 2200;
    naturalHeight = 1100;
    set src(value) {
      assert.ok(value.startsWith('data:image/'));
      this.onload();
    }
  };
  let canvas;
  global.document = {
    createElement: () =>
      (canvas = {
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/jpeg;base64,compressed',
      }),
  };
  assert.equal(await readPhoto({ size: 100 }), 'data:image/jpeg;base64,compressed');
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 800);
  assert.equal(
    await readPhoto({ size: 100 }, { maxSize: 512, square: true }),
    'data:image/jpeg;base64,compressed',
  );
  assert.equal(canvas.width, 512);
  assert.equal(canvas.height, 512);
  global.Image = class {
    set src(value) {
      this.onerror();
    }
  };
  await assert.rejects(readPhoto({ size: 100 }), /格式无法读取/);
  await assert.rejects(readPhoto({ size: 21 * 1024 * 1024 }), /20MB/);
  console.log(
    'Photo client checks passed: real byte progress, save phase, gateway/network/timeout/cancel errors and image decoder fallback.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
