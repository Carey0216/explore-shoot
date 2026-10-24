// Compile visible WXML text into display-only bilingual expressions. Event/data values stay canonical.
const fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '../miniprogram'),
  dictionary = require('../dist/shared/locales/en-US.json'),
  staticKeys = new Set();
const chinese = (value) => /[\u3400-\u9fff]/.test(value);
function quoted(s) {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\x22') + "'";
}
function visible(value) {
  if (value.includes('i18n.')) return value;
  const parts = value.split(/({{[\s\S]*?}})/g);
  return parts
    .map((part) => {
      if (part.startsWith('{{')) {
        const expr = part.slice(2, -2);
        if (/(?:^|\.)(?:initial|nickname|username|authorName)\b/.test(expr)) return part;
        if (chinese(expr)) {
          for (const m of expr.matchAll(/'([^']*)'/g)) staticKeys.add(m[1]);
          return '{{i18n.ui(' + expr + ',locale)}}';
        }
        return '{{i18n.content(' + expr + ',locale,localeTranslations,localeOriginal)}}';
      }
      const trimmed = part.trim();
      if (!chinese(trimmed)) return part;
      staticKeys.add(trimmed);
      return part.replace(trimmed, '{{i18n.ui(' + quoted(trimmed) + ',locale)}}');
    })
    .join('');
}
function files(folder) {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() && !['vendor', 'assets'].includes(e.name)
        ? files(path.join(folder, e.name))
        : e.isFile() && e.name.endsWith('.wxml')
          ? [path.join(folder, e.name)]
          : [],
    );
}
for (const file of files(root)) {
  let s = fs
    .readFileSync(file, 'utf8')
    .replace(
      /{{i18n\.content\(([^]*?),locale,localeTranslations,localeOriginal\)}}/g,
      (all, expr) =>
        /(?:^|\.)(?:initial|nickname|username|authorName)\b/.test(expr) ? '{{' + expr + '}}' : all,
    )
    .replace(
      /i18n\.ui\(&quot;([^]*?)&quot;,locale\)/g,
      (_, text) => 'i18n.ui(' + quoted(JSON.parse('"' + text + '"')) + ',locale)',
    );
  // Protect complete template expressions while tokenizing, so > comparisons aren't treated as tags.
  const expressions = [];
  s = s.replace(/{{[\s\S]*?}}/g, (m) => '\uE000' + (expressions.push(m) - 1) + '\uE001');
  const restore = (t) => t.replace(/\uE000(\d+)\uE001/g, (_, i) => expressions[i]);
  s = s
    .split(/(<!--[\s\S]*?-->|<[^>]*>)/g)
    .map((part) => {
      if (part.startsWith('<!--')) return restore(part);
      if (part.startsWith('<')) {
        part = restore(part);
        // WXML templates have an isolated data scope: explicitly pass translation state through recursion.
        if (/^<template\b/.test(part) && /\bis=/.test(part) && !part.includes('locale:locale'))
          part = part.replace(
            /data="{{([\s\S]*?)}}"/,
            (all, data) =>
              'data="{{' +
              data +
              ',locale:locale,localeTranslations:localeTranslations,localeOriginal:localeOriginal}}"',
          );
        part = part.replace(
          /\b(placeholder|aria-label|title|empty-text)="([^"]*)"/g,
          (_, name, value) => name + '="' + visible(value) + '"',
        );
        // Picker display labels are transformed without changing selected indices or submitted IDs.
        part = part.replace(/\brange="{{([\s\S]*?)}}"/g, (all, expr) =>
          expr.includes('i18n.') ? all : 'range="{{i18n.options(' + expr + ',locale)}}"',
        );
        return part;
      }
      return visible(restore(part));
    })
    .join('');
  if (!s.includes('module="i18n"')) s = '<wxs src="/services/i18n.wxs" module="i18n"/>\n' + s;
  s = s.replace(
    /class="native-surface (?!{{locale)/,
    "class=\"native-surface {{locale==='en-US'?'locale-en':''}} ",
  );
  if (file.includes(path.sep + 'pages' + path.sep) && !s.includes('localeToggleOriginal'))
    s = s.replace(
      /(<view class="native-surface[^>]*>)/,
      '$1\n<view wx:if="{{localeTranslated}}" class="locale-note"><text>{{i18n.ui(\'内容由机器翻译，原文始终保留。\',locale)}}</text><button bindtap="localeToggleOriginal">{{i18n.ui(localeOriginal?\'显示译文\':\'查看原文\',locale)}}</button></view>',
    );
  fs.writeFileSync(file, s);
}
// Retain only WXML's static UI strings in the lightweight render module.
for (const file of files(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const m of source.matchAll(/'([^']*[\u3400-\u9fff][^']*)'/g)) staticKeys.add(m[1]);
  for (const m of source.matchAll(/&quot;([^&]*[\u3400-\u9fff][^&]*)&quot;/g)) staticKeys.add(m[1]);
}
const displayKeys = new Set();
for (const file of files(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(
    /i18n\.content\(([\s\S]*?),locale,localeTranslations,localeOriginal\)/g,
  )) {
    for (const key of match[1].matchAll(/(?:^|\.)([A-Za-z_$][\w$]*)/g)) displayKeys.add(key[1]);
  }
}
fs.writeFileSync(
  path.join(root, 'services/locale-display-fields.js'),
  '// Generated from visible WXML expressions.\nmodule.exports=' +
    JSON.stringify([...displayKeys]) +
    ';\n',
);
// Reviewed core labels must remain available even after the ephemeral content cache rotates.
for (const key of Object.keys(require('../dist/shared/locales/en-US.manual.json')))
  staticKeys.add(key);
const data = Object.fromEntries(
  [...staticKeys].filter((k) => dictionary[k]).map((k) => [k, dictionary[k]]),
);
fs.writeFileSync(
  path.join(root, 'services/i18n.wxs'),
  `// Generated by tools/localize-mini.cjs. No canonical values are modified.\nvar dictionary=${JSON.stringify(data)};\nfunction ui(value,locale){if(typeof value!=='string'||locale!=='en-US')return value;var key=value.trim();return dictionary[key] ? value.replace(key,dictionary[key]):value;}\nfunction content(value,locale,cache,original){if(original||typeof value!=='string')return value;return cache&&cache[value] ? cache[value]:ui(value,locale);}\nfunction options(items,locale){if(!items)return items;var result=[];for(var i=0;i<items.length;i++){var item=items[i];if(typeof item==='string')result.push(ui(item,locale));else{result.push({id:item.id,value:item.value,key:item.key,label:ui(item.label,locale),name:ui(item.name,locale),title:ui(item.title,locale),checked:item.checked});}}return result;}\nmodule.exports={ui:ui,content:content,options:options};\n`,
);
console.log(
  'Bilingual WXML:',
  files(root).length,
  'views;',
  Object.keys(data).length,
  'static phrases.',
);

const pageTitles = {};
for (const folder of ['pages', 'scenes'])
  for (const item of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const file = path.join(root, folder, item.name, 'index.json');
    if (item.isDirectory() && fs.existsSync(file)) {
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      pageTitles[folder + '/' + item.name + '/index'] = config.navigationBarTitleText || '景遇';
    }
  }
fs.writeFileSync(
  path.join(root, 'services/locale-page-titles.js'),
  '// Generated from page navigation titles.\nmodule.exports=' + JSON.stringify(pageTitles) + ';\n',
);
