---
title: Tianshu-Research 计划方案（点一下安装）
type: research
status: active-overlay
date: 2026-09-16
tags: [tianshu-research, plan, mcp-presets, plugin-presets]
---

# Tianshu-Research 计划方案

> 新手不该跑脚本。科研能力挂到天枢**已经有的市场卡片**上：点启用/安装，然后直接用。不改 AgentLoop，不把 20 个学术 API 写进内核。
> 注意事项：MCP 预设启用写入用户全局配置，停用时在下次请求边界刷新；桌面端呈现新预设卡片需运行本 fork 的 sidecar 二进制。

## 判断

安装脚本、手动拷 `~/.agents/skills`、每个课题仓放 `.rivet.md`，对新手都太重。

天枢桌面端已经有点装通道（sidecar 目录，桌面按返回的列表画卡片）：

| 通道 | 现成点击 | 科研缺什么 |
|------|----------|------------|
| MCP | Settings 预设市场。`GET /mcp/presets` → 点启用 → `POST /mcp/servers`。`tianshu-mcp` 就是「默认关闭，点了才拉进程」 | 目录里没有学术检索 |
| 插件 | 同款市场。office-pdf 一点就装，**还能捆绑 Skill** | 没有科研插件 |
| Skill | 只能开关已经加载的，或从本机 `.claude/skills` 导入 | **没有远程预设市场** |

所以不是再发明发行器，而是 **往现成市场加条目**；Skill 远程点装是缺的接口，可后做。

本公开仓没有 `desktop/`（闭源）。预设数组在 sidecar，桌面是按 API 渲染的——加一条 MCP/插件预设，现有设置页应多一张卡，不必先改桌面。VS Code 插件这边几乎没有 MCP 市场 UI，点装目前以桌面端为准。

## 新手路径（目标）

设置 → MCP（或插件）→「学术文献」→ 启用 → 新开对话说「找几篇 … 的论文」。

不要：uv、git clone skill、Zotero、Obsidian、课题脚手架。那些全是可选项。

## 往 Harness 加什么（接口，不是科研内核）

### 1. 第一刀：MCP 预设（最小，复用现成按钮）

在 `src/mcp/presets.ts` 加一条，形态对齐 `tianshu-mcp`：

- `id: paper-search`，`category: knowledge`，**默认不写入 config**
- `command: npx`，`args: ['-y', '@smithery/cli', 'run', '@openags/paper-search-mcp']`（无本机 Python；若 Smithery 开始要账号，卡片 help 写明，或改 `uvx paper-search-mcp`）
- `author` / `repoUrl` 指向 [openags/paper-search-mcp](https://github.com/openags/paper-search-mcp)
- 文案写清：点启用后工具变多，**本会话前缀会重建一次**；不是系统综述工具

可选第二条 `zotero`：`command: zotero-mcp` 或 `uvx`，env `ZOTERO_LOCAL=true`。help：**先打开 Zotero，并勾选允许本机应用通信**。做不到「纯点击、零本机软件」。短用不必装这一条。

测试：沿用 `src/server/__tests__/mcp-presets.test.ts` 的「列出预设不写配置、只有 POST 才进 configuredIds」。

### 2. 更好的一键：插件预设（对标 office-pdf）

MCP 卡片能搜，但没有「怎么搜、等人选、别用 web_search」的引导。office-pdf 已经证明：**插件 = 工具 + 捆绑 Skill，市场一点即装。**

`plugins/tianshu-research` + `PLUGIN_PRESETS` 一条：

- 捆绑 `research-flow` Skill（短用默认：出候选表；用户没说入库就不写 Zotero/笔记）
- 工具尽量少（插件 ABI 至少要 1 个 tool）：不要复制 20 个源。要么薄封装 arXiv/OpenAlex HTTP，要么标明「请同时启用 paper-search MCP」
- `permissions: { net: true }`
- 默认不装，点「安装」才进 `~/.rivet/plugins/`

这是给天枢用户的主路径。不向内核加 `arxiv` 常驻工具。

### 3. 后置：Skill 预设市场（他们要的通用接口）

现在 Skill 不能像 MCP 那样点装远程包。若要「任意科研/写作 Skill 一点就来」，再补：

- `src/skills/skill-presets.ts`（静态目录，科研只是其中一行）
- `GET /skills/presets`、`POST /skills/presets/:id/install` → 写入 `~/.rivet/skills/`
- 桌面/VS Code 才需要新卡片（sidecar 可先合）

没有这一层之前，引导 Skill 靠插件捆绑（第 2 步），不要让新手拷文件。

## 明确不做

- 安装脚本当主发行（可留在独立仓给 Cursor/Codex）
- 改 AgentLoop、默认打开 MCP、把学术检索塞进 CORE_TOOLS
- 短用强制 Zotero/Obsidian
- 为凑 ABI 造一个假 tool 却不检索
- 夸大：点装之后也不会自动写论文；付费 PDF / 公式精读仍然弱

## 效果与代价（诚实）

- 点装 MCP：新手能搜 OA 文献。工具一多，前缀缓存会碎一次，之后每轮 MCP schema 都占上下文（Zotero 默认约 38 个工具、约 1.3 万 token——所以 Zotero **不要**默认点开）。
- 点装插件：有引导 Skill，短用更稳。
- Zotero/Obsidian：永远有本机软件门槛，卡片只能写说明，不能替用户点。

## 实施顺序

1. ~~Harness：`paper-search` MCP 预设 + 测试。~~ 已加，默认关。
2. ~~Harness：`plugins/tianshu-research`（Skill + 最少工具）+ 插件预设。~~ 已加。
3. ~~桌面点装入口是 **MCP 服务**：`tianshu-research` 第一方卡片。~~ 已加。TUI `/mcp market` / `/mcp enable tianshu-research`。插件市场条目仍在，但**不要当默认路径**：`~/.rivet/plugins` 是用户全局的，会进每个编码会话。
4. 需要时再做 Skill 远程市场（通用接口），科研只当目录条目。

隔离约束（硬）：科研不得进入 `createDefaultToolRegistry`、不得写入 `DEFAULT_CONFIG.mcp.servers`、不得进 `runtime-assets/bundled-skills`、不得进 `PLUGIN_TOOL_SUPPRESS_MAP`。门禁：`src/mcp/__tests__/research-isolation.test.ts`。

独立仓的 `install.ps1` 降为给非天枢 Agent 的旁路，不再当主故事。

## gpt_academic 对照（只借鉴交互，不搬仓库）

[binary-husky/gpt_academic](https://github.com/binary-husky/gpt_academic)（约 7 万星，**GPL-3.0**）是独立 Gradio 科研 GUI：快捷按钮、Arxiv 粘贴即译摘要、PDF/LaTeX 全文翻译、谷歌学术 related work、润色校对。

不能并进 Apache-2.0 的天枢：许可证不允许拷 `crazy_functions`；也不该再做一个 GUI 套件。

已吸收、且保持轻量：

- 粘贴 `arxiv.org/abs|pdf` 或 DOI → 当单篇 lookup，不当关键词搜
- 先摘要卡片，中文解读限「问题/方法/结果/局限」四行并声明未读全文
- 润色只改用户贴的段落，对照改动

明确不搬：PDF 全文翻译、谷歌学术 related work、LaTeX Grammarly、语音、虚空终端调度。那些效果一般，且会把插件做成第二个 gpt_academic。

## nature-skills 对照（Apache-2.0，不整包入库）

[Yuan1z0825/nature-skills](https://github.com/Yuan1z0825/nature-skills) 是一套 Nature 风格写作/读卡/绘图 Skill（paper-card、polishing、writing、figure、academic-search 等），许可证可复用。不整包塞进天枢：技能数建议上限 5，且大量依赖 Python 脚本与 `nature-shared`。

已吸收进 `research-flow` 的纪律（不拷 SKILL.md）：

- 材料不够就标「现有材料无法判断」，不编页码/图号
- 润色先声明语言和段落角色；默认 generic，不冒充 Nature 官方规范
- 短用不输出 16 节精读卡 / 组会 PPT / 审稿模拟

完整包留给用户按需：`npx skills add Yuan1z0825/nature-skills`。

## TheBestColor 配色（MATLAB → Python，opt-in）

根目录 MATLAB 包 `Matlab顶刊配色包TheBestColor.rar`（阿昆的科研日常）核是编译后的 `.p`，不进仓库运行时。cheatsheet 上 100 套离散色已重建为 `plugins/tianshu-research/figure/thebestcolor.json`，API 对齐 `TheBestColor('akun', id)` / `'map', 256`。

- MCP 工具 `journal_palette`（默认关，随「科研文献」点装）。空参数只返回 role/alias，不把 100 套色倒进上下文。
- Python：`figure/thebestcolor.py`（`thebestcolor(16)`、`apply_journal_style()` 对齐 nature-figure 的 Arial + `svg.fonttype=none`）。
- 色盲安全用 Okabe–Ito（`role=colorblind`），不是该 MATLAB 包里的彩虹。
- **不**进入 `createDefaultToolRegistry` / TUI `theme-palettes.ts` / bundled-skills。不整包拷 nature-figure。


