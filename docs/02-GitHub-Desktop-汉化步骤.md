# 02 · GitHub Desktop 汉化步骤

目标应用：GitHub Desktop **3.6.11**（Squirrel 安装，Electron）
产出：`resources\app\zh-cn\` 三个文件 + 两处加载点注入

---

## 1. 原理：为什么不做"整片字符串替换"

3.6.11 的 `renderer.js` 有 3.3 MB（压缩后），如果直接把 `"Changes"` 换成 `"更改"`，会炸掉一堆东西——因为 `Changes` 在文件里出现 4 次，分属**类名**、**事件名**、**状态 key**、**界面文案**，字面量替换无法区分。

所以这个方案用**三个注入点**，各管一件事：

### 注入点 ①：菜单栏 —— 改 Electron 原生菜单的 label

```js
// main.js 头部（新增一行）
require("./zh-cn/menu.js");
```

`zh-cn/menu.js` 的机制是**包装** `Menu.buildFromTemplate`：

- 遍历模板，把 `label` 换成中文；
- **只改 `label`**，`id` / `role` / `accelerator` / `click` / `submenu` 全部原样保留；
- 因此"文件 → 退出"这类菜单项的**行为**完全不变，只是字变了；
- 词条来自 `zh-cn/menu-zh.json`（74 条），覆盖全部 56 条生产菜单（slug 级对齐，不是文本模糊匹配）。

### 注入点 ②：界面文字 —— DOM 层整串精确匹配

```html
<!-- index.html 的 </head> 之前（新增一行） -->
<script defer src="zh-cn/renderer.js"></script>
```

`zh-cn/renderer.js` 只做三件事：

1. **文本节点**：`node.nodeValue` 去空白后与 `src/ui-zh.json`（899 条）做**整串完全相等**比较，命中才替换——不做子串、不做模糊、不做包含匹配；
2. **四个属性**：`title` / `placeholder` / `aria-label` / `alt`，同样整串比较；
3. **句式规则**：`src/patterns.json`（24 条）处理运行时拼出来的文案，如 `Commit to main`、`0 changed files`、`Pull origin`。**每条规则都强制 `^...$` 两端锚定**，绝不允许子串匹配。

保活机制：`MutationObserver` 监听 DOM 变化 + 微任务批量纠偏，保证异步渲染出来的文字也能被翻译；同时自身有幂等保护（翻译过的节点不会再被翻译第二遍）。

### 注入点 ③：备份与还原

首次安装前把**要改的文件**原样复制到：

```
%LOCALAPPDATA%\GitHubDesktop\zh-cn-backup\app-3.6.11\
    ├── main.js
    ├── index.html
    └── manifest.json   ← 记录哈希，用于判断"是否已注入 / 是否与备份一致"
```

备份**只做第一次**：重复执行 `apply.js` 不会用"已改过的文件"覆盖掉原始备份（这点很关键，否则还原就废了）。

---

## 2. 安全约束（脚本里写死的规则）

| 约束 | 原因 |
| --- | --- |
| 跳过 `pre` / `code` / `kbd` / `samp` / `textarea` / `input` / `script` / `style` / `svg` / `canvas` 整棵子树 | 这些区域是代码、命令、快捷键、画布，翻译会破坏复制粘贴和语义 |
| 跳过 `contenteditable="true"` | 用户正在输入的内容不能被动 |
| 跳过 class 命中 `diff` / `blob` / `monaco-editor` / `cm-editor` / `code-view` / `highlight` 的子树 | 代码 diff 与编辑器区域必须原样 |
| `input` 的 `value` **永不读写**，只翻 `placeholder` | 避免动到用户输入 / 表单提交值 |
| 句式规则必须 `^...$` 锚定 | 防止把一句里的一个词换掉造成语法崩坏 |

顺带说明：这套语言包**没有任何网络请求**（只做本地文件读写），安装前我已逐行读过 `apply.js` / `menu.js` / `renderer.js`。

---

## 3. 安装步骤（逐步）

### 3.1 前置检查

```powershell
# Node.js（本机为 v22.x）
node --version

# 确认安装目录是解包形态（存在 resources\app\src，不是单一 asar 文件）
Test-Path "$env:LOCALAPPDATA\GitHubDesktop\app-3.6.11\resources\app\main.js"
```

> **Node.js 是硬性前置**：`apply.js` / `verify.js` / `restore.js` 全部是 Node 脚本，没装 Node 会直接报错退出。
> **重复执行是安全的**：已经注入过时，`apply.js` 只输出「main.js 已注入，跳过 / index.html 已注入，跳过」；备份只保留第一次的原件，不会用"已改过的文件"覆盖原始备份，所以**反复跑不会破坏可还原性**。

### 3.2 执行安装

```powershell
cd github-desktop
node build\apply.js
```

正常输出（本机实测）：

```
探测到 GitHub Desktop 版本：3.6.11
词条：菜单 74 / 界面 890 / 句式 22
备份完成：%LOCALAPPDATA%\GitHubDesktop\zh-cn-backup\app-3.6.11
已写入 zh-cn/menu.js, menu-zh.json, renderer.js
main.js 已注入，跳过
index.html 已注入，跳过
完成。请完全退出 GitHub Desktop 后重新打开（托盘也要退），菜单栏与界面即为中文。
还原：node build/restore.js
```

> 说明：`apply.js` 是**幂等**的——第二次运行会显示"已注入，跳过"，不会重复插入 `<script>` 或 `require`。
> （本机在首轮之后又补了 8+1 条词条、2 条句式，最终规模为 **界面 899 条 / 句式 24 条**，重新执行后 verify 仍为 15/0/0。）

### 3.3 重启应用

**必须完全退出**（Electron 会留托盘/后台进程，只关窗口不算）：

```powershell
Get-Process GitHubDesktop -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process "$env:LOCALAPPDATA\GitHubDesktop\GitHubDesktop.exe"
```

也可以走 GUI：右下角托盘图标右键 → Quit，然后重新打开。

### 3.4 装完的目录形态

```
%LOCALAPPDATA%\GitHubDesktop\app-3.6.11\resources\app\
├── main.js          ← 头部多了 1 行 require("./zh-cn/menu.js")
├── index.html       ← </head> 前多了 1 行 <script defer src="zh-cn/renderer.js">
└── zh-cn\
    ├── menu.js      (3120 B)
    ├── menu-zh.json (3464 B)
    └── renderer.js  (53983 B)
```

---

## 4. 自检

```powershell
cd github-desktop
node build\verify.js        # 期望：通过 15，失败 0，警告 0
node build\test-menu.js     # 期望：通过 18
node build\test-renderer.js # 期望：通过 21
```

`verify.js` 检查的内容：菜单静态词条 56/56 全覆盖、`renderer.js` 语法可解析、`placeholder` 全部替换、句式规则全部带锚定、注入点存在且只有一处、备份哈希与当前文件的关系。

---

## 5. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 界面还是英文 | 没有完全退出应用（托盘仍驻留）。`Stop-Process` 后重开 |
| 菜单中文但页面英文 | `index.html` 的 `<script>` 没生效：检查 `zh-cn\runtime.js` 是否存在、路径是否为 `zh-cn/renderer.js`；再看开发者工具 Console 有无报错 |
| 启动就白屏 / 报错 | 还原：`node build\restore.js`，然后用 `verify.js` 对比哈希确认文件已回到原始状态 |
| 某条文案没翻 | 加词条：编辑 `src\ui-zh.json`（整串作为 key），或给运行时拼装的文案加 `src\patterns.json` 规则（必须 `^...$`），再跑 `apply.js` + 重启 |
| 升级后发现中文没了 | 正常现象，新版本落在新的 `app-X.Y.Z` 目录；到新目录重跑 `node build\apply.js` |
