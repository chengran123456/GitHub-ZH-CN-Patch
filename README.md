# GitHub 简体中文补丁

> 让 Windows 上的 **GitHub Desktop** 与 **GitHub Copilot 桌面版** 显示中文界面的完整方案、最终代码与实测记录。

![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)
![GitHub Desktop](https://img.shields.io/badge/GitHub%20Desktop-3.6.11-informational)
![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-1.4.2-informational)
![license](https://img.shields.io/badge/license-MIT-green)

---

## 一句话结论

GitHub 官方**没有**给这两个客户端做中文界面，而且不是"设置里藏着一个开关"，是**根本没有中文资源**。本仓库做的是在这两个应用的**界面渲染层**动手术：

| 应用 | 技术栈 | 汉化手段 | 是否需要特殊启动方式 |
| --- | --- | --- | --- |
| GitHub Desktop 3.6.11 | Electron（`resources/app` 解包，`nodeIntegration: true`） | 静态注入：改两个加载点 + DOM 层整串精确匹配翻译 | 不需要，正常双击即可 |
| GitHub Copilot 1.4.2 | Tauri + WebView2（单文件 `github.exe`） | 运行时注入：WebView2 CDP + DOM 翻译器 | **需要**，必须用中文启动器 |

两者共同的设计原则：**不碰安装包、不碰主程序二进制、不碰业务逻辑，只翻译"看得见的文字"**，并且都能一条命令还原。

---

## 实测效果

下面的文字不是"应该是中文"，是从**正在运行的程序里读回来的真实界面文本**（读取方法见 [`docs/04-验证与排障.md`](docs/04-验证与排障.md)）。

**GitHub Desktop** —— 菜单栏、工具栏、空仓库引导卡片：

```
文件(F)   编辑(E)   视图(V)   仓库(R)   分支(B)   帮助(H)
当前仓库 / 当前分支 / 更改 / 历史 / 0 个文件已更改
提交摘要 / 提交描述 / 新建 / 提交到 main / 已提交 40 minutes ago
没有本地更改
此仓库没有未提交的更改。这里有一些接下来可以做的事。
将仓库发布到 GitHub
此仓库目前只存在于你的本机。发布到 GitHub 后即可分享并与他人协作。
在资源管理器中查看仓库中的文件 / 在 Notepad++ 中打开(O)
```

**GitHub Copilot** —— 侧边栏、欢迎页、按钮与提示：

```
侧边栏 / 快捷链接 / 新建 / 拉取请求 / 问题 / 自动化 / 自定义 / 项目 / 暂无项目
会话 / 还没有会话 / 积分 0 / 交互式 / 默认 / 聊天
可以询问任何问题或粘贴 URL。使用 / 执行命令、& 查找会话、# 查找问题…
新建会话，Ctrl + N。新建聊天，Ctrl + Shift + N。
本机 / 从这些项目创意中选一个开始吧。
```

窗口标题也会被改成「GitHub Copilot 中文版」，方便你确认启动的是哪一份。

---

## 仓库结构

```
github-zh-cn-patch/
├── README.md                    ← 你正在看的文件
├── LICENSE                      ← MIT（含上游版权声明）
├── docs/
│   ├── 01-官方为什么没有中文.md      ← 取证过程与结论
│   ├── 02-GitHub-Desktop-汉化步骤.md
│   ├── 03-GitHub-Copilot-汉化步骤.md
│   ├── 04-验证与排障.md
│   └── 05-还原与升级.md
├── github-desktop/              ← GitHub Desktop 语言包（上游 Kosto179cn 项目快照 + 本仓库增补）
│   ├── build/                   ← apply.js / verify.js / restore.js 等安装脚本
│   ├── patch/                   ← 注入补丁源码
│   ├── src/                     ← 词条：ui-zh.json（899 条）、patterns.json（24 条）、menu-zh.json
│   ├── tools/                   ← 自测脚本
│   ├── install.ps1              ← 一键安装 / 卸载
│   ├── LICENSE                  ← 上游 MIT（Copyright (c) 2026 Kosto）
│   └── 本仓库改动说明.md
├── github-copilot/              ← Copilot 中文运行版（上游 Moyxi-Team 项目快照 + 本仓库增补）
│   ├── inject.js                ← CDP 注入器
│   ├── dictionary.json          ← 词典：texts 2299 / textPatterns 334 / attrs 213 / attrPatterns 90 / wholeElements 29
│   ├── 启动 GitHub Copilot 中文版.cmd
│   ├── 启动 GitHub Copilot 中文版.vbs
│   ├── LICENSE                  ← 上游 MIT（Copyright (c) 2026 zhao818）
│   └── 本仓库改动说明.md
└── tools/
    ├── probe-desktop.js         ← 只读探针：读 GitHub Desktop 界面文字（需 9223 调试端口）
    └── probe-copilot.js         ← 只读探针：读 Copilot 界面文字（9222）
```

---

## 快速开始

### A. GitHub Desktop（装完即中文，无需快捷方式）

```powershell
# 1) 进入 github-desktop 目录
cd github-desktop

# 2) 安装（自动探测最新 app-X.Y.Z、自动备份、幂等）
node build\apply.js

# 3) 完全退出 GitHub Desktop（托盘图标也要退），再正常打开
```

安装脚本会自动完成三件事，全部有备份、可回滚：

1. 把 `main.js` 的开头插入一行 `require("./zh-cn/menu.js");` —— 让原生菜单栏的 `label` 变成中文（只改 label，不动 `id` / `role` / `accelerator` / `click`）；
2. 在 `index.html` 的 `</head>` 前插入 `<script defer src="zh-cn/renderer.js"></script>` —— 页面里的文字在 DOM 层按"整串精确匹配"翻译，同时处理 `title` / `placeholder` / `aria-label` / `alt` 四个属性；
3. 首次安装前把要改的两个文件备份到 `%LOCALAPPDATA%\GitHubDesktop\zh-cn-backup\app-X.Y.Z\`。

### B. GitHub Copilot（必须用中文启动器启动）

```powershell
# 1) 把 github-copilot 整个目录复制到主程序旁边（相对路径 ..\github.exe 不能变）
$dst = "$env:LOCALAPPDATA\Programs\GitHub Copilot\GitHub Copilot 中文运行版"
New-Item -ItemType Directory -Path $dst -Force
Copy-Item .\github-copilot\* $dst -Recurse -Force

# 2) 完全退出 Copilot（任务栏图标右键退出），然后
& "$dst\启动 GitHub Copilot 中文版.vbs"
```

`启动 GitHub Copilot 中文版.vbs` 会隐藏命令行窗口地执行 `启动 GitHub Copilot 中文版.cmd`，后者做两件事：

```bat
set "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 --lang=zh-CN"
start "" /b "%ROOT%..\github.exe"
"%NODE_CMD%" "%ROOT%inject.js"
```

也就是：**给 WebView2 开一个只监听本机的调试端口（9222），再用 Node 通过 CDP 把 DOM 翻译器注入进去**，`inject.js` 之后每 3 秒轮询 + MutationObserver 保持翻译。

> ⚠️ **这是整个方案唯一的"使用习惯改变"**：以后请用这个启动器（或它生成的桌面快捷方式）启动 Copilot。直接点官方图标启动仍然是英文界面——因为英文是编译进 `github.exe` 的，中文是启动时注入的。

---

## 验证

两个只读探针脚本，用 CDP 读回页面真实文字，不信"看起来像中文"：

```powershell
# Copilot（先由中文启动器启动）
node tools\probe-copilot.js            # 默认端口 9222

# GitHub Desktop（只在验证时用调试端口启动一次）
& "$env:LOCALAPPDATA\GitHubDesktop\GitHubDesktop.exe" --remote-debugging-port=9223
node tools\probe-desktop.js            # 默认端口 9223
```

安装脚本自带的自检：

```powershell
cd github-desktop
node build\verify.js        # 期望：通过 15，失败 0，警告 0
node build\test-menu.js     # 菜单补丁单测
node build\test-renderer.js # DOM 翻译器单测
```

---

## 还原 / 升级

| 想要的结果 | 操作 |
| --- | --- |
| 还原 GitHub Desktop | `cd github-desktop; node build\restore.js`（或 `install.ps1 -Uninstall`） |
| 卸载 Copilot 中文版 | 退出进程后删除 `GitHub Copilot 中文运行版` 目录（`github.exe` 从没被改过） |
| GitHub Desktop 升级后中文没了 | 到新的 `app-X.Y.Z` 目录重跑一次 `node build\apply.js`（脚本会自动探测版本、只在首次备份） |
| Copilot 升级后中文不全 | 重开中文启动器；仍缺词就补 `dictionary.json`（3 秒热生效，不用重启） |

Squirrel 升级会换到新的 `app-3.7.x` 目录，旧目录的中文不会自动跟过去，这是这个方案的**已知代价**。

---

## 已知限制

1. **不是官方支持**：这是社区方案，GitHub 升级界面结构后可能需要补词或等上游更新。
2. **快捷键提示不翻**：`<kbd>` 元素里的 `Ctrl+Shift+A`、`Ctrl+P` 这类按键提示刻意保持英文（翻译键名反而会误导）。
3. **读屏专用文本不翻**：如 `Committed Just now - Initial commit (Sha: ...)`，它在 `sr-only` 节点里，屏幕上不可见。
4. **AI 生成内容不翻**：Copilot 的模型回复、代码块、会话标题一律原样保留——这是设计约束，避免污染代码。
5. **管理员权限**：若 Copilot 以管理员身份运行，WebView2 可能忽略用户级调试参数，需机器级策略 `HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`（仅本机 9222）。

---

## 上游项目与许可

本仓库是**二次整理**：代码主体来自两个 MIT 项目，版权归原作者；本仓库的增补（词条补全、启动器、文档、探针脚本）同样以 MIT 发布。

| 部分 | 上游项目 | 版权 |
| --- | --- | --- |
| `github-desktop/` | [Kosto179cn/github-desktop-zh-cn](https://github.com/Kosto179cn/github-desktop-zh-cn) | MIT, Copyright (c) 2026 Kosto |
| `github-copilot/` | [Moyxi-Team/copilot-desktop-zh-ai](https://github.com/Moyxi-Team/copilot-desktop-zh-ai) | MIT, Copyright (c) 2026 zhao818 |

上游 MIT 许可原文分别保留在两个子目录的 `LICENSE` 文件中，未做删改。详见 [`LICENSE`](LICENSE)。

---

## 免责声明

- 不提供 GitHub / Microsoft 任何形式的官方支持，与 GitHub, Inc. 无关联。
- 所有改动都只落在**本机应用目录 + 用户配置文件**，不改安装包、不改系统设置、不上传任何数据（两套脚本我都逐行读过：GitHub Desktop 语言包无任何网络请求；Copilot 注入器唯一的可选外呼是 `gh api` 拉取上游词典，本机没有 `gh` 时只是打一条警告）。
- 修改前请自行确认可接受风险，并保留各自的还原方式（见上表）。
