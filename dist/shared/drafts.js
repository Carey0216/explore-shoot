// 本机草稿：按账号和具体记录隔离，不包含密码、登录令牌或定位轨迹。
export const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
let database;
function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(Error('浏览器不支持本机草稿'));
    const request = indexedDB.open('explore-shoot-drafts', 1);
    const timer = setTimeout(() => reject(Error('本机草稿存储暂时不可用')), 5000);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'key' });
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      clearTimeout(timer);
      reject(Error('请关闭其他旧页面后重试'));
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = null;
      };
      resolve(db);
    };
  }).catch((e) => {
    database = null;
    throw e;
  });
  return database;
}
export const browserDraftStorage = {
  async run(mode, work) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = work(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('本机存储失败'));
    });
  },
  get(key) {
    return this.run('readonly', (s) => s.get(key));
  },
  put(record) {
    return this.run('readwrite', (s) => s.put(record));
  },
  remove(key) {
    return this.run('readwrite', (s) => s.delete(key));
  },
  async prune(now) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'),
        store = tx.objectStore('drafts');
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          if (!c.value.updatedAt || now - c.value.updatedAt > DRAFT_TTL) c.delete();
          c.continue();
        }
      };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error || Error('草稿整理失败'));
    });
  },
};

// 顺序提交存储操作：清除不会被之前尚未完成的自动保存“复活”。
export function createDraftStore(storage = browserDraftStorage, now = () => Date.now()) {
  const contexts = new Map();
  return (accountId, context) => {
    if (!accountId || !context) throw Error('草稿需要已登录账号和记录编号');
    const key = JSON.stringify([String(accountId), String(context)]);
    if (contexts.has(key)) return contexts.get(key);
    let data = {},
      updatedAt = null,
      loaded = false,
      sealed = false,
      queue = Promise.resolve();
    const listeners = new Set();
    const notify = (phase, error) =>
      listeners.forEach((fn) => fn({ phase, updatedAt, error, hasData: !!updatedAt }));
    const enqueue = (work) => {
      const next = queue.then(work);
      queue = next.catch(() => {});
      return next;
    };
    const load = async () => {
      if (loaded) return;
      const record = await storage.get(key);
      if (record && now() - record.updatedAt <= DRAFT_TTL) {
        data = record.data;
        updatedAt = record.updatedAt;
      } else if (record) await storage.remove(key);
      loaded = true;
    };
    const draft = {
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      read() {
        return enqueue(async () => {
          try {
            await load();
            notify(updatedAt ? 'restored' : 'empty');
            return structuredClone(data);
          } catch (e) {
            notify('error', e);
            throw e;
          }
        });
      },
      update(patch) {
        if (sealed) return Promise.resolve(false);
        notify('saving');
        return enqueue(async () => {
          if (sealed) return false;
          try {
            await load();
            const next = { ...data, ...structuredClone(patch) },
              stamp = now();
            await storage.put({ key, data: next, updatedAt: stamp });
            data = next;
            updatedAt = stamp;
            notify('saved');
            return true;
          } catch (e) {
            notify('error', e);
            throw e;
          }
        });
      },
      clear({ submitted = false } = {}) {
        if (submitted) sealed = true;
        return enqueue(async () => {
          try {
            await storage.remove(key);
            data = {};
            updatedAt = null;
            loaded = true;
            notify(submitted ? 'submitted' : 'empty');
          } catch (e) {
            notify('error', e);
            throw e;
          }
        });
      },
      // 提交后的记录再次被编辑时，建立新的草稿生命周期。
      reopen() {
        sealed = false;
      },
      flush() {
        return queue;
      },
    };
    contexts.set(key, draft);
    return draft;
  };
}
export const localDraft = createDraftStore();
export function pruneDrafts() {
  return browserDraftStorage.prune(Date.now()).catch(() => {});
}

export function draftNotice(
  draft,
  { noun = '文字', submittedLabel = '已提交到账号', emptyLabel } = {},
) {
  const box = document.createElement('section');
  box.className = 'draft-notice';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const hint = document.createElement('small');
  hint.textContent =
    '仅在当前浏览器、当前网址保存 7 天，不会自动提交。清除浏览器数据会删除草稿。公共设备使用后请丢弃草稿。';
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.className = 'text-btn draft-discard';
  discard.textContent = '丢弃草稿';
  discard.hidden = true;
  box.append(status, discard, hint);
  const unsubscribe = draft.subscribe(({ phase, updatedAt }) => {
    box.dataset.state = phase;
    discard.hidden = !updatedAt;
    status.textContent =
      phase === 'saving'
        ? `正在将${noun}保存到本机…`
        : phase === 'error'
          ? '本机保存失败：请勿关闭页面，可直接提交或稍后重试。'
          : phase === 'submitted'
            ? submittedLabel
            : phase === 'empty'
              ? emptyLabel || `未提交的${noun}将自动保存在本机`
              : `${phase === 'restored' ? '已恢复本机草稿' : noun + '已保存到本机'} · ${new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · 尚未提交`;
  });
  status.textContent = '正在检查本机草稿…';
  return { box, discard, unsubscribe };
}

export function bindDraftForm(
  form,
  draft,
  names,
  { onRestore = () => {}, onDiscard = () => {}, noun = '文字', emptyLabel } = {},
) {
  draft.reopen();
  const notice = draftNotice(draft, { noun, emptyLabel });
  form.prepend(notice.box);
  const controls = names.map((name) => form.elements.namedItem(name)).filter(Boolean);
  const submit = form.querySelector('[type=submit]');
  let ready = false,
    disposed = false;
  controls.forEach((c) => (c.disabled = true));
  if (submit) submit.disabled = true;
  const readFields = () => Object.fromEntries(controls.map((c) => [c.name, c.value]));
  const save = () => {
    if (ready && !disposed) {
      draft.reopen();
      draft.update({ fields: readFields() }).catch(() => {});
    }
  };
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  const loaded = draft
    .read()
    .then(async (data) => {
      if (disposed || !form.isConnected) return;
      for (const c of controls)
        if (Object.hasOwn(data.fields || {}, c.name)) c.value = data.fields[c.name];
      await onRestore(data);
    })
    .catch(() => {})
    .finally(() => {
      ready = true;
      controls.forEach((c) => (c.disabled = false));
      if (submit) submit.disabled = false;
    });
  notice.discard.onclick = async () => {
    if (!ready || submit?.disabled) return;
    ready = false;
    try {
      await draft.clear();
      form.reset();
      await onDiscard();
    } catch {
      /* Notice explains failure; retain visible content. */
    } finally {
      ready = true;
    }
  };
  return {
    ready: loaded,
    clear: () => draft.clear({ submitted: true }),
    destroy() {
      disposed = true;
      notice.unsubscribe();
      form.removeEventListener('input', save);
      form.removeEventListener('change', save);
    },
  };
}
