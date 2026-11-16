#!/usr/bin/env node
/* 漏译收集工具
 *
 *   node build/collect.js            开启收集（下次启动 GitHub Desktop 后，界面里
 *                                    没翻到的文案会被记录到 zh-cn/missing.txt）
 *   node build/collect.js --off      关闭收集
 *   node build/collect.js --import   把收集结果整理成 src/missing-todo.json，
 *                                    补完译文后可以用 --merge 并进主字典
 *
 * 为什么需要它：GitHub Desktop 的文案有一千多条，其中相当一部分只在特定流程里
 * 出现（例如某种冲突、某种鉴权失败）。与其凭空猜，不如让它自己报上来。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');

function findApp() {
  const root = process.env.GHD_ROOT || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'GitHubDesktop') : null);
  if (!root || !fs.existsSync(root)) return null;
  const ver = function (n) {
    const m = /^app-(\d+)\.(\d+)\.(\d+)/.exec(n);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const apps = fs.readdirSync(root, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && ver(d.name); })
    .map(function (d) { return { name: d.name, v: ver(d.name) }; })
    .sort(function (a, b) { for (let i = 0; i < 3; i++) if (b.v[i] !== a.v[i]) return b.v[i] - a.v[i]; return 0; });
  if (!apps.length) return null;
  return path.join(root, apps[0].name, 'resources', 'app');
}

const app = findApp();
if (!app) {
  console.error('找不到 GitHub Desktop 安装目录，请先安装语言包。');
  process.exit(1);
}
const zhDir = path.join(app, 'zh-cn');
const flag = path.join(zhDir, 'collect.flag');
const out = path.join(zhDir, 'missing.txt');

const mode = process.argv[2];

if (mode === '--off') {
  if (fs.existsSync(flag)) fs.unlinkSync(flag);
  console.log('已关闭漏译收集。');
  process.exit(0);
}

if (mode === '--import') {
  if (!fs.existsSync(out)) {
    console.error('还没有收集结果：' + out);
    console.error('先跑 node build/collect.js，重启 GitHub Desktop 用一会儿，再回来导入。');
    process.exit(1);
  }
  const lines = fs.readFileSync(out, 'utf8').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  const dict = JSON.parse(fs.readFileSync(path.join(PROJECT, 'src', 'ui-zh.json'), 'utf8'));
  const todo = {};
  let added = 0;
  lines.forEach(function (t) {
    if (Object.prototype.hasOwnProperty.call(dict, t)) return;
    todo[t] = '';
    added++;
  });
  fs.writeFileSync(path.join(PROJECT, 'src', 'missing-todo.json'), JSON.stringify(todo, null, 2), 'utf8');
  console.log('收集到 ' + lines.length + ' 条未翻译文案，其中 ' + added + ' 条是新词条。');
  console.log('已写入 src/missing-todo.json —— 把值填上中文，再跑 node build/collect.js --merge');
  process.exit(0);
}

if (mode === '--merge') {
  const todoPath = path.join(PROJECT, 'src', 'missing-todo.json');
  if (!fs.existsSync(todoPath)) {
    console.error('没有 src/missing-todo.json，先跑 --import');
    process.exit(1);
  }
  const todo = JSON.parse(fs.readFileSync(todoPath, 'utf8'));
  const dictPath = path.join(PROJECT, 'src', 'ui-zh.json');
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  let n = 0, skipped = 0;
  Object.keys(todo).forEach(function (k) {
    const v = todo[k];
    if (!v || !String(v).trim()) { skipped++; return; }
    if (Object.prototype.hasOwnProperty.call(dict, k)) return;
    dict[k] = v;
    n++;
  });
  fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2), 'utf8');
  console.log('并入 ' + n + ' 条，跳过空译文 ' + skipped + ' 条。');
  console.log('记得重跑 node build/apply.js 让字典生效。');
  process.exit(0);
}

// 默认：开启收集
fs.mkdirSync(zhDir, { recursive: true });
fs.writeFileSync(flag, 'collect', 'utf8');
console.log('已开启漏译收集。');
console.log('  1. 完全退出并重新打开 GitHub Desktop（托盘也要退）');
console.log('  2. 正常用一会儿，把各个页面、对话框都点一遍');
console.log('  3. 关掉它，然后跑：node build/collect.js --import');
console.log('');
console.log('结果文件：' + out);
