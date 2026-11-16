# 03 · GitHub Copilot 汉化步骤

目标应用：GitHub Copilot 桌面版 **1.4.2**（Tauri + WebView2，主程序 `github.exe` 约 567 MB）
产出：`GitHub Copilot 中文运行版\` 一个文件夹（含注入器、词典、启动器），**不修改 `github.exe`**

---

## 1. 原理：为什么只能在运行时注入

见 [01](01-官方为什么没有中文.md) 第 3 节：`github.exe` 里没有 `zh-CN`、没有 i18n 框架、没有语言资源；`data.db` 里也没有语言键。界面文字是硬编码英文，在 WebView2 渲染出来。

所以方案是：**给 WebView2 开一个调试端口 → 用 Chrome DevTools Protocol 把 DOM 翻译器注入页面 → 由注入器维持翻译状态**。

链路：

```
启动器（cmd/vbs）
   ├─ 设 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = --remote-debugging-port=9222 --lang=zh-CN
   ├─ start ..\github.exe            ← 正常启动官方主程序
   └─ node inject.js                 ← 通过 CDP 注入并保活
```

`--lang=zh-CN` 让 WebView2 的 Chromium 层按中文区域运行（日期/数字格式、拼写检查语言等更贴近中文习惯）；`--remote-debugging-port=9222` 是本机回环端口，仅 `127.0.0.1` 可访问。

### 注入器做的事

`inject.js` 连接 `http://127.0.0.1:9222`，拿到 WebView2 的页面列表，对以下两类页面注入：

- `http://tauri.localhost/` —— 主界面
- `http://127.0.0.1:<port>/canvases/<uuid>` —— 画布类子页面

注入方式是 `Runtime.evaluate` 执行一段自包含的 DOM 翻译器：

1. 遍历文本节点，与词典做整串匹配后替换；
2. 处理属性（`title` / `placeholder` / `aria-label` / `alt`）；
3. 用 `wholeElements` 规则处理整体替换的元素；
4. `MutationObserver` + **3 秒轮询**重新应用，保证异步渲染的文字也能跟上；
5. 自身幂等：翻译过的节点打标记，不会重复翻译。

**3 秒轮询还带来一个副作用式的便利：词典是热生效的**——改完 `dictionary.json`，3 秒内自动重读并应用，不用重启应用。

---

## 2. 词典结构

`dictionary.json` 是纯 JSON，全部文本可审计：

```json
{
  "texts":            { "Settings": "设置", "Pull requests": "拉取请求", ... },
  "contextualTexts":  { ... },
  "textPatterns":     [ { "re": "...", "to": "..." }, ... ],
  "attrs":            { "New project, Ctrl + Alt + Shift + N": "..." },
  "attrPatterns":     [ ... ],
  "wholeElements":    { ... }
}
```

本仓库当前的规模：

| 结构 | 条目数 | 用途 |
| --- | --- | --- |
| `texts` | **2299** | 文本节点整串匹配 |
| `textPatterns` | 334 | 运行时拼装的句子（含捕获组） |
| `attrs` | 213 | 属性值（tooltip / placeholder / aria-label） |
| `attrPatterns` | 90 | 属性值的模式匹配 |
| `wholeElements` | 29 | 整块元素替换 |
| `contextualTexts` | 2 | 上下文相关的同词不同义 |

**刻意不翻的部分**：

- AI 回复正文、代码块、命令、文件路径、会话标题 —— 一律原样保留，避免污染可复制内容；
- `pre` / `code` / `script` / `style` / `textarea` / `[contenteditable=true]` 子树整棵跳过；
- Ctrl 快捷键提示（`Ctrl + B` / `Ctrl + K` 等）保持英文，键名翻译反而误导。

---

## 3. 安装步骤（逐步）

### 3.1 前置

- **Node.js 必需**（本机 v22.x）：`inject.js` 是 Node 脚本。启动器按两种方式找 Node——先看 `%ProgramFiles%\nodejs\node.exe`，再 `where node`，两者都失败就 `exit /b 1`。
- Copilot 桌面版已安装：`%LOCALAPPDATA%\Programs\GitHub Copilot\github.exe`
- **Node 缺失时的表现是"静默失败"**：启动器由 `.vbs` 以 0 窗口方式拉起，没有 Node 时既不弹黑框也不报错，界面仍是英文。
  排查办法：手动在本目录双击运行 `启动 GitHub Copilot 中文版.cmd`（会露出命令行窗口，错误直接可见）。

### 3.2 部署目录（相对路径不能变）

启动器用 `%ROOT%..\github.exe` 找主程序，所以中文运行版目录必须**放在主程序同级**，目录名可以自取（建议就用 `GitHub Copilot 中文运行版`）。

> ⚠️ **该目录里只能有一个 `.cmd` 文件**（即自带的 `启动 GitHub Copilot 中文版.cmd`）。
> `启动 GitHub Copilot 中文版.vbs` 的实现是"遍历目录里的文件，**取第一个扩展名为 `.cmd` 的**当作启动器"，所以往里面再扔别的批处理（比如自己写的测试脚本）可能导致启动错文件、界面不生效。

```powershell
$dst = "$env:LOCALAPPDATA\Programs\GitHub Copilot\GitHub Copilot 中文运行版"
New-Item -ItemType Directory -Path $dst -Force
Copy-Item .\github-copilot\* $dst -Recurse -Force

# 校验相对路径是否指向真实主程序（应为 True）
Test-Path "$dst\..\github.exe"
```

目录内容：

```
GitHub Copilot 中文运行版\
├── inject.js                        (23030 B)
├── dictionary.json                  (257923 B)
├── 启动 GitHub Copilot 中文版.cmd     (548 B)
├── 启动 GitHub Copilot 中文版.vbs     (457 B)
├── LICENSE / README.md
└── cache\injector.log               ← 运行日志（自动生成）
```

### 3.3 完全退出 Copilot

```powershell
# 主程序与它的几个伴生进程都要退
Get-Process copilotapp,copilot-runtime,copilotapphost,github -ErrorAction SilentlyContinue |
    Stop-Process -Force
```

> 官方 Copilot 在运行时会拉起 `copilotapp` / `copilot-runtime` / `copilotapphost` 多个进程；关闭窗口不一定退干净，`Stop-Process` 最稳。

### 3.4 启动中文版

```powershell
& "$env:LOCALAPPDATA\Programs\GitHub Copilot\GitHub Copilot 中文运行版\启动 GitHub Copilot 中文版.vbs"
```

`vbs` 的作用就是**隐藏命令行窗口**地跑 `cmd`（否则会弹一个黑框，且 cmd 退出时可能带走子进程）。

建议再建一个桌面快捷方式，目标指向这个 `.vbs`，图标取 `icons\copilot.ico`。本机已建好（`GitHub Copilot 中文版.lnk`）。

### 3.5 确认生效

```powershell
Get-Content "$dst\cache\injector.log" -Tail 5
```

正常日志（本机实测）：

```
[copilot-zh] 汉化注入器 v7 已启动
[copilot-zh] 上游词典同步失败，将继续使用本地词典：spawn gh ENOENT
[copilot-zh] 11:16:41 apply: app:replaced:37
```

- `app:replaced:37` = 本次实际替换了 37 个文本节点（首轮数字随界面内容多少浮动）；
- `spawn gh ENOENT` 只是"没装 `gh`、无法拉取上游词典"的警告，**不影响使用**；
- 之后每隔 3 秒会打印 `apply: app:replaced:0`（幂等，说明已经稳定）。

再用只读探针读回真实界面文字：

```powershell
node tools\probe-copilot.js
```

---

## 4. 顺带把 Copilot 的"回复语言"也设成中文

界面和"AI 说话的语言"是两码事。Copilot 的回复语言由配置库里的 `instructions`（用户指令）控制：

```
%USERPROFILE%\.copilot\data.db  →  settings.instructions
```

本机写入的内容：

```
始终使用简体中文回答，包括解释、总结、计划与提示语。
代码、命令、文件名、路径、API/字段名、日志与报错原文保持原样，不要翻译。
除非我明确要求其他语言。
```

写法（先备份，再写，写完校验完整性）：

```powershell
# 1) 备份
Copy-Item "$env:USERPROFILE\.copilot\data.db" "$env:USERPROFILE\.copilot\data.db.bak"

# 2) 写入（Python 的 sqlite3 自带，无需装包）
python -c "import sqlite3;c=sqlite3.connect(r'C:\Users\10585\.copilot\data.db');c.execute('update settings set instructions=? where id=1',('始终使用简体中文回答，包括解释、总结、计划与提示语。\n代码、命令、文件名、路径、API/字段名、日志与报错原文保持原样，不要翻译。\n除非我明确要求其他语言。',));c.commit();print(c.execute('pragma integrity_check').fetchone());c.close()"

# 3) 读回确认
python -c "import sqlite3;c=sqlite3.connect(r'C:\Users\10585\.copilot\data.db');print(c.execute('select instructions from settings').fetchone()[0][:60]);c.close()"
```

> 也可以在应用内「设置 → 用户指令」里手填，效果一样。写入时应用最好先退出，避免它用内存里的旧值回写。

---

## 5. 常见问题

| 现象 | 处理 |
| --- | --- |
| 点官方图标启动，还是英文 | **正常**。中文只在通过启动器启动时注入。请用桌面快捷方式「GitHub Copilot 中文版」 |
| 日志里 `ECONNREFUSED 9222` | 注入器先于页面就绪，或主程序没带调试参数启动。重开启动器即可（注入器会重试） |
| 日志完全没有输出 | 检查 `cache\` 目录是否可写、Node 是否可用 |
| 双击 `.vbs` 后什么也没发生，界面还是英文 | 多半是**没装 Node**，启动器静默退出。手动双击 `.cmd` 运行即可看到真实报错；装好 Node LTS 后重试 |
| 提示启动器找不到主程序 / 启动的是别的东西 | ① 目录不在 `github.exe` 同级；② 目录里混入了多个 `.cmd`（`.vbs` 只认第一个）。清理成只剩自带的那个 `.cmd` |
| 部分文字没翻 | 在 `dictionary.json` 的 `texts` 里加整串词条；保存后 3 秒热生效。若是拼装句，加 `textPatterns` |
| 以管理员权限运行时不生效 | WebView2 会忽略用户级环境变量。需要机器级策略 `HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`（值 `--remote-debugging-port=9222 --lang=zh-CN`），端口仅本机 |
| 升级后界面结构变了 | 重开启动器；仍缺就补词典，或等上游更新 |
| 想彻底卸载 | 退出进程 → 删除 `GitHub Copilot 中文运行版` 目录。`github.exe` 从未被修改，删掉即回到纯英文官方版 |
