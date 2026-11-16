# GitHub Desktop 简体中文语言包

给 [GitHub Desktop](https://desktop.github.com/) 3.6.x 的 Windows 版做界面汉化。不需要重新打包、不修改安装包，装完直接是中文。

> 本包只改三处：主进程菜单、渲染层 DOM、以及一个注入入口。原始文件全部备份，一条命令还原。

```powershell
.\install.ps1      # 装
.\install.ps1 -Verify      # 查
.\install.ps1 -Uninstall   # 撤
```

## 现状

| | 覆盖情况 |
|---|---|
| 原生菜单栏 | **56 / 56**，含 File / Edit / View / Repository / Branch / Help 及全部右键菜单 |
| 界面文案 | **648 / 1061** 条字面量，890 条词条 + 22 条句式规则 |
| 分支名插值 | 工具栏 `Fetch/Pull/Push/{分支名}` 等运行时拼接文案走规则匹配 |
| 禁区保护 | diff 内容、代码区、用户输入、文件路径、SHA **全程不读不改** |
| 升级影响 | Squirrel 换目录，**升级后需重跑一次安装脚本** |

两个离线验收测试（不需要启动应用）：`node build/test-menu.js` 18 项、`node build/test-renderer.js` 21 项，全绿。

## 为什么自己写

市面上 GitHub Desktop 的"汉化"多数是整片替换 `renderer.js` 里的字符串 —— 那必然翻车：

- `"Changes"` 在 3.3 MB 的压缩产物里出现 4 次，分属类名、事件名、状态值
- 最显眼的 `Fetch origin` **根本没有字面量**，是 `` `Fetch ${remoteName}` `` 拼出来的，替换一个都命中不了
- 一旦误伤 diff 渲染，你看到的代码会变成中文注释

本包换了个思路：**不动打包产物一个字节，改在 DOM 层做整串精确匹配**。英文原文命中才替换，命中不了原样不动。另有三条硬约束（`pre`/`code`/`textarea`/`contenteditable` 与 diff 容器整棵子树跳过、`input` 的 `value` 永不读写、句式规则强制 `^...$` 锚定），全部写成了测试用例。

---


## 一、为什么不能照搬 git-gui 那套做法

git-gui 自带 Tcl `msgcat` 国际化框架，汉化就是填一张 `msgid → 译文` 的表。GitHub Desktop 完全没有这层东西：

```
react-intl        0 处
i18next           0 处
formatMessage     0 处
FormattedMessage  0 处
```

所以这次不是"翻译"，是**给一个单体 React 应用硬注入翻译层**。性质完全不同，工作量也不是一个量级。

## 二、实测到的结构（3.6.10）

| 项目 | 实测结果 | 对汉化的意义 |
|---|---|---|
| `resources/app/` | 解包目录，**无 asar** | 可以直接改文件，不用拆包工具 |
| `renderer.js` | 3.31 MB 压缩产物 | 不能做整片字面量替换 |
| `renderer.js.map` | 12 MB，1242 个源文件带 `sourcesContent` | 原始 TSX 全部可读，抽词条不靠猜 |
| `main.js` | 235 KB，头部是 LICENSE 注释 + IIFE | 可以在头部安全 prepend |
| 主窗口 `webPreferences` | `nodeIntegration: true`、`contextIsolation: false` | 渲染进程有完整 Node 权限，注入成本极低 |
| 完整性校验 | 无本地校验 | `bundleHash` 只随崩溃报告上报，不拦补丁 |
| 更新机制 | Squirrel，每次升级新建 `app-X.Y.Z` 目录 | 补丁必随升级失效，必须能重打 |

`app-3.6.7` 和 `app-3.6.10` 同时躺在磁盘上，就是更新机制的实证。

## 三、三层注入点

### 第 1 层：原生菜单栏 —— `main.js`

GitHub Desktop 只有一个菜单模板构造函数 `build-default-menu`，编译后叫 `Tt(e)`，产出普通对象数组，最终交给 `electron.Menu.buildFromTemplate`。

而 `main.js` 里取 electron 的方式是：

```js
le = n.cw(function (e, t) { e.exports = require("electron") })
```

这是 Node 的模块缓存包装 —— 意味着**只要在 main.js 最前面 patch 一次 `Menu.buildFromTemplate`，主菜单、右键菜单、Help 菜单全部过这个口**，一处补丁覆盖所有原生菜单。

补丁只改 `label`，不碰 `id` / `role` / `accelerator` / `click`，所以菜单事件和快捷键不受影响。

> **必须知道的坑**：应用里有一条 `update-preferred-app-menu-item-labels` 的增量更新逻辑，会按 `id` 逐项 diff 然后回写 label。因为回写源同样是 `Tt()`、走的是同一个补丁，产出的仍是中文，不会被"打回英文"。不理解这点很容易误判成"改完过一会儿菜单自己变回去了"。

**结果：生产可见菜单 56 条，命中 56 条，100%。**

开发者测试菜单（`Crash main process…` 那 40 多条）在生产版里被 `GITHUB_DESKTOP_PREVIEW_FEATURES === "1"` 门控，根本不渲染，已正确排除。

### 第 2 层：界面文案 —— `index.html` + DOM 翻译器

**为什么不做字面量替换**：`renderer.js` 是 3.3 MB 压缩产物，`"Changes"` 这种短串在里面出现多次，分别属于类名、事件名、状态值。整片替换必然污染非 UI 用途。

**为什么 DOM 层可行**：字典里只放界面上真会出现的英文原句。命中才替换，命中不了原样不动。已含中文的文本直接跳过 —— 这一条同时解决幂等和"翻译→再翻译"死循环。

翻译范围：

- 文本节点（整串精确匹配 + 22 条句式规则）
- `title` / `placeholder` / `aria-label` / `alt` 四个属性

三条安全约束（已写成测试用例）：

1. **禁区不碰**：`pre` / `code` / `kbd` / `samp` / `textarea` / `script` / `style` / `svg` / `canvas`、`contenteditable`、以及 class 命中 `diff` / `blob` / `monaco-editor` / `cm-editor` 的容器，整棵子树跳过。
2. **用户数据不碰**：`input` 的 `value` 永远不读不改，只翻 `placeholder`。
3. **只做整串匹配**：所有句式规则强制 `^...$` 锚定，绝不写子串替换。

React 会覆盖 DOM，所以用 `MutationObserver` 反复纠偏（`childList` + `characterData` + `attributes`），按微任务批量处理。

**结果：界面词条 890 条，覆盖抽取到的界面字面量 648 / 1061。**

没覆盖的 413 条主要是：CSS 类名组合（如 `ecs-meta-item tags selectable`，本来就不该翻）、纯无障碍标签（如 `Resize handle`，屏幕上不可见，翻了反而可能破坏 e2e 选择器）、以及只在极窄流程里出现的 Copilot 错误文案。

### 第 3 层：安装与重打

见下一节。

## 四、安装

```powershell
# 在仓库根目录
.\install.ps1
```

脚本会：

1. 自动在 `%LOCALAPPDATA%\GitHubDesktop` 下找出**版本号最高**的 `app-X.Y.Z`（不会误装到旧版本）
2. 把原始 `main.js` / `index.html` 备份到 `%LOCALAPPDATA%\GitHubDesktop\zh-cn-backup\app-X.Y.Z\`
3. 写入 `resources/app/zh-cn/`（`menu.js`、`menu-zh.json`、`renderer.js`）
4. 在 `main.js` 头部插一行 `require("./zh-cn/menu.js");`
5. 在 `index.html` 的 `</head>` 前插一个 `<script defer src="zh-cn/renderer.js">`
6. 写 `manifest.json` 记录版本与哈希

注入是**幂等**的，重复安装不会插出两条。备份也**只存第一次**——避免第二次安装把已经打过补丁的文件当成原件存起来。

装完**必须完全退出再重开**（托盘图标也要退：右下角 → 右键 → Quit）。

## 五、还原

```powershell
.\install.ps1 -Uninstall
```

从备份恢复 `main.js` / `index.html`，删掉 `zh-cn/` 目录。备份本身保留，方便再装回去。

```powershell
node build/restore.js --list    # 看看都有哪些版本的备份
```

## 六、校验

```powershell
.\install.ps1 -Verify
```

检查注入点完整性、补丁产物语法、菜单覆盖率、字典自检。当前状态：

```
通过 15 ，失败 0 ，警告 0
```

配套的两套离线验收测试（不需要启动 GitHub Desktop）：

```
node build/test-menu.js       # 通过 18 ，失败 0
node build/test-renderer.js   # 通过 21 ，失败 0
```

`test-menu.js` 会把 `main.js` 里真实的 56 条 label 全量喂进补丁跑一遍，并验证 `id` / `click` / `role` / `separator` 结构不被破坏、重复调用幂等、异常输入不崩。

`test-renderer.js` 手搓了一个最小 DOM，重点验"不做坏事"：`pre` / `code` / `contenteditable` / `diff-line` 里的内容一个字都不许动。

> 顺带说：这个测试**抓到过一个真 bug** —— 早期版本只在"收集漏译"时检查禁区，真正翻译时没检查，导致 diff 内容被翻。这类问题静态检查发现不了，必须跑。

## 七、升级之后怎么办

Squirrel 每次升级都装到新的 `app-X.Y.Z` 目录，**补丁必然失效**。重新打开 GitHub Desktop 会看到英文界面，这是预期行为。

处理办法：**升级后重跑一次 `.\install.ps1`**。脚本会自动探测到新版本目录，备份新版本的原件，重新注入。

旧版本目录的备份会留着，不占多少空间（两个文件，约 230 KB）。想清理就删 `zh-cn-backup` 下过期的 `app-*`。

## 八、补词条：让它自己报缺什么

GitHub Desktop 有 1000 多条界面文案，其中相当一部分只在特定流程里出现（某种冲突、某种鉴权失败、某个 Copilot 状态）。与其凭空猜，不如让它自己报上来。

```powershell
.\install.ps1 -Collect        # 开启收集
# 重启 GitHub Desktop，把各个页面、对话框都点一遍
node build/collect.js --import # 整理成 src/missing-todo.json
# 手动填中文
node build/collect.js --merge  # 并进主字典
node build/apply.js            # 重装生效
```

收集结果写在 `resources/app/zh-cn/missing.txt`，每 5 秒刷新一次，关窗时也会写。

也可以在开发者工具（菜单「切换开发者工具」）里直接跑 `__zhMissing()` 看当前页面的漏译。

## 九、目录结构

```
ghd-zh/
├── src/
│   ├── menu-zh.json        # 菜单词条（含 & 加速键）
│   ├── ui-zh.json          # 界面词条（890 条）
│   └── patterns.json       # 句式规则（22 条，全部整串锚定）
├── patch/
│   ├── menu.js             # 主进程菜单补丁（注入到 zh-cn/menu.js）
│   └── renderer.js         # 渲染层补丁模板，占位符由 apply.js 填充
├── build/
│   ├── apply.js            # 安装（探测版本 → 备份 → 注入）
│   ├── restore.js          # 还原
│   ├── verify.js           # 校验
│   ├── audit.js            # 覆盖率审计
│   ├── collect.js          # 漏译收集
│   ├── test-menu.js        # 菜单离线验收测试
│   └── test-renderer.js    # 渲染层离线冒烟测试
├── tools/
│   ├── extract-lit.js      # 从 sourcemap 抽全部字符串字面量
│   ├── extract-bundle.js   # 从打包产物抽（备用）
│   ├── dump-priority.js    # 按模块导出缺失词条
│   └── ...
├── ref/                    # 抽取产物、缺失清单（可删，重新生成）
└── install.ps1
```

## 十、踩过的坑

1. **`__DARWIN__` 三元式**。GitHub Desktop 的界面文案几乎都写成 `__DARWIN__ ? 'Discard Changes' : 'Discard changes'`。按"属性 / JSX 文本"匹配的抽取器会**全部漏掉**，因为它们出现在 `return` 语句里。改成扫源码里所有字符串字面量才抓全。好在 `__DARWIN__` 编译时被替换成 `false`，产物里只有 Windows 那份，两个变体都收录、译成同一个中文即可。

2. **工具栏最显眼的按钮根本没有字面量**。`"Fetch origin"` 在 bundle 里命中 **0 次**，实际是 `` `Fetch ${remoteName}` ``。所以纯字典不够，必须配句式规则。

3. **禁区检查的位置比想象中重要**。早期版本把 `blocked()` 只放在"收集漏译"路径上，翻译路径没查，结果 `pre` / `code` / `diff-line` 里的内容被改写 —— 这是会直接破坏 diff 视图的严重问题。现在改成遍历时整棵子树跳过。

4. **`input` 的 `placeholder` 要单独放行**。如果对 `input` 一票否决，搜索框的占位符就永远是英文。现在属性判定单独走 `isBlockedForAttr`：祖先在禁区里才跳过，元素自身是 `input` / `textarea` 时允许翻 `placeholder`。

5. **匹配用 `className` 字符串而不是 `classList`**。`classList` 在 SVG 和某些桩环境里不存在，用 `className` 更稳。

6. **短串歧义**。`"Changes"` 在 bundle 里出现 4 次、`"History"` 3 次、`"Options"` 5 次，分属不同用途。所以坚决不做字面量替换，只在 DOM 层做整串精确匹配。

7. **幂等靠"译后不再命中"**。中文译文不会等于任何英文键，所以第二次处理时自然收敛，不需要额外的"已处理"标记。这个性质同时防住了死循环。

8. **备份不能覆盖**。第二次安装时如果还去复制 `main.js`，存下来的就是已经打过补丁的版本，还原会还原成补丁版。现在只在备份不存在时才写。

9. **版本号不能按字符串排序**。`'app-3.6.10'` 和 `'app-3.6.7'` 字符串比较会把 3.6.7 排在后面，导致装到旧版本。必须按数字段比较。

10. **`bundleHash` 会变，但不影响使用**。`main.js` 里对 7 个核心文件做 sha256，只在崩溃报告时 POST 给 GitHub。改了文件哈希会变，但没有任何本地校验拦你。

## 十一、已知限制

- **只覆盖 Windows 分支文案**。GitHub Desktop 用 `__DARWIN__` 编译期常量区分平台，本包按 Windows 版（`__DARWIN__ = false`）抽取。
- **纯无障碍标签按设计不翻**。`Current branch dropdown button`、`Resize handle` 这类只给读屏软件用，屏幕上不可见，翻了对用户没有收益，还可能破坏 e2e 选择器。
- **分支名 / 仓库名 / 文件名有极小概率被误翻**。如果某个分支恰好叫 `Changes` 或 `History`，它显示出来会变成中文。概率极低，且只是显示层面，不影响任何 git 操作。遇到的话把那个词条从 `ui-zh.json` 里删掉即可。
- **升级必失效**，需要重跑安装脚本，这是 Squirrel 的机制决定的，没有干净的绕法。
- **没有改任何与 git 数据相关的东西**。diff 内容、文件路径、提交信息、SHA 全程不读不改。

## 十二、许可

GitHub Desktop 本身是 MIT 许可（见 [desktop/desktop](https://github.com/desktop/desktop)）。本语言包不改动其源码逻辑，只做运行时界面文本替换，随附同样的 MIT 许可。

译文为本人手工翻译，欢迎提 issue 修正。
