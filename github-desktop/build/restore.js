#!/usr/bin/env node
/* GitHub Desktop 简体中文语言包 —— 还原器
 *
 * 用法：
 *   node build/restore.js               # 还原最新版本
 *   node build/restore.js --root "D:\..."
 *   node build/restore.js --list        # 只列出所有可用备份
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { root: process.env.GHD_ROOT || null, list: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--root') out.root = argv[++i];
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

function main() {
  const args = parseArgs(process.argv);
  const root = args.root || defaultRoot();
  const backupRoot = root ? path.join(root, 'zh-cn-backup') : null;

  if (!root || !fs.existsSync(root)) {
    console.error('找不到 GitHub Desktop 根目录，请用 --root 指定。');
    process.exit(1);
  }

  if (args.list) {
    const all = fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot).filter(function (n) { return versionOf(n); }) : [];
    console.log(all.length ? '可用备份：\n  ' + all.join('\n  ') : '没有任何备份。');
    return;
  }

  const apps = fs.readdirSync(root, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && versionOf(d.name); })
    .map(function (d) { return { name: d.name, ver: versionOf(d.name) }; })
    .sort(function (a, b) { return cmpVer(b.ver, a.ver); });
  if (!apps.length) {
    console.error('目录里没有 app-X.Y.Z 版本目录。');
    process.exit(1);
  }

  const version = apps[0].name.replace(/^app-/, '');
  const appDir = path.join(root, apps[0].name, 'resources', 'app');
  const bdir = path.join(backupRoot, 'app-' + version);

  if (!fs.existsSync(bdir)) {
    console.error('版本 ' + version + ' 没有备份，无法还原。');
    const all = fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot).filter(function (n) { return versionOf(n); }) : [];
    if (all.length) console.error('现有备份：' + all.join(' , '));
    process.exit(1);
  }

  let n = 0;
  [['main.js', path.join(appDir, 'main.js')], ['index.html', path.join(appDir, 'index.html')]].forEach(function (pair) {
    const src = path.join(bdir, pair[0]);
    if (!fs.existsSync(src)) return;
    fs.copyFileSync(src, pair[1]);
    console.log('  已还原 ' + pair[0]);
    n++;
  });

  const zhDir = path.join(appDir, 'zh-cn');
  if (fs.existsSync(zhDir)) {
    fs.rmSync(zhDir, { recursive: true, force: true });
    console.log('  已删除 zh-cn/ 补丁目录');
  }

  console.log('\n还原完成（' + n + ' 个文件）。完全退出并重新打开 GitHub Desktop 即恢复英文。');
  console.log('备份目录仍保留在：' + bdir);
}

main();
