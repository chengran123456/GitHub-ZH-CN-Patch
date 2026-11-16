#!/usr/bin/env node
/* 覆盖审计：把已抽取的界面字面量逐条对字典做命中测试，输出缺失清单。
 * 只统计 app/src/ui/ 下的文件（那是真正渲染界面的地方），并按长度排序，
 * 短的通常是按钮/标题（高频可见），长的通常是说明文字。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const dict = JSON.parse(fs.readFileSync(path.join(PROJECT, 'src', 'ui-zh.json'), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(PROJECT, 'src', 'patterns.json'), 'utf8')).rules
  .map(function (p) { return new RegExp(p.re); });

function covered(s) {
  if (Object.prototype.hasOwnProperty.call(dict, s)) return true;
  return rules.some(function (re) { return re.test(s); });
}

const pure = JSON.parse(fs.readFileSync(path.join(PROJECT, 'ref', 'lit-pure.json'), 'utf8'));
const tpl = JSON.parse(fs.readFileSync(path.join(PROJECT, 'ref', 'lit-tpl.json'), 'utf8'));

function inUi(e) {
  return (e.files || []).some(function (f) { return /\/ui\//.test(f); });
}

const missPure = pure.filter(function (e) { return inUi(e) && !covered(e.text); });
const missTpl = tpl.filter(function (e) { return inUi(e) && !covered(e.text); });

console.log('界面字面量总数 : ' + pure.filter(inUi).length + ' 纯文本 / ' + tpl.filter(inUi).length + ' 含插值');
console.log('已覆盖         : ' + (pure.filter(inUi).length - missPure.length) + ' / ' + (tpl.filter(inUi).length - missTpl.length));
console.log('缺失           : ' + missPure.length + ' / ' + missTpl.length);

function groupByFile(list) {
  const m = new Map();
  list.forEach(function (e) {
    const f = (e.files[0] || '').replace('app/src/', '');
    if (!m.has(f)) m.set(f, []);
    m.get(f).push(e.text);
  });
  return m;
}

const short = missPure.filter(function (e) { return e.text.length <= 45; })
  .sort(function (a, b) { return a.text.length - b.text.length; });

console.log('\n===== 缺失·短词条（≤45 字符，' + short.length + ' 条，按文件归组）=====');
const g = groupByFile(short);
[...g.keys()].sort().forEach(function (f) {
  const items = g.get(f);
  console.log('\n-- ' + f + '  (' + items.length + ')');
  items.slice(0, 12).forEach(function (t) { console.log('   ' + t); });
  if (items.length > 12) console.log('   ... 另 ' + (items.length - 12) + ' 条');
});

console.log('\n===== 缺失·含插值（前 40）=====');
missTpl.slice(0, 40).forEach(function (e) { console.log('   ' + e.text); });

fs.writeFileSync(path.join(PROJECT, 'ref', 'missing.json'), JSON.stringify({
  pure: missPure.map(function (e) { return { t: e.text, f: e.files[0] }; }),
  tpl: missTpl.map(function (e) { return { t: e.text, f: e.files[0] }; }),
}, null, 1), 'utf8');
console.log('\n完整缺失清单已写入 ref/missing.json');
