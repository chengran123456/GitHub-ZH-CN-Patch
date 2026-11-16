#!/usr/bin/env node
/* 菜单补丁离线验收测试
 *
 * 不启动 Electron，而是把 require('electron') 换成一个记录型桩，
 * 然后把 main.js 里真实的 build-default-menu 产出的 label 全量喂进补丁。
 *
 * 测的是「安装后的那一份」：从 <app>/zh-cn/ 读取 menu.js + menu-zh.json，
 * 因为那才是真正生效的产物，能连带验证安装器的拷贝是否完整。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const PROJECT = path.resolve(__dirname, '..');

function versionOf(name) {
  const m = /^app-(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function findApp() {
  const root = process.env.GHD_ROOT || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'GitHubDesktop') : null);
  if (!root || !fs.existsSync(root)) return null;
  const apps = fs.readdirSync(root, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && versionOf(d.name); })
    .map(function (d) { return { name: d.name, ver: versionOf(d.name) }; })
    .sort(function (a, b) { return cmpVer(b.ver, a.ver); });
  return apps.length ? path.join(root, apps[0].name, 'resources', 'app') : null;
}

const APP = process.env.GHD_APP || findApp();

// ---- 定位待测补丁：优先已安装的，否则临时拼一份 ----
let patchDir = APP ? path.join(APP, 'zh-cn') : null;
let staged = false;
if (!patchDir || !fs.existsSync(path.join(patchDir, 'menu.js'))) {
  patchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-cn-menu-'));
  fs.copyFileSync(path.join(PROJECT, 'patch', 'menu.js'), path.join(patchDir, 'menu.js'));
  fs.copyFileSync(path.join(PROJECT, 'src', 'menu-zh.json'), path.join(patchDir, 'menu-zh.json'));
  staged = true;
}
console.log('被测补丁 : ' + patchDir + (staged ? '  (临时拼装)' : '  (已安装产物)'));

let captured = null;
const MenuStub = {
  buildFromTemplate: function (tpl) {
    captured = tpl;
    return { items: [], __stub: true };
  },
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return { Menu: MenuStub };
  return origLoad.apply(this, arguments);
};
require(path.join(patchDir, 'menu.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}
const CJK = /[\u4e00-\u9fa5]/;

// ---- 真实 label 全量回归 ----
console.log('\n== 真实 label 全量回归 ==');
let ranReal = false;
if (APP && fs.existsSync(path.join(APP, 'main.js'))) {
  const mainSrc = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
  const start = mainSrc.indexOf('function Tt(e)');
  const end = mainSrc.indexOf('let yn=!1', start);
  if (start > 0) {
    const seg = mainSrc.slice(start, end > 0 ? end : start + 20000);
    const gate = seg.indexOf('if(!Rt())return[]');
    const prod = gate > 0 ? seg.slice(0, gate) : seg;
    const labels = [...new Set([...prod.matchAll(/label:\s*"((?:[^"\\]|\\.)*)"/g)].map(function (m) { return m[1]; }))];
    check('抓到生产可见 label', labels.length > 40, '实得 ' + labels.length);

    if (labels.length) {
      ranReal = true;
      const tpl = labels.map(function (l, i) {
        return { label: l, id: 'id-' + i, click: function () { return i; } };
      });
      MenuStub.buildFromTemplate(tpl);
      const out = captured;
      const notTranslated = labels.filter(function (l, i) { return out[i].label === l && /[A-Za-z]{3,}/.test(l); });
      check('全部 ' + labels.length + ' 条 label 已译为中文', notTranslated.length === 0, JSON.stringify(notTranslated));
      check('id 未被破坏', out.every(function (o, i) { return o.id === 'id-' + i; }));
      check('click 函数保持原引用', out.every(function (o, i) { return typeof o.click === 'function' && o.click() === i; }));
      console.log('  样例：' + labels.slice(0, 4).map(function (l, i) { return l + ' → ' + out[i].label; }).join('  |  '));

      const again = labels.map(function (l) { return { label: l }; });
      MenuStub.buildFromTemplate(again);
      check('重复构建幂等', captured.every(function (o, i) { return o.label === out[i].label; }));
    }
  }
}
if (!ranReal) console.log('  (跳过：找不到 main.js)');

// ---- 动态拼装项 ----
console.log('\n== 运行时拼装项 ==');
const dyn = [
  'P&ush', 'Force P&ush', 'Force P&ush…', '&Remove', '&Remove…',
  'Create &pull request', 'View &pull request on GitHub',
  '&Stash all changes', '&Stash all changes…',
  'H&ide stashed changes', 'Sho&w stashed changes',
  'Hide Toggle Chan&ges Filter', 'Show Toggle Chan&ges Filter',
];
const dynMiss = [];
dyn.forEach(function (l) {
  const t = [{ label: l }];
  MenuStub.buildFromTemplate(t);
  if (!CJK.test(t[0].label)) dynMiss.push(l + ' → ' + t[0].label);
});
check('动态变体全部命中（' + dyn.length + ' 条）', dynMiss.length === 0, JSON.stringify(dynMiss));

// ---- 句式规则 ----
console.log('\n== 句式规则 ==');
[
  ['&Open in Visual Studio Code', '在 Visual Studio Code 中打开(&O)'],
  ['O&pen in Git Bash', '在 Git Bash 中打开(&P)'],
  ['&Update from main', '从 main 更新(&U)'],
].forEach(function (pair) {
  const t = [{ label: pair[0] }];
  MenuStub.buildFromTemplate(t);
  check(JSON.stringify(pair[0]), t[0].label === pair[1], '实际 ' + JSON.stringify(t[0].label));
});

// ---- 结构性保护 ----
console.log('\n== 结构性保护 ==');
const struct = [{
  label: '&Repository',
  submenu: [
    { label: '&Fetch', id: 'fetch' },
    { type: 'separator' },
    { role: 'quit', label: 'E&xit' },
  ],
}];
MenuStub.buildFromTemplate(struct);
check('子菜单递归翻译', struct[0].submenu[0].label === '抓取(&F)' && struct[0].submenu[0].id === 'fetch', struct[0].submenu[0].label);
check('role 项保留 role 且译了 label', struct[0].submenu[2].role === 'quit' && struct[0].submenu[2].label === '退出(&X)');
check('separator 不被破坏', struct[0].submenu[1].type === 'separator');

// ---- 健壮性 ----
console.log('\n== 健壮性 ==');
const untouched = [{ label: 'Some Brand New Menu Item' }];
MenuStub.buildFromTemplate(untouched);
check('未登记词条原样保留', untouched[0].label === 'Some Brand New Menu Item', untouched[0].label);
const weird = [{ label: '' }, { label: 42 }, null, { label: 'Already 中文' }];
let threw = null;
try { MenuStub.buildFromTemplate(weird); } catch (e) { threw = e; }
check('异常输入不抛错', threw === null, threw && threw.message);
check('空 label 保持为空', weird[0].label === '');
check('非字符串 label 不被改写', weird[1].label === 42);
check('已是中文的不再动', weird[3].label === 'Already 中文');
check('防重复包装标记已置位', MenuStub.__zhCnPatched === true);

if (staged) { try { fs.rmSync(patchDir, { recursive: true, force: true }); } catch (e) { /* ignore */ } }

console.log('\n== 结果 ==');
console.log('  通过 ' + pass + ' ，失败 ' + fail);
if (fail) process.exitCode = 1;
