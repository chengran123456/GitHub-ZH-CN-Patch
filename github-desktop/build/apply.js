#!/usr/bin/env node
/* GitHub Desktop 简体中文语言包 —— 安装器
 *
 * 用法：
 *   node build/apply.js                # 自动探测 %LOCALAPPDATA%\GitHubDesktop 下最新版本
 *   node build/apply.js --root "D:\..."  # 指定 GitHubDesktop 根目录
 *   node build/apply.js --dry-run      # 只报告将要做什么，不落盘
 *
 * 做的事：
 *   1. 找到最新的 app-X.Y.Z\resources\app
 *   2. 把原始 main.js / index.html 备份到 <root>\zh-cn-backup\app-X.Y.Z\
 *   3. 写入 zh-cn\ 目录（menu.js / menu-zh.json / renderer.js）
 *   4. 在 main.js 头部插一行 require，在 index.html 的 </head> 前插一个 script
 *   5. 写 manifest.json 记录版本与哈希
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT = path.resolve(__dirname, '..');
const SRC = path.join(PROJECT, 'src');
const PATCH = path.join(PROJECT, 'patch');

const MARK_MAIN = '/* zh-cn-l10n */';
const MARK_HTML = '<!-- zh-cn-l10n -->';

function parseArgs(argv) {
  const out = { dryRun: false, root: process.env.GHD_ROOT || null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a.startsWith('--root=')) out.root = a.slice(7);
  }
  return out;
}

function defaultRoot() {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  return path.join(local, 'GitHubDesktop');
}

function versionOf(dirName) {
  const m = /^app-(\d+)\.(\d+)\.(\d+)/.exec(dirName);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function findLatestApp(root) {
  if (!root || !fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && versionOf(d.name); })
    .map(function (d) { return { name: d.name, ver: versionOf(d.name) }; })
    .sort(function (a, b) { return cmpVer(b.ver, a.ver); });
  if (!dirs.length) return null;
  const picked = dirs[0];
  return {
    version: picked.name.replace(/^app-/, ''),
    appDir: path.join(root, picked.name, 'resources', 'app'),
    all: dirs.map(function (d) { return d.name; }),
  };
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

function main() {
  const args = parseArgs(process.argv);
  const root = args.root || defaultRoot();

  const info = findLatestApp(root);
  if (!info) {
    console.error('找不到 GitHub Desktop 安装目录。');
    console.error('  已尝试：' + (root || '(无法确定 LOCALAPPDATA)'));
    console.error('  请用 --root 指定，例如：node build/apply.js --root "C:\\Users\\你\\AppData\\Local\\GitHubDesktop"');
    process.exit(1);
  }

  const appDir = info.appDir;
  const mainJs = path.join(appDir, 'main.js');
  const indexHtml = path.join(appDir, 'index.html');

  console.log('安装目录 : ' + appDir);
  console.log('版本     : ' + info.version);
  if (info.all.length > 1) console.log('同机版本 : ' + info.all.join(' , ') + '  (选中最新)');

  if (!fs.existsSync(mainJs) || !fs.existsSync(indexHtml)) {
    console.error('目录结构异常：main.js 或 index.html 不存在，可能不是解包版。');
    process.exit(1);
  }

  const menuZh = JSON.parse(fs.readFileSync(path.join(SRC, 'menu-zh.json'), 'utf8'));
  const uiZh = JSON.parse(fs.readFileSync(path.join(SRC, 'ui-zh.json'), 'utf8'));
  const patterns = JSON.parse(fs.readFileSync(path.join(SRC, 'patterns.json'), 'utf8')).rules;

  const zhDir = path.join(appDir, 'zh-cn');
  const backupDir = path.join(path.dirname(path.dirname(path.dirname(appDir))), 'zh-cn-backup', 'app-' + info.version);

  console.log('补丁目录 : ' + zhDir);
  console.log('备份目录 : ' + backupDir);
  console.log('词条     : 菜单 ' + Object.keys(menuZh).filter(function (k) { return k[0] !== '_'; }).length +
    ' 条 / 界面 ' + Object.keys(uiZh).filter(function (k) { return k[0] !== '_'; }).length +
    ' 条 / 句式 ' + patterns.length + ' 条');

  if (args.dryRun) {
    console.log('\n[dry-run] 未写入任何文件。');
    return;
  }

  // 1) 备份（只备份真正会被改动的原始文件）
  fs.mkdirSync(backupDir, { recursive: true });
  const manifestPath = path.join(backupDir, 'manifest.json');
  const hadManifest = fs.existsSync(manifestPath);

  [['main.js', mainJs], ['index.html', indexHtml]].forEach(function (pair) {
    const dst = path.join(backupDir, pair[0]);
    if (fs.existsSync(dst)) return; // 已有备份，绝不覆盖（否则会把打过补丁的当原件存起来）
    fs.copyFileSync(pair[1], dst);
    console.log('  已备份 ' + pair[0] + '  (' + fs.statSync(dst).size + ' B)');
  });

  // 2) 生成 zh-cn 目录
  fs.mkdirSync(zhDir, { recursive: true });
  fs.copyFileSync(path.join(PATCH, 'menu.js'), path.join(zhDir, 'menu.js'));
  fs.writeFileSync(path.join(zhDir, 'menu-zh.json'), JSON.stringify(menuZh, null, 2), 'utf8');

  const tpl = fs.readFileSync(path.join(PATCH, 'renderer.js'), 'utf8');
  const dictJson = JSON.stringify(uiZh);
  const patJs = '[' + patterns.map(function (p) {
    return '{"re":new RegExp(' + JSON.stringify(p.re) + '),"to":' + JSON.stringify(p.to) + '}';
  }).join(',') + ']';
  let renderer = tpl.split('__ZH_DICT__').join(dictJson).split('__ZH_PATTERNS__').join(patJs);
  if (renderer.indexOf('__ZH_') >= 0) throw new Error('模板占位符未全部替换，请检查 patch/renderer.js');
  fs.writeFileSync(path.join(zhDir, 'renderer.js'), renderer, 'utf8');
  console.log('  已写入 zh-cn/menu.js, menu-zh.json, renderer.js');

  // 3) 注入 main.js（幂等）
  let mainSrc = fs.readFileSync(mainJs, 'utf8');
  if (mainSrc.indexOf(MARK_MAIN) < 0) {
    mainSrc = 'require("./zh-cn/menu.js");' + MARK_MAIN + '\n' + mainSrc;
    fs.writeFileSync(mainJs, mainSrc, 'utf8');
    console.log('  已注入 main.js 头部');
  } else {
    console.log('  main.js 已注入过，跳过');
  }

  // 4) 注入 index.html（幂等）
  let html = fs.readFileSync(indexHtml, 'utf8');
  if (html.indexOf(MARK_HTML) < 0) {
    const tag = '<script defer src="zh-cn/renderer.js"></script>' + MARK_HTML;
    if (html.indexOf('</head>') >= 0) {
      html = html.replace('</head>', tag + '</head>');
    } else {
      html = html.replace(/<head>/i, '<head>' + tag);
    }
    fs.writeFileSync(indexHtml, html, 'utf8');
    console.log('  已注入 index.html');
  } else {
    console.log('  index.html 已注入过，跳过');
  }

  // 5) manifest
  const manifest = {
    app: 'GitHub Desktop',
    version: info.version,
    appDir: appDir,
    installedAt: new Date().toISOString(),
    note: hadManifest ? '重复安装：已存在备份，原始文件保持首次备份内容' : '首次安装',
    files: {
      'main.js': { size: fs.statSync(mainJs).size, sha256: sha256(mainJs) },
      'index.html': { size: fs.statSync(indexHtml).size, sha256: sha256(indexHtml) },
      'zh-cn/menu.js': { size: fs.statSync(path.join(zhDir, 'menu.js')).size, sha256: sha256(path.join(zhDir, 'menu.js')) },
      'zh-cn/renderer.js': { size: fs.statSync(path.join(zhDir, 'renderer.js')).size, sha256: sha256(path.join(zhDir, 'renderer.js')) },
    },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n完成。请完全退出 GitHub Desktop 后重新打开（托盘也要退），菜单栏与界面即为中文。');
  console.log('还原：node build/restore.js');
}

main();
