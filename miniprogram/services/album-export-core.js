// Shared byte-for-byte with the native client. Canvas text keeps the author's original copy.
// Image XObjects and classic xref follow ISO 32000-1 §§7.5 and 8.9 (Adobe's public reference).
(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.JingyuAlbumExport = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function wrap(context, text, width, font) {
    context.font = font;
    const lines = [];
    for (const paragraph of String(text || '').split('\n')) {
      let line = '';
      for (const character of Array.from(paragraph)) {
        if (line && context.measureText(line + character).width > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
      lines.push(line);
    }
    return lines;
  }
  function date(value) {
    const time = new Date(value);
    if (!Number.isFinite(time.getTime())) return '';
    const campus = new Date(time.getTime() + 8 * 3600000);
    return (
      campus.getUTCFullYear() +
      '/' +
      String(campus.getUTCMonth() + 1).padStart(2, '0') +
      '/' +
      String(campus.getUTCDate()).padStart(2, '0')
    );
  }
  function layout(context, album, items, page) {
    const width = 640,
      margin = 32,
      gap = 20,
      cellWidth = (width - margin * 2 - gap) / 2;
    const title = wrap(context, album.title, width - margin * 2, '600 30px sans-serif');
    const message = wrap(context, page ? '' : album.message, width - margin * 2, '16px sans-serif');
    let y = 92 + title.length * 40 + (message[0] ? message.length * 25 + 20 : 0) + 36;
    const cells = [];
    for (let i = 0; i < items.length; i += 2) {
      const row = items.slice(i, i + 2).map((item, j) => {
        const place = wrap(context, item.place, cellWidth, '600 17px sans-serif');
        const caption = wrap(context, item.caption, cellWidth, '15px sans-serif');
        return {
          item,
          x: margin + j * (cellWidth + gap),
          y,
          width: cellWidth,
          imageHeight: 206,
          place,
          caption,
          height:
            206 + 20 + place.length * 24 + 24 + (caption[0] ? caption.length * 23 + 10 : 0) + 28,
        };
      });
      cells.push(...row);
      y += Math.max(...row.map((cell) => cell.height)) + 16;
    }
    return {
      width,
      height: Math.max(500, y + 65),
      title,
      message,
      cells,
      page: page || 0,
      theme: album.theme,
    };
  }
  function base(context, plan) {
    context.fillStyle = '#f8f7f2';
    context.fillRect(0, 0, plan.width, plan.height);
    context.textBaseline = 'top';
    context.textAlign = 'left';
    context.fillStyle = '#3a675b';
    context.font = '600 13px sans-serif';
    context.fillText('JINGYU  /  CAMPUS MEMORIES', 32, 32);
    context.fillStyle = '#263631';
    context.font = '600 30px sans-serif';
    plan.title.forEach((line, i) => context.fillText(line, 32, 76 + i * 40));
    let y = 80 + plan.title.length * 40;
    if (plan.message[0]) {
      context.fillStyle = '#626f68';
      context.font = '16px sans-serif';
      plan.message.forEach((line, i) => context.fillText(line, 32, y + i * 25));
    }
    context.fillStyle = '#77857c';
    context.font = '12px sans-serif';
    context.fillText(
      plan.page ? 'JINGYU · ' + (plan.page + 1) : '由我选择，为校园留下的一页。',
      32,
      plan.height - 38,
    );
  }
  function photo(context, cell, image) {
    context.save();
    context.fillStyle = '#e9ece5';
    context.fillRect(cell.x, cell.y, cell.width, cell.imageHeight);
    if (image) {
      const width = image.naturalWidth || image.width,
        height = image.naturalHeight || image.height;
      const scale = Math.min(cell.width / width, cell.imageHeight / height);
      context.drawImage(
        image,
        cell.x + (cell.width - width * scale) / 2,
        cell.y + (cell.imageHeight - height * scale) / 2,
        width * scale,
        height * scale,
      );
    }
    context.fillStyle = '#263631';
    context.font = '600 17px sans-serif';
    let y = cell.y + cell.imageHeight + 16;
    cell.place.forEach((line) => {
      context.fillText(line, cell.x, y);
      y += 24;
    });
    context.fillStyle = '#7a857e';
    context.font = '12px sans-serif';
    context.fillText(date(cell.item.date), cell.x, y + 2);
    y += 28;
    context.fillStyle = '#4d5b53';
    context.font = '15px sans-serif';
    cell.caption.forEach((line) => {
      context.fillText(line, cell.x, y);
      y += 23;
    });
    context.restore();
  }
  const ascii = (value) =>
    Uint8Array.from(Array.from(String(value), (character) => character.charCodeAt(0)));
  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    parts.forEach((p) => {
      out.set(p, at);
      at += p.length;
    });
    return out;
  }
  function pdf(pages) {
    if (!Array.isArray(pages) || !pages.length || pages.length > 12) throw Error('PDF页数无效');
    const parts = [ascii('%PDF-1.4\n'), new Uint8Array([37, 226, 227, 207, 211, 10])],
      offsets = [0];
    let length = parts.reduce((n, p) => n + p.length, 0);
    const add = (id, content) => {
      offsets[id] = length;
      const value = concat([ascii(id + ' 0 obj\n'), ...content, ascii('\nendobj\n')]);
      parts.push(value);
      length += value.length;
    };
    add(1, [ascii('<< /Type /Catalog /Pages 2 0 R >>')]);
    add(2, [
      ascii(
        '<< /Type /Pages /Count ' +
          pages.length +
          ' /Kids [' +
          pages.map((_, i) => 3 + i * 3 + ' 0 R').join(' ') +
          '] >>',
      ),
    ]);
    pages.forEach((page, i) => {
      if (
        !(page.jpeg instanceof Uint8Array) ||
        page.jpeg[0] !== 255 ||
        page.jpeg[1] !== 216 ||
        !(page.width > 0) ||
        !(page.height > 0)
      )
        throw Error('PDF图片无效');
      const id = 3 + i * 3,
        width = 595.28,
        height = Math.round(((width * page.height) / page.width) * 100) / 100;
      const command = ascii('q ' + width + ' 0 0 ' + height + ' 0 0 cm /Im0 Do Q\n');
      add(id, [
        ascii(
          '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
            width +
            ' ' +
            height +
            '] /Resources << /XObject << /Im0 ' +
            (id + 1) +
            ' 0 R >> >> /Contents ' +
            (id + 2) +
            ' 0 R >>',
        ),
      ]);
      add(id + 1, [
        ascii(
          '<< /Type /XObject /Subtype /Image /Width ' +
            page.width +
            ' /Height ' +
            page.height +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
            page.jpeg.length +
            ' >>\nstream\n',
        ),
        page.jpeg,
        ascii('\nendstream'),
      ]);
      add(id + 2, [
        ascii('<< /Length ' + command.length + ' >>\nstream\n'),
        command,
        ascii('endstream'),
      ]);
    });
    const xref = length;
    parts.push(
      ascii(
        'xref\n0 ' +
          offsets.length +
          '\n0000000000 65535 f \n' +
          offsets
            .slice(1)
            .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
            .join('') +
          'trailer\n<< /Size ' +
          offsets.length +
          ' /Root 1 0 R >>\nstartxref\n' +
          xref +
          '\n%%EOF\n',
      ),
    );
    return concat(parts);
  }
  return { wrap, date, layout, base, photo, pdf };
});
