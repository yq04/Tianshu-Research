# 天枢科研 (Tianshu-Research) 项目隔离与防污染机制

> 规范版本：v2.1 (Phase 6A 固化版) · 适用于 MCP 服务与原生运行时

## 1. 背景与核心挑战

在现代 AI 辅助研发环境中，开发者常在全局配置（如 Cursor 全局 MCP、Claude Desktop 全局配置、天枢通用 Sidecar）中注册科研工具。
当在非科研项目（如普通 Web 前端、常规后端 API、系统脚本）中开展日常对话时，如果直接注入科研工具：
1. **大模型认知漂移与幻觉**：模型在处理普通业务代码时误调用文献检索、量纲分析等科研工具；
2. **前缀缓存（Prefix Cache）严重破坏**：随项目或工作流阶段频繁增删工具定义，会导致 LLM 前缀 KV Cache 频繁失效，显著增加首字延迟（TTFT）与 Token 开销；
3. **安全越界风险**：缺乏真实物理路径与深度参数作用域约束的工具调用可能跨越目录、借助软链接/Windows Junction 越界读取或覆写敏感工程文件。

为了解决上述问题，天枢科研在 Phase 6A 中确立了**物理路径防穿透**、**连接级冻结（Connection Freezing）**、**Roots 变更主动撤销（Revocation）**与**抗碰撞 Scope ID**等核心防御体系。

## 2. 核心隔离机制

### 2.1 连接级休眠与工具定义冻结（Dormant Mode & Freeze）
当 MCP 服务在未授权或非科研项目中被加载时：
- **空工具清单**：首次 tools/list 响应返回空数组 tools: []；
- **零提示词注入**：initialize 握手响应完全不包含任何科研 instructions，彻底杜绝大模型认知漂移与无谓 Token 消耗；
- **单次冻结纪律（Single Freeze）**：在 connection 模式下，工具暴露面在首份响应生成后即固化。即使客户端迟到的 roots/list 回复到达，也绝不将已声明为空的列表动态扩充为 4 工具，坚守 listChanged: false 承诺，全力捍卫大模型前缀缓存；
- **状态封锁**：在休眠状态下，任何试图调用科研工具的请求均被确定性拦截并返回 -32601（Tool not available in dormant mode）。

### 2.2 真实物理路径与 Junction 穿透防护（Realpath & Ancestor Resolution）
针对 Windows Junction 与 POSIX Symlink 构成的逃逸隐患：
- **物理路径解析**：由 scope/path-policy.js 统一实施 fs.realpathSync 原生解析，消解驱动器盘符大小写差异；
- **未创建输出文件的最近祖先探测**：对于尚未落盘的目标输出路径（如 outputPath, datasetPath），自底向上逐级探测最近的存在祖先目录并解析其真实物理链，彻底封堵指向外部的符号链接父目录逃逸；
- **深度嵌套参数扫描**：validateDeepParameters 递归穿透至任意深度的对象与数组字段（如 arguments.datasetPath, arguments.config.outputPath 等），对所有路径字段实施严格的工作区内含性断言；
- **安全标识符校验**：对 runId, evidenceId, docId 等关键键名实施防路径穿越校验，拦截任何包含 ..、/ 或 \\ 的字符注入。

### 2.3 抗碰撞规范 Scope ID 生成
- 废弃早期基于 Base64 截断前 16 字符的非安全方案（杜绝类似 D:/1_Research/research-a 与 research-b 碰撞的缺陷）；
- 采用规范物理全路径的 SHA-256 算法，生成 32 位十六进制摘要（形如 scope:12b8b24c21cd3f921c75f6eaaaf9bed1），为账本、存储及池化连接提供高强度隔离保障。

### 2.4 Roots 变更感知与权限撤销（Revocation）
- 服务端主动监听 notifications/roots/list_changed；
- 当客户端根目录列表移除或篡改科研授权根时，服务端状态无缝切入 revoked；
- 在 connection 模式下，工具列表外表维持不变以防缓存震荡，但所有后续执行一律被 invocation-guard 即时拦截并返回 -32600（Scope revoked）。