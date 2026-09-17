# Tianshu-Research (天枢科研叠加层)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-JSON--RPC_2.0-green.svg)](https://modelcontextprotocol.io/)

天枢理工科研扩展包（**Tianshu-Research Overlay**）。Tianshu-Research 并非独立的科研智能体，亦非孤立的外部工具服务，而是依附于 Tianshu-Harness 的**原生科研能力扩展包**。Tianshu-Harness 始终是唯一的认知中枢、会话中枢和多智能体编排器。

提供开放获取文献检索（arXiv / OpenAlex）、单篇精读解析与顶刊绘图配色能力。

---

## 核心定位与原则

1. **按需启用（Opt-in Overlay）**：默认不预装、不常驻、不侵入核心智能体主循环。仅在用户明确需要检索文献或绘制学术图表时开启。
2. **前缀缓存保护（Prefix Cache Friendly）**：工具面严格收敛至 3 个原子工具，入参和输出均设有严格 Token 与字节边界，不向会话倒入冗余数据，避免打碎底层大模型的前缀缓存。
3. **零外部运行时依赖**：Node.js 端采用纯标准库实现，无任何第三方 npm 依赖；配色计算纯在 Node 内存中插值，不启动 Python 子进程。
4. **开放获取优先**：专注于合法合规的开放获取（Open Access）资源，直链 OA PDF 与官方元数据，不侵入付费数据库，不做破解。

---

## 提供工具与能力

### 1. 学术文献检索与初筛 (`paper_search`)
- **双数据源并发**：同时检索 **arXiv**（原子级 Atom XML 解析）与 **OpenAlex**（强制 `filter=is_oa:true`），利用并发请求聚合结果。
- **智能标识识别**：自动识别并解析 arXiv 论文链接（abs/pdf）、arXiv ID（如 `1706.03762`）或 DOI（如 `10.1038/s41586-020-2649-2`），直接进入单篇查询。
- **鲁棒性防护**：自动清洗括号配对、解码 XML 数字实体、截断 OpenAlex 倒排索引防止溢出，保障输入输出安全。

### 2. 单篇文献精读解析 (`paper_lookup`)
- 按 arXiv ID 或 DOI 查询单篇文献的结构化元数据（标题、作者、发表日期、期刊/会议、OA 状态）。
- 优先提取官方直链 PDF（如 `best_oa_location.pdf_url`），解析完整摘要。

### 3. 顶刊配色与插值色板 (`journal_palette`)
- 重建来自顶刊经典配色的 100 套色板数据（Nature、Science、Cell、IEEE、ColorBrewer、Okabe-Ito 色盲友好色板）。
- 支持按角色查询（`heatmap`、`scatter`、`category`、`colorblind`）。
- 支持离散取色与连续渐变（线性 RGB 插值）。

### 4. 绘图伴生模块 (`journal_palette.py`)
- 纯 Python 独立模块，提供与 MATLAB JournalPalettes 兼容的绘图 API。
- 内置 `apply_journal_style()` 一键设置期刊规范样式（Arial 字体、隐藏冗余脊线、矢量化渲染）。

---

## 快速上手

### 方式一：在天枢（Rivet / Tianshu-Harness）中使用

#### 通过桌面端启用
打开桌面端 **设置 → MCP 服务**，在服务列表中找到 **「科研文献」**，点击一键启用即可。

#### 通过终端 TUI 启用
在天枢命令行界面输入：
```bash
/mcp enable tianshu-research
```
完成研究任务后，执行 `/mcp disable tianshu-research` 即可恢复原始工具集。

---

### 方式二：作为独立 MCP 服务使用（Cursor / Claude Desktop / Codex）

本仓库实现了标准的 MCP JSON-RPC 2.0 协议（stdio 传输）。

在宿主客户端的 MCP 配置文件（如 `claude_desktop_config.json`）中添加：

```json
{
  "mcpServers": {
    "tianshu-research": {
      "command": "node",
      "args": ["/path/to/Tianshu-Research/mcp-server.js"]
    }
  }
}
```

---

### 方式三：Python 绘图脚本直接调用

将 `figure/journal_palette.py` 与 `figure/journal_palette.json` 复制到绘图项目目录下：

```python
import matplotlib.pyplot as plt
import numpy as np
from journal_palette import journal_palette, apply_journal_style

# 应用顶刊排版规范
apply_journal_style()

# 获取色盲安全色板
colors = journal_palette('colorblind')

fig, ax = plt.subplots(figsize=(6, 4))
x = np.linspace(0, 10, 100)
for i in range(len(colors)):
    ax.plot(x, np.sin(x + i * 0.5), color=colors[i], label=f'Series {i+1}')

ax.set_title("Journal Figure Demonstration")
ax.legend(loc='upper right', frameon=False)
plt.show()
```

---

## 验证与测试

本仓库包含针对协议握手、数据解析与配色计算的完整自动化测试：

```bash
# 运行 Node.js 单元测试（MCP 协议与检索解析，24 项断言）
npm test

# 运行 Python 单元测试（配色与样式，5 项断言）
npm run test:python
```

---

## 目录结构

```text
Tianshu-Research/
├── figure/
│   ├── journal_palette.json     # 100 套顶刊色板原始数据
│   └── journal_palette.py       # Python 绘图伴生库
├── skills/
│   └── research-flow/
│       └── SKILL.md          # 智能体文献检索与初筛工作流
├── test/
│   ├── arxiv-sample.xml      # 测试用的 Atom 离线样卷
│   ├── mcp-server.test.js    # MCP JSON-RPC 2.0 协议测试
│   ├── search.test.js        # arXiv / OpenAlex 解析器单测
│   └── test_journal_palette.py  # Python 色板断言
├── figure.js                 # Node 端色板插值与角色查询
├── index.js                  # Tianshu 插件系统入口
├── mcp-server.js             # 标准 stdio MCP 服务实现
├── package.json              # 模块元数据与运行脚本
├── search.js                 # 文献搜索、清洗与并发请求
├── tool-contracts.js         # 共享工具契约与 Schema 校验
├── THIRD_PARTY_NOTICES.md   # 第三方数据源与色板授权说明
├── LICENSE                   # Apache-2.0
└── README.md
```

---

## 许可证与致谢

- 本项目代码遵循 [Apache-2.0](LICENSE) 许可证。
- 色板数据整理自 ColorBrewer 2.0 (Apache 2.0)、Okabe-Ito (CC0) 及公开科研绘图规范，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 学术数据接口来自 [arXiv API](https://arxiv.org/help/api) 与 [OpenAlex API](https://openalex.org/)。
