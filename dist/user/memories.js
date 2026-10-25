import { $, api, esc, icon, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
export function mountMemories({ root, state, requireAccount }) {
  const owner = state.account?.id;
  let disposed = false,
    selected = new Map(),
    candidates = [],
    page = 1,
    more = false,
    current = null,
    screen = 0,
    exportURL;
  const alive = () =>
    !disposed && root.isConnected && state.page === 'memories' && state.account?.id === owner;
  const release = () => {
    if (exportURL) URL.revokeObjectURL(exportURL);
    exportURL = null;
  };
  const itemHTML = (item) =>
    `<figure class="memory-photo81"><a href="${esc(item.photo)}" aria-label="查看${esc(item.place)}照片"><img src="${esc(item.photo)}?size=thumb" alt="${esc(item.place)}" loading="lazy"></a><figcaption><strong>${esc(item.place)}</strong><time>${esc(String(item.date || '').slice(0, 10))}</time><p>${esc(item.caption || '')}</p></figcaption></figure>`;
  const run = async () => {
    const stamp = ++screen;
    if (!owner) {
      root.innerHTML =
        '<h1>校园回忆册</h1><p>从自己主动选中的照片里，留住一段校园时光。</p><button class="button" id="memories-login81">登录后开始</button>';
      $('#memories-login81', root).onclick = requireAccount;
      return;
    }
    root.innerHTML = '<h1>校园回忆册</h1><p class="muted" role="status">正在翻开你的回忆…</p>';
    try {
      const data = await api('/api/my/memories');
      if (!alive() || stamp !== screen) return;
      root.innerHTML = `<header class="memory-heading81"><div><a class="text-btn" href="#me">← 我的</a><h1>校园回忆册</h1><p class="muted">只收进你主动选择的照片，默认仅自己可见。</p></div><button class="button" id="memory-new81">${icon('plus')} 新建回忆册</button></header><div class="memory-albums81">${data.items
        .map(
          (a) =>
            `<button class="memory-cover81" data-album="${a.id}"><div class="memory-cover-photos81">${a.items
              .slice(0, 4)
              .map((i) =>
                i.available
                  ? `<img src="${esc(i.photo)}?size=thumb" alt="">`
                  : '<span>照片已不可用</span>',
              )
              .join(
                '',
              )}</div><strong>${esc(a.title)}</strong><span>${a.items.length} 张照片 · 仅自己可见</span></button>`,
        )
        .join(
          '',
        )}</div>${!data.items.length ? '<section class="empty"><h2>把一学期，装进一本回忆</h2><p>选择自己的照片与打卡，添上地点、日期和想留下的话。</p><button class="button secondary" id="memory-empty81">开始挑选照片</button></section>' : ''}`;
      $('#memory-new81', root).onclick = () => editor();
      $('#memory-empty81', root)?.addEventListener('click', () => editor());
      root
        .querySelectorAll('[data-album]')
        .forEach((b) => (b.onclick = () => view(b.dataset.album)));
    } catch (e) {
      if (alive() && stamp === screen) {
        root.innerHTML = `<h1>校园回忆册</h1><p role="alert">${esc(e.message)}</p><button class="button" id="memory-retry81">重试</button>`;
        $('#memory-retry81', root).onclick = run;
      }
    }
  };
  const loadCandidates = async () => {
    const data = await api('/api/my/memories/candidates?page=' + page);
    if (!alive()) return;
    const known = new Set(candidates.map((i) => i.mediaId));
    candidates.push(...data.items.filter((i) => !known.has(i.mediaId)));
    more = data.hasMore;
  };
  const drawChoices = () => {
    const host = $('#memory-choices81', root);
    if (!host) return;
    host.innerHTML =
      candidates
        .map(
          (item) =>
            `<label class="memory-choice81 ${selected.has(item.mediaId) ? 'chosen' : ''}"><img src="${esc(item.photo)}?size=thumb" alt="${esc(item.place)}" loading="lazy"><input type="checkbox" aria-label="选择${esc(item.place)}，${esc(String(item.date || '').slice(0, 10))}" data-memory-photo="${item.mediaId}" ${selected.has(item.mediaId) ? 'checked' : ''}><span>${esc(item.place)}</span><small>${esc(String(item.date || '').slice(0, 10))}</small></label>`,
        )
        .join('') || '<p class="muted">还没有自己的照片，先从一处校园机位开始打卡吧。</p>';
    host.querySelectorAll('[data-memory-photo]').forEach(
      (input) =>
        (input.onchange = () => {
          const id = input.dataset.memoryPhoto;
          if (input.checked) {
            if (selected.size >= 24) {
              input.checked = false;
              toast('每本最多24张照片');
              return;
            }
            const source = candidates.find((i) => i.mediaId === id);
            selected.set(id, { ...source, caption: '' });
          } else selected.delete(id);
          input.closest('label').classList.toggle('chosen', input.checked);
          drawSelected();
        }),
    );
    $('#memory-more81', root).hidden = !more;
  };
  const drawSelected = () => {
    $('#memory-count81', root).textContent = `已选择 ${selected.size} / 24 张`;
    $('#memory-selected81', root).innerHTML = [...selected.values()]
      .map(
        (i, index) =>
          `<article class="memory-selected-row81"><img src="${esc(i.photo)}?size=thumb" alt=""><label><span>${index + 1}. ${esc(i.place)} · ${esc(String(i.date || '').slice(0, 10))}</span><textarea data-caption="${i.mediaId}" maxlength="140" rows="2" placeholder="写一句想留下的话，可留空">${esc(i.caption || '')}</textarea></label><button class="icon-btn" type="button" data-memory-move="${i.mediaId}" ${index ? '' : 'disabled'} aria-label="将这张照片前移">↑</button><button class="icon-btn" type="button" data-memory-remove="${i.mediaId}" aria-label="从回忆册移除照片">×</button></article>`,
      )
      .join('');
    root.querySelectorAll('[data-caption]').forEach(
      (input) =>
        (input.oninput = () => {
          const item = selected.get(input.dataset.caption);
          if (item) item.caption = input.value;
        }),
    );
    root.querySelectorAll('[data-memory-remove]').forEach(
      (b) =>
        (b.onclick = () => {
          selected.delete(b.dataset.memoryRemove);
          drawSelected();
          drawChoices();
        }),
    );
    root.querySelectorAll('[data-memory-move]').forEach(
      (b) =>
        (b.onclick = () => {
          const entries = [...selected.entries()],
            index = entries.findIndex(([id]) => id === b.dataset.memoryMove);
          if (index > 0)
            [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]];
          selected = new Map(entries);
          drawSelected();
        }),
    );
  };
  const editor = async (album) => {
    ++screen;
    current = album || null;
    selected = new Map((album?.items || []).map((i) => [i.mediaId, { ...i }]));
    candidates = [];
    page = 1;
    more = false;
    root.innerHTML = `<a class="text-btn" href="#memories" id="memory-list81">← 回忆册</a><h1>${album ? '编辑回忆册' : '把校园，收进回忆'}</h1><form id="memory-form81"><div class="memory-fields81"><label>主题<select name="theme"><option value="semester">一学期的校园</option><option value="graduation">毕业回忆</option><option value="custom">我的校园故事</option></select></label><label>影集名称<input name="title" maxlength="80" required value="${esc(album?.title || '一学期的校园')}"></label><label class="memory-message81">扉页留言<textarea name="message" maxlength="500" rows="3" placeholder="想对这段时光说些什么？">${esc(album?.message || '')}</textarea></label></div><div class="section-title73"><h2>主动选中，才会加入</h2><span id="memory-count81"></span></div><p class="muted">不会自动选中照片，也不会带入打卡里的私人感受和定位。</p><div class="memory-choices81" id="memory-choices81" role="group" aria-label="选择自己的照片"></div><button class="button secondary" type="button" id="memory-more81" hidden>更多本人照片</button><h2>排列照片，写下留言</h2><div id="memory-selected81"></div>${errorHTML}<div class="button-row"><button class="button" type="submit">保存回忆册</button><button class="text-btn" type="button" id="memory-cancel81">返回列表</button></div></form>`;
    const form = $('#memory-form81', root);
    form.elements.theme.value = album?.theme || 'semester';
    form.elements.theme.onchange = () => {
      if (['一学期的校园', '毕业回忆', '我的校园故事'].includes(form.elements.title.value))
        form.elements.title.value = {
          semester: '一学期的校园',
          graduation: '毕业回忆',
          custom: '我的校园故事',
        }[form.elements.theme.value];
    };
    $('#memory-list81', root).onclick = (e) => {
      e.preventDefault();
      void run();
    };
    $('#memory-cancel81', root).onclick = run;
    $('#memory-more81', root).onclick = async function () {
      this.disabled = true;
      page++;
      try {
        await loadCandidates();
        if (alive() && form.isConnected) drawChoices();
      } catch (e) {
        page--;
        toast(e.message);
      } finally {
        this.disabled = false;
      }
    };
    form.onsubmit = (e) =>
      formSubmit(e, async (values) => {
        if (!alive()) throw Error('账号已改变');
        if (!selected.size) throw Error('请主动选择至少一张照片');
        const body = {
          title: values.title,
          theme: values.theme,
          message: values.message,
          items: [...selected.values()].map(({ mediaId, caption }) => ({ mediaId, caption })),
        };
        if (current) body.revision = current.revision;
        const saved = await api(
          '/api/my/memories' + (current ? '/' + current.id : ''),
          current ? 'PUT' : 'POST',
          body,
        );
        if (alive() && form.isConnected) await view(saved.id);
      });
    drawSelected();
    try {
      await loadCandidates();
      if (alive() && form.isConnected) drawChoices();
    } catch (e) {
      if (alive() && form.isConnected)
        $('#memory-choices81', root).innerHTML = `<p role="alert">${esc(e.message)}</p>`;
    }
  };
  const view = async (id) => {
    const stamp = ++screen;
    try {
      const album = await api('/api/my/memories/' + id);
      if (!alive() || stamp !== screen) return;
      release();
      root.innerHTML = `<header class="memory-heading81"><div><button class="text-btn" id="memory-back81">← 回忆册</button><h1>${esc(album.title)}</h1><p class="muted">${album.items.length} 张本人照片 · 默认私密</p></div><div class="button-row"><button class="button secondary" id="memory-edit81">编辑</button><button class="text-btn" id="memory-delete81">删除回忆册</button></div></header><p class="memory-opening81" data-user-content>${esc(album.message)}</p><div class="memory-gallery81">${album.items.map((i) => (i.available ? itemHTML(i) : '<p>照片已不可用，请编辑后再导出。</p>')).join('')}</div><section class="memory-export81"><h2>留在相册，也留在手边</h2><p class="muted">导出只包含这本回忆册里主动选中的照片、地点、日期和留言。</p><div class="button-row"><button class="button" data-memory-export="image">导出长图</button><button class="button secondary" data-memory-export="pdf">导出 PDF</button></div><p id="memory-export-status81" role="status"></p></section>`;
      $('#memory-back81', root).onclick = run;
      $('#memory-edit81', root).onclick = () => editor(album);
      $('#memory-delete81', root).onclick = () =>
        modal(
          '删除这本回忆册？',
          '<p>只移除回忆册的编排，原始照片与打卡记录会保留。</p><button class="button danger wide" id="memory-confirm-delete81">删除回忆册</button>',
          (d) => {
            $('#memory-confirm-delete81', d).onclick = async function () {
              this.disabled = true;
              try {
                await api('/api/my/memories/' + album.id, 'DELETE', { revision: album.revision });
                closeModal();
                if (alive()) void run();
              } catch (e) {
                this.disabled = false;
                toast(e.message);
              }
            };
          },
        );
      root.querySelectorAll('[data-memory-export]').forEach(
        (button) =>
          (button.onclick = async () => {
            const buttons = [...root.querySelectorAll('[data-memory-export]')];
            buttons.forEach((b) => (b.disabled = true));
            const status = $('#memory-export-status81', root);
            status.textContent = '正在准备照片…';
            try {
              const latest = await api('/api/my/memories/' + album.id);
              if (!alive()) return;
              const { exportMemory, saveMemoryFile } = await import('./memory-export.js');
              const format = button.dataset.memoryExport;
              const blob = await exportMemory(latest, format, {
                alive: () => alive() && status.isConnected,
                progress: (done, total) => {
                  if (alive()) status.textContent = `正在整理 ${done} / ${total} 张照片…`;
                },
              });
              if (!alive() || !status.isConnected) return;
              saveMemoryFile(blob, latest.title, format);
              status.textContent = '已生成，可保存到设备。';
              if (format === 'image') {
                release();
                exportURL = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = exportURL;
                link.textContent = '打开长图预览';
                link.className = 'text-btn';
                link.onclick = (e) => {
                  e.preventDefault();
                  modal(
                    '回忆册长图',
                    `<img class="memory-export-preview81" src="${exportURL}" alt="回忆册长图">`,
                  );
                };
                status.append(document.createTextNode(' '), link);
              }
            } catch (e) {
              if (alive()) status.textContent = e.message;
            } finally {
              if (alive()) buttons.forEach((b) => (b.disabled = false));
            }
          }),
      );
    } catch (e) {
      if (alive()) toast(e.message);
    }
  };
  void run();
  return () => {
    disposed = true;
    release();
  };
}
