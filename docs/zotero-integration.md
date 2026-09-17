# Tianshu-Research 与 Zotero 现代文献生态对接指南

> 本指南介绍如何使用 Tianshu-Research 导出的标准文献数据，无缝对接开源文献管理软件 **Zotero** 及社区 **Zotero MCP**，全面替代商业闭源的 EndNote。

---

## 1. 为什么选择 Zotero 替代 EndNote？

在构建现代 AI 辅助科研工作流时，开源生态具有决定性优势：

1. **开源开放与零数据锁定**：Zotero 核心开源、协议开放，原生支持标准 CSL-JSON (Citation Style Language) 与 RIS 格式；EndNote 为商业闭源，外部程序互操作成本高昂且存在版本壁垒。
2. **丰富的社区 MCP 生态**：社区已成熟开源多款基于标准 MCP 协议的 `zotero-mcp` 服务器，智能体可直接通过 MCP 协议检索文献库、读取本地条目与提取附件；而 EndNote 缺乏官方或高质量的开放 MCP 支持。
3. **与天枢轻量理念完美契合**：Tianshu-Research 坚持“零外部强制二进制依赖”，不强制用户安装任何专有管理软件。通过标准化格式导出，用户既可以在纯终端闭环管理，也可以按需对接图形化 Zotero。

---

## 2. 标准格式导出操作

Tianshu-Research 在 `research_evidence` 网关中提供了现代文献标准导出动作：

### 2.1 导出 CSL-JSON (Citation Style Language)

CSL-JSON 是现代文献排版与引用分析的标准 JSON 格式：

```json
{
  "action": "export_csl_json",
  "workspace": "D:/1_Research/MyPaper"
}
```

- **缺省落盘路径**：`<workspace>/.rivet/research/export/literature.csl.json`
- **可选自定义路径**：传入 `outputPath` 参数指定输出文件。
- **内容规范**：包含文章标准元数据（id、type、title、author 结构化数组、issued 年份、DOI、URL），并在 `note` 字段中挂载该文献在天枢证据账本中的证据记录数及关联文档 ID。

### 2.2 导出 RIS 标准格式 (Research Information Systems)

RIS 是各大学术数据库与文献管理软件通用的标准交换格式：

```json
{
  "action": "export_ris",
  "workspace": "D:/1_Research/MyPaper"
}
```

- **缺省落盘路径**：`<workspace>/.rivet/research/export/literature.ris`
- **内容规范**：标准 `TY  - JOUR`、`TI  - ...`、`AU  - ...`、`PY  - ...`、`DO  - ...`、`UR  - ...`、`N1  - ...`、`ER  - ` 标签流。

---

## 3. 导入 Zotero 桌面端

用户无需手动逐篇录入，仅需两步即可批量入库：

1. 打开 Zotero 客户端，点击菜单栏 **文件 (File) → 导入 (Import...)**。
2. 选择 **一个文件 (A file: BibTeX, RIS, Zotero RDF, etc.)**，点击继续。
3. 浏览并选中项目目录下的 `.rivet/research/export/literature.ris` 或 `literature.csl.json`。
4. Zotero 将自动创建对应的分类集合，并导入全部题名、作者、DOI 及 URL。

---

## 4. 对接社区开源 Zotero MCP（进阶智能体联动）

若希望天枢或子智能体直接在对话中读写 Zotero 本地库，可在项目级 `.rivet-config.json` 中挂载社区成熟的 `zotero-mcp`（如基于 Zotero Local API 或 Web API 的 MCP 服务）：

```json
{
  "mcpServers": {
    "tianshu-research": {
      "command": "node",
      "args": ["D:/1_Research/Develop_Research/plugins/tianshu-research/mcp-server.js"]
    },
    "zotero": {
      "command": "npx",
      "args": ["-y", "zotero-mcp@latest"],
      "env": {
        "ZOTERO_USER_ID": "1234567",
        "ZOTERO_API_KEY": "your_personal_api_key"
      }
    }
  }
}
```

- **分工边界**：
  - **Tianshu-Research**：负责学术检索（arXiv / OpenAlex）、精读证据切块提取、结构化事实核验与科学双门禁审查。
  - **Zotero MCP**：负责个人永久文献库同步、PDF 全文标注管理与统一引用键生成。

