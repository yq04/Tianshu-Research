# 文献驱动范式 (Literature-Driven Paradigm Specification)

> 本文档适用于学术调研、论文精读、DOI/arXiv 溯源与文献综述任务。

---

## 1. 核心定位与场景边界
- **适用场景**：学术文献检索、arXiv/OpenAlex 元数据解析、定向精读提取证据、文献综述与 Zotero 导出。
- **边界纪律**：严禁使用普通的 `web_search` 冒充学术数据库检索；严禁捏造虚假 DOI 或 arXiv ID；材料不足时明确注明「现有材料无法判断」，绝不脑补页码或实验数据。

## 2. 推荐最小操作序列
1. **学术检索**：`research_query(action="search_papers", query="...", source="arxiv|openalex|both")`。
2. **元数据与摘要解析**：`research_query(action="resolve_paper", id="arXiv_ID 或 DOI")`。
3. **静默全文导入 (防上下文爆满)**：
   `research_evidence(action="ingest_document", docId="unique_doc_id", text=..., sourcePath=...)`
4. **定向切片精读**：
   `research_evidence(action="read_section", docId="unique_doc_id", section="Introduction|Methods|Results", maxChars=2000)`
5. **存证与建构证据链 (中长用)**：
   - `research_evidence(action="add_source", id="src_1", title=..., documentId=...)`
   - `research_evidence(action="add_evidence", id="evi_1", sourceId="src_1", locator={section:"...", lineStart:10}, excerpt=...)`
   - `research_evidence(action="add_claim", id="clm_1", statement=..., evidenceIds=["evi_1"])`

## 3. 适用科学门禁 (Scientific Gates)
- **`literature-grounding`**：严格审计 DOI/arXiv 是否可真实解析、Locator 是否精确定位、原文摘录是否与文档真实匹配。
- **`provenance-integrity`**：核实引用的 artifact 存在性、sha256 校验和与生成链条。

## 4. 交付出口 (Deliverables)
- **短用**：纯对话四行读卡（问题 / 方法 / 结果 / 局限），0 文件写入。
- **中用**：`.rivet/research/notes/<slug>.md` 结构化 Markdown 读卡。
- **长用**：
  - CSL-JSON 格式：`research_evidence(action="export_csl_json")` → `.rivet/research/export/literature.csl.json`
  - RIS 格式：`research_evidence(action="export_ris")` → `.rivet/research/export/literature.ris`
