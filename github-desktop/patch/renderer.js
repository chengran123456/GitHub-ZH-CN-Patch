/* GitHub Desktop 简体中文语言包 —— 渲染进程补丁
 *
 * 注入方式：安装器在 resources/app/index.html 的 </head> 前插入
 *     <script defer src="zh-cn/renderer.js"></script>
 *
 * 为什么不做字面量替换：renderer.js 是 3.3MB 的压缩产物，"Changes" 这类短串在
 * 里面出现多次，分别属于类名、事件名、状态值。整片替换必然污染非 UI 用途。
 * 所以这里改在 DOM 层：只有当一段文字/属性值精确命中字典时才替换，命中不了就
 * 原样不动。字典里只放界面上真会出现的句子，所以误伤概率接近于零。
 *
 * 三条安全约束：
 *   1. 已经含中文的文本一律跳过 —— 既保证幂等，也天然阻断「翻译→再翻译」死循环；
 *   2. pre/code/textarea/input 与差异视图容器整棵子树跳过 —— 代码内容、diff 内容、
 *      用户输入永远不能被改；
 *   3. 只做整串精确匹配 + 少量句式规则，不做子串替换。
 */
'use strict';

(function () {
  if (window.__zhCnPatched) return;
  window.__zhCnPatched = true;

  var DICT = __ZH_DICT__;
  var PATTERNS = __ZH_PATTERNS__;

  var CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

  var SKIP_TAGS = {
    PRE: 1, CODE: 1, KBD: 1, SAMP: 1, TEXTAREA: 1, INPUT: 1,
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, CANVAS: 1,
  };
  var SKIP_CLASS = /(^|\s)(diff|diff-line|blob|blob-wrapper|monaco-editor|cm-editor|cm-content|code-view|highlight)(\s|$)/;

  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

  // 自身或任意祖先命中禁区 → 整块不动。
  // 用 className 字符串而不是 classList，既兼容 SVG，也少一层依赖。
  function isBlocked(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (SKIP_TAGS[node.tagName]) return true;
      if (node.getAttribute && node.getAttribute('contenteditable') === 'true') return true;
      if (typeof node.className === 'string' && SKIP_CLASS.test(node.className)) return true;
      node = node.parentElement;
    }
    return false;
  }

  // 属性单独判：input / textarea 自身的 placeholder 必须允许翻译，
  // 但它们的祖先若在禁区里就仍然跳过。
  function isBlockedForAttr(el) {
    var node = el.parentElement;
    while (node && node.nodeType === 1) {
      if (SKIP_TAGS[node.tagName]) return true;
      if (node.getAttribute && node.getAttribute('contenteditable') === 'true') return true;
      if (typeof node.className === 'string' && SKIP_CLASS.test(node.className)) return true;
      node = node.parentElement;
    }
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CANVAS' || tag === 'SVG') return true;
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
    if (typeof el.className === 'string' && SKIP_CLASS.test(el.className)) return true;
    return false;
  }

  var missing = [];
  var missingSeen = Object.create(null);

  function translate(text) {
    var key = text;
    if (Object.prototype.hasOwnProperty.call(DICT, key)) return DICT[key];
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      if (p.re.test(key)) return key.replace(p.re, p.to);
    }
    return null;
  }

  function noteMissing(text) {
    if (missing.length >= 3000) return;
    if (text.length < 2 || text.length > 200) return;
    if (missingSeen[text]) return;
    missingSeen[text] = 1;
    missing.push(text);
  }

  // ---- 文本节点 ----
  function handleText(node) {
    var raw = node.nodeValue;
    if (!raw) return;
    var key = raw.trim();
    if (!key || key.length > 200) return;
    if (CJK.test(key)) return;
    if (!/[A-Za-z]{2}/.test(key)) return;

    var el = node.parentElement;
    if (el && isBlocked(el)) return;

    var zh = translate(key);
    if (zh === null) {
      if (el) noteMissing(key);
      return;
    }
    if (zh === key) return;
    var at = raw.indexOf(key);
    if (at < 0) return;
    node.nodeValue = raw.slice(0, at) + zh + raw.slice(at + key.length);
  }

  // ---- 属性 ----
  function handleAttr(el, name) {
    if (!el.getAttribute) return;
    var raw = el.getAttribute(name);
    if (!raw) return;
    var key = raw.trim();
    if (!key || key.length > 200) return;
    if (CJK.test(key)) return;
    if (isBlockedForAttr(el)) return;

    var zh = translate(key);
    if (zh === null || zh === key) return;
    el.setAttribute(name, raw.replace(key, zh));
  }

  function walk(root) {
    if (!root) return;
    var top = root.nodeType === 9 ? root.body : root;
    if (!top) return;

    var stack = [top];
    while (stack.length) {
      var node = stack.pop();
      if (!node) continue;

      if (node.nodeType === 3) { handleText(node); continue; }
      if (node.nodeType !== 1) continue;

      // 先处理属性：input / textarea 自身虽有禁区标签，但 placeholder 该翻。
      // handleAttr 内部用 isBlockedForAttr 单独判定。
      for (var a = 0; a < ATTRS.length; a++) handleAttr(node, ATTRS[a]);

      // 再决定要不要深入子树：禁区整棵跳过，既保证安全也省掉无谓遍历
      if (isBlocked(node)) continue;

      var kids = node.childNodes;
      for (var i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  }

  var pending = null;
  function flush() {
    var roots = pending;
    pending = null;
    if (!roots) return;
    for (var i = 0; i < roots.length; i++) {
      try { walk(roots[i]); } catch (e) { /* 单个节点失败不影响整体 */ }
    }
  }

  function queue(node) {
    if (!node) return;
    if (!pending) {
      pending = [];
      Promise.resolve().then(flush);
    }
    pending.push(node);
  }

  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'characterData') queue(r.target);
      else if (r.type === 'attributes') queue(r.target);
      else {
        for (var j = 0; j < r.addedNodes.length; j++) {
          var added = r.addedNodes[j];
          if (added.nodeType === 3 && added.parentElement && !isBlocked(added.parentElement)) queue(added);
          else if (added.nodeType === 1) queue(added);
        }
      }
    }
  });

  function start() {
    try { walk(document); } catch (e) { console.error('[zh-cn] 首次翻译失败：' + e.message); }
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // ---- 漏译收集：便于后续按真实界面补词条 ----
  window.__zhMissing = function () {
    return missing.slice().sort();
  };

  try {
    var fs = require('fs');
    var path = require('path');
    var outPath = path.join(__dirname || '.', 'zh-cn', 'missing.txt');
    if (fs.existsSync(path.join(__dirname || '.', 'zh-cn', 'collect.flag'))) {
      setInterval(function () {
        try { fs.writeFileSync(outPath, missing.slice().sort().join('\n'), 'utf8'); } catch (e) { /* ignore */ }
      }, 5000);
      window.addEventListener('beforeunload', function () {
        try { fs.writeFileSync(outPath, missing.slice().sort().join('\n'), 'utf8'); } catch (e) { /* ignore */ }
      });
      console.log('[zh-cn] 漏译收集已开启，将写入 ' + outPath);
    }
  } catch (e) { /* 无 Node 权限时静默跳过 */ }
})();
