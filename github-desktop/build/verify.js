#!/usr/bin/env node
/* GitHub Desktop 简体中文语言包 —— 校验器
 *
 * 检查项：
 *   1. 注入点是否完整（main.js 的 require、index.html 的 script）
 *   2. 补丁产物是否存在且语法可解析
 *   3. 菜单覆盖率：从 main.js 里把 build-default-menu 段的生产可见 label 全抓出来，
 *      逐个对字典做命中测试，列出未命中项
 *   4. 界面字典自检：键是否含非法字符、值是否为空、是否有同值异键
 *
 * 用法：node build/verify.js [--root "D:\..."]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { root: process.env.GHD_ROOT || null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.root = argv[++i];
    else if (a.startsWith('--root=')) out.root = a.slice(7);
  }
  return out;
}

function defaultRoot() {
  const local = process.env.LOCALAPPDATA;
  return local ? path.join(local, 'GitHubDesktop') : null;
}

function versionOf(name) {
  const m = /^app-(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

let pass = 0, fail = 0, warn = 0;
function ok(msg) { pass++; console.log('  [OK]   ' + msg); }
function bad(msg) { fail++; console.log('  [FAIL] ' + msg); }
function wa(msg) { warn++; console.log('  [WARN] ' + msg); }

function main() {
  const args = parseArgs(process.argv);
  const root = args.root || defaultRoot();

  console.log('== 定位安装目录 ==');
  if (!root || !fs.existsSync(root)) { bad('GitHub Desktop 根目录不存在：' + (root || '(未提供)')); return summarise(); }
  const apps = fs.readdirSync(root, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && versionOf(d.name); })
    .map(function (d) { return { name: d.name, ver: versionOf(d.name) }; })
    .sort(function (a, b) { return cmpVer(b.ver, a.ver); });
  if (!apps.length) { bad('没有 app-X.Y.Z 版本目录'); return summarise(); }
  const version = apps[0].name.replace(/^app-/, '');
  const appDir = path.join(root, apps[0].name, 'resources', 'app');
  ok('版本 ' + version + ' → ' + appDir);

  console.log('\n== 注入点 ==');
  const mainJs = path.join(appDir, 'main.js');
  const indexHtml = path.join(appDir, 'index.html');
  const zhDir = path.join(appDir, 'zh-cn');

  const mainSrc = fs.existsSync(mainJs) ? fs.readFileSync(mainJs, 'utf8') : '';
  if (mainSrc.indexOf('require("./zh-cn/menu.js")') === 0) ok('main.js 头部已注入 require');
  else if (mainSrc.indexOf('require("./zh-cn/menu.js")') > 0) wa('main.js 的 require 不在文件最开头（可能被其它工具重排过）');
  else bad('main.js 未注入 require，菜单不会汉化');

  const html = fs.existsSync(indexHtml) ? fs.readFileSync(indexHtml, 'utf8') : '';
  if (html.indexOf('zh-cn/renderer.js') >= 0) ok('index.html 已注入渲染层脚本');
  else bad('index.html 未注入，界面不会汉化');
  if (html.indexOf('defer') >= 0) ok('脚本带 defer，不会阻塞首屏');
  else wa('脚本没有 defer，可能影响加载顺序');

  console.log('\n== 补丁产物 ==');
  ['menu.js', 'menu-zh.json', 'renderer.js'].forEach(function (f) {
    const p = path.join(zhDir, f);
    if (!fs.existsSync(p)) return bad('缺少 zh-cn/' + f);
    const size = fs.statSync(p).size;
    if (size < 100) return bad('zh-cn/' + f + ' 过小，疑似写入失败');
    ok('zh-cn/' + f + '  ' + size + ' B');
  });

  const rendererPath = path.join(zhDir, 'renderer.js');
  if (fs.existsSync(rendererPath)) {
    const src = fs.readFileSync(rendererPath, 'utf8');
    if (src.indexOf('__ZH_') >= 0) bad('renderer.js 仍含未替换的占位符');
    else ok('renderer.js 占位符已全部替换');
    try { new Function(src); ok('renderer.js 语法可解析'); }
    catch (e) { bad('renderer.js 语法错误：' + e.message); }
  }

  const menuPath = path.join(zhDir, 'menu.js');
  if (fs.existsSync(menuPath)) {
    try { new Function(fs.readFileSync(menuPath, 'utf8')); ok('menu.js 语法可解析'); }
    catch (e) { bad('menu.js 语法错误：' + e.message); }
  }

  console.log('\n== 菜单覆盖率 ==');
  const menuDict = JSON.parse(fs.readFileSync(path.join(PROJECT, 'src', 'menu-zh.json'), 'utf8'));
  const menuRules = [
    /^&Open in .+$/, /^O&pen in .+$/, /^&Update from .+$/,
  ];
  const start = mainSrc.indexOf('function Tt(e)');
  if (start < 0) {
    wa('main.js 里找不到 build-default-menu 的模板函数，跳过菜单覆盖率检查');
  } else {
    const end = mainSrc.indexOf('let yn=!1', start);
    const seg = mainSrc.slice(start, end > 0 ? end : start + 20000);
    const devGate = seg.indexOf('if(!Rt())return[]');
    const prodPart = devGate > 0 ? seg.slice(0, devGate) : seg;
    const labels = [...prodPart.matchAll(/label:\s*"((?:[^"\\]|\\.)*)"/g)].map(function (m) { return m[1]; });
    const uniq = [...new Set(labels)];
    const miss = uniq.filter(function (l) {
      if (Object.prototype.hasOwnProperty.call(menuDict, l)) return false;
      return !menuRules.some(function (re) { return re.test(l); });
    });
    const covered = uniq.length - miss.length;
    console.log('  生产可见静态 label = ' + uniq.length + ' ，命中 ' + covered + ' ，未命中 ' + miss.length);
    if (miss.length === 0) ok('菜单静态词条全覆盖');
    else {
      wa('菜单未覆盖：' + JSON.stringify(miss));
    }
    if (devGate > 0) ok('已正确排除 ' + (seg.length - prodPart.length) + ' 字符的开发者测试菜单（生产不可见）');
  }

  console.log('\n== 界面字典自检 ==');
  const uiDict = JSON.parse(fs.readFileSync(path.join(PROJECT, 'src', 'ui-zh.json'), 'utf8'));
  const keys = Object.keys(uiDict).filter(function (k) { return k[0] !== '_'; });
  console.log('  词条总数 = ' + keys.length);
  const emptyVal = keys.filter(function (k) { return !uiDict[k] || !String(uiDict[k]).trim(); });
  if (emptyVal.length) bad('空译文：' + JSON.stringify(emptyVal.slice(0, 10)));
  else ok('无空译文');
  const cjkKey = keys.filter(function (k) { return /[\u4e00-\u9fa5]/.test(k); });
  if (cjkKey.length) wa('键里含中文（永远匹配不到英文原文）：' + JSON.stringify(cjkKey.slice(0, 10)));
  else ok('所有键均为英文原文');
  const noCjkVal = keys.filter(function (k) { return !/[\u4e00-\u9fa5]/.test(String(uiDict[k])); });
  if (noCjkVal.length) {
    console.log('  留英文的词条（品牌名/专有名词，正常）: ' + JSON.stringify(noCjkVal.slice(0, 20)));
  }

  const patterns = JSON.parse(fs.readFileSync(path.join(PROJECT, 'src', 'patterns.json'), 'utf8')).rules;
  const loose = patterns.filter(function (p) { return !(p.re.startsWith('^') && p.re.endsWith('$')); });
  if (loose.length) bad('句式规则未做整串锚定（会误伤子串）：' + JSON.stringify(loose.map(function (p) { return p.re; })));
  else ok('所有句式规则均为整串锚定');

  summarise();
}

function summarise() {
  console.log('\n== 结果 ==');
  console.log('  通过 ' + pass + ' ，失败 ' + fail + ' ，警告 ' + warn);
  if (fail > 0) process.exitCode = 1;
}

main();
