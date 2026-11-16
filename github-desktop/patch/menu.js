/* GitHub Desktop 简体中文语言包 —— 主进程菜单补丁
 *
 * 注入方式：安装器在 resources/app/main.js 头部插入一行
 *     require("./zh-cn/menu.js");
 *
 * 原理：GitHub Desktop 只有一个菜单模板构造函数 build-default-menu，它产出的是
 * 普通对象数组，最终交给 electron 的 Menu.buildFromTemplate 构建。这里在模板进入
 * 原生层之前把 label 换成中文，所以：
 *   - 主菜单、右键菜单、Help 菜单全部覆盖（它们都走同一个入口）；
 *   - 应用里那条 "update-preferred-app-menu-item-labels" 的增量更新逻辑会重新
 *     调用同一个构造函数，产出的仍是中文，不会把菜单打回英文。
 *
 * 只改 label，不碰 id / role / accelerator / click，因此菜单事件与快捷键不受影响。
 */
'use strict';

(function () {
  var path = require('path');

  var dict;
  try {
    dict = require(path.join(__dirname, 'menu-zh.json'));
  } catch (e) {
    console.error('[zh-cn] 菜单字典加载失败，跳过汉化：' + e.message);
    return;
  }

  // 运行时拼装的菜单项：label 由变量算出，静态字典匹配不到，用规则兜。
  // 保留原有的 & 助记字母，避免快捷键失效。
  var rules = [
    [/^&Open in (.+)$/, '在 $1 中打开(&O)'],
    [/^O&pen in (.+)$/, '在 $1 中打开(&P)'],
    [/^&Update from (.+)$/, '从 $1 更新(&U)'],
  ];

  var missing = [];

  function translate(label) {
    if (typeof label !== 'string' || label === '') return label;
    if (Object.prototype.hasOwnProperty.call(dict, label)) return dict[label];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][0].test(label)) return label.replace(rules[i][0], rules[i][1]);
    }
    return label;
  }

  function walk(items) {
    if (!Array.isArray(items)) return;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== 'object') continue;

      if (typeof item.label === 'string' && item.label !== '') {
        var next = translate(item.label);
        if (next === item.label && /[A-Za-z]{3,}/.test(item.label) && missing.indexOf(item.label) < 0) {
          missing.push(item.label);
        }
        item.label = next;
      }

      if (Array.isArray(item.submenu)) walk(item.submenu);
    }
  }

  var electron;
  try {
    electron = require('electron');
  } catch (e) {
    return;
  }

  var Menu = electron && electron.Menu;
  if (!Menu || typeof Menu.buildFromTemplate !== 'function') return;
  if (Menu.__zhCnPatched) return;

  var original = Menu.buildFromTemplate;

  Menu.buildFromTemplate = function (template) {
    try {
      walk(template);
    } catch (e) {
      console.error('[zh-cn] 菜单翻译异常，回退原文：' + e.message);
    }
    return original.call(Menu, template);
  };

  Menu.__zhCnPatched = true;

  if (process.env.KOSTO_ZH_VERBOSE === '1') {
    console.log('[zh-cn] 菜单补丁已装载，词条 ' + Object.keys(dict).length + ' 条');
    if (missing.length) console.log('[zh-cn] 未命中词条：' + JSON.stringify(missing));
  }
})();
