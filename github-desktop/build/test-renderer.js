#!/usr/bin/env node
/* 渲染层补丁离线冒烟测试
 *
 * 没有浏览器，于是手搓一个最小 DOM：树、TreeWalker、MutationObserver 都用桩。
 * 重点验证「不做坏事」的四条：
 *   1. 命中的文本/属性会翻
 *   2. pre / code / textarea / contenteditable 里的内容一个字都不动
 *   3. input 的 value 不碰，只碰 placeholder
 *   4. 跑第二遍不会二次翻译（幂等）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');

// ---------- 最小 DOM ----------
function El(tag, attrs, children) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: (attrs && attrs['class']) || '',
    _attrs: Object.assign({}, attrs || {}),
    childNodes: children || [],
    _parent: null,
  };
  el.getAttribute = function (n) {
    return Object.prototype.hasOwnProperty.call(el._attrs, n) ? el._attrs[n] : null;
  };
  el.setAttribute = function (n, v) { el._attrs[n] = v; };
  Object.defineProperty(el, 'parentElement', { get: function () { return el._parent; } });
  el.childNodes.forEach(function (c) { c._parent = el; });
  return el;
}
function Tx(text) {
  const t = { nodeType: 3, nodeValue: text, _parent: null };
  Object.defineProperty(t, 'parentElement', { get: function () { return t._parent; } });
  return t;
}

function collect(root) {
  const out = [];
  (function rec(n) {
    out.push(n);
    (n.childNodes || []).forEach(rec);
  })(root);
  return out;
}

let observed = null;
const MutationObserverStub = function (cb) { this.cb = cb; };
MutationObserverStub.prototype.observe = function (target, opts) {
  observed = { target: target, opts: opts };
};
MutationObserverStub.prototype.disconnect = function () {};

const root = El('body', {}, [
  El('div', {}, [Tx('Changes')]),
  El('button', { title: 'Fetch origin' }, [Tx('Pull origin')]),
  El('input', { placeholder: 'Search…', value: 'Changes' }),
  El('pre', {}, [Tx('Changes')]),
  El('code', {}, [Tx('Discard changes')]),
  El('div', { contenteditable: 'true' }, [Tx('Commit')]),
  El('div', { class: 'diff-line' }, [Tx('History')]),
  El('span', { 'aria-label': 'Close' }, [Tx('No local changes')]),
  El('div', {}, [Tx('3 files changed')]),
  El('div', {}, [Tx('Some untranslated sentence here')]),
  El('div', {}, [Tx('   ') ]),
  El('div', {}, [Tx('提交')]),
]);

global.NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1 };
global.MutationObserver = MutationObserverStub;
global.Promise = Promise;
global.window = { addEventListener: function () {} };
global.document = {
  nodeType: 9,
  readyState: 'complete',
  documentElement: root,
  body: root,
  createTreeWalker: function (base) {
    const nodes = collect(base).slice(1);
    let i = 0;
    return { nextNode: function () { return i < nodes.length ? nodes[i++] : null; } };
  },
};

// ---------- 载入被测补丁（用安装后的真实产物） ----------
function findApp() {
  const r = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'GitHubDesktop') : null;
  if (!r || !fs.existsSync(r)) return null;
  const apps = fs.readdirSync(r).filter(function (n) { return /^app-\d+\.\d+\.\d+/.test(n); })
    .sort(function (a, b) {
      const pa = a.slice(4).split('.').map(Number), pb = b.slice(4).split('.').map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    });
  return apps.length ? path.join(r, apps[apps.length - 1], 'resources', 'app') : null;
}
const APP = findApp();
const target = APP ? path.join(APP, 'zh-cn', 'renderer.js') : path.join(PROJECT, 'patch', 'renderer.js');
console.log('被测补丁 : ' + target);

const src = fs.readFileSync(target, 'utf8');
if (src.indexOf('__ZH_') >= 0) {
  console.error('补丁里还有未替换的占位符，先跑 build/apply.js');
  process.exit(1);
}

let threw = null;
try {
  new Function('window', 'document', 'NodeFilter', 'MutationObserver', 'require', src)(
    global.window, global.document, global.NodeFilter, global.MutationObserver, require
  );
} catch (e) { threw = e; }

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}
function textAt(i) { return root.childNodes[i].childNodes[0].nodeValue; }

console.log('\n== 载入 ==');
check('补丁执行不抛错', threw === null, threw && threw.message);
check('已注册 MutationObserver', observed !== null);
check('监听根节点为 documentElement', observed && observed.target === root);
check('监听选项包含 characterData 与 attributes', !!(observed && observed.opts.characterData && observed.opts.attributes));

console.log('\n== 翻译生效 ==');
check('纯文本词条 Changes → 更改', textAt(0) === '更改', textAt(0));
check('按钮文字 Pull origin → 拉取 origin', textAt(1) === '拉取 origin', textAt(1));
check('title 属性 Fetch origin → 抓取 origin',
  root.childNodes[1].getAttribute('title') === '抓取 origin', root.childNodes[1].getAttribute('title'));
check('placeholder 属性 Search… → 搜索…',
  root.childNodes[2].getAttribute('placeholder') === '搜索…', root.childNodes[2].getAttribute('placeholder'));
check('句式规则 3 files changed → 3 个文件已更改', textAt(8) === '3 个文件已更改', textAt(8));
check('aria-label 已翻译', root.childNodes[7].getAttribute('aria-label') === '关闭');

console.log('\n== 红线：不该动的一个都不许动 ==');
check('pre 内文本未变', textAt(3) === 'Changes', textAt(3));
check('code 内文本未变', textAt(4) === 'Discard changes', textAt(4));
check('contenteditable 内文本未变', textAt(5) === 'Commit', textAt(5));
check('diff-line 内文本未变', textAt(6) === 'History', textAt(6));
check('input 的 value 未被改写', root.childNodes[2].getAttribute('value') === 'Changes',
  root.childNodes[2].getAttribute('value'));
check('未登记句子原样保留', textAt(9) === 'Some untranslated sentence here', textAt(9));
check('纯空白节点未被改写', textAt(10) === '   ', JSON.stringify(textAt(10)));
check('已是中文的不重复处理', textAt(11) === '提交', textAt(11));

console.log('\n== 幂等 ==');
const before = root.childNodes.map(function (n) {
  return n.childNodes && n.childNodes[0] ? n.childNodes[0].nodeValue : n.getAttribute('title');
});
try {
  new Function('window', 'document', 'NodeFilter', 'MutationObserver', 'require', src)(
    global.window, global.document, global.NodeFilter, global.MutationObserver, require
  );
} catch (e) { /* 第二份实例会被 __zhCnPatched 挡住 */ }
const after = root.childNodes.map(function (n) {
  return n.childNodes && n.childNodes[0] ? n.childNodes[0].nodeValue : n.getAttribute('title');
});
check('第二次载入不改变已译结果', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));

console.log('\n== 漏译收集 ==');
check('暴露了 __zhMissing', typeof global.window.__zhMissing === 'function');
if (typeof global.window.__zhMissing === 'function') {
  const m = global.window.__zhMissing();
  console.log('  收录漏译 ' + m.length + ' 条：' + JSON.stringify(m.slice(0, 12)));
  check('未登记句子被收录', m.indexOf('Some untranslated sentence here') >= 0);
}

console.log('\n== 结果 ==');
console.log('  通过 ' + pass + ' ，失败 ' + fail);
if (fail) process.exitCode = 1;
