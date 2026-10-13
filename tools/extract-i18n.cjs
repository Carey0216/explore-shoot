const fs = require('node:fs'),
  path = require('node:path'),
  acorn = require('acorn'),
  { parseFragment } = require('parse5');
const root = path.resolve(__dirname, '..'),
  output = path.join(root, 'dist/shared/messages-generated.js');
function existing() {
  const result = new Map();
  for (const name of ['messages.js', 'messages-extra.js']) {
    const text = fs.readFileSync(path.join(root, 'dist/shared', name), 'utf8'),
      rows = text.match(/(?:const rows|export const extraRows)=`([\s\S]*?)`;/)?.[1];
    if (!rows) throw Error('文案表格式无效');
    for (const row of rows.trim().split(/\r?\n/)) {
      const [source, ...targets] = row.split('|');
      result.set(source, targets);
    }
  }
  return result;
}
function extract(source, type = 'js') {
  const texts = new Set(),
    add = (text) => {
      text = String(text).replace(/\s+/g, ' ').trim();
      if (
        /[\u3400-\u9fff]/.test(text) &&
        text.length <= 500 &&
        !/[<>]|\$\{|\n/.test(text) &&
        text !== '北方民族大学' &&
        !/^北方民族大学 · 校园探索试点 v[\d.]+$/.test(text) &&
        !/^[\w/.-]+\.(?:jpg|md|js|png)$/.test(text)
      )
        texts.add(text);
    };
  function html(value) {
    const walk = (node) => {
      if (
        node.attrs?.some((a) => a.name === 'data-i18n-skip') ||
        ['script', 'style', 'svg', 'canvas'].includes(node.tagName)
      )
        return;
      if (node.nodeName === '#text') add(node.value);
      for (const attr of node.attrs || [])
        if (['placeholder', 'title', 'aria-label', 'alt'].includes(attr.name)) add(attr.value);
      for (const child of node.childNodes || []) walk(child);
    };
    walk(parseFragment(value));
  }
  if (type === 'html') html(source);
  else {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Literal' && typeof node.value === 'string') {
        if (node.value.includes('<')) html(node.value);
        else add(node.value);
      }
      if (node.type === 'TemplateLiteral') {
        let text = '';
        node.quasis.forEach((part, i) => {
          text += part.value.cooked || part.value.raw;
          if (i < node.expressions.length) text += '{v' + i + '}';
        });
        if (text.includes('<')) html(text);
        else add(text);
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'quasis') continue;
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') walk(value);
      }
    }
    walk(ast);
  }
  return texts;
}
function candidates() {
  const texts = new Set();
  function visit(folder) {
    for (const item of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
      const file = path.posix.join(folder, item.name);
      if (item.isDirectory()) {
        if (item.name === 'vendor') continue;
        visit(file);
        continue;
      }
      if (!/\.(js|html)$/.test(item.name) || /^(messages|startup)/.test(item.name)) continue;
      for (const text of extract(
        fs.readFileSync(path.join(root, file), 'utf8'),
        item.name.endsWith('.html') ? 'html' : 'js',
      ))
        texts.add(text);
    }
  }
  visit('dist/user');
  visit('dist/shared');
  return texts;
}
if (require.main === module) {
  try {
    const known = JSON.parse(
      fs.readFileSync(output, 'utf8').match(/export const generatedMessages=(\[[\s\S]*\]);/)?.[1] ||
        '[]',
    );
    process.stdout.write(
      JSON.stringify({
        manual: Object.fromEntries(existing()),
        known,
        current: [...candidates()].sort((a, b) => a.localeCompare(b)),
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { extract, existing, candidates };
