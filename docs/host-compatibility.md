# 天枢科研 (Tianshu-Research) 宿主兼容与接入指南

> 规范版本：v2.0 (Phase 2) · 涵盖天枢、Cursor 与 Claude Desktop

本文档说明在各主流 AI 编程宿主中配置天枢科研 MCP 服务的最佳实践，以实现完全的项目级隔离与零认知污染。

---

## 1. 天枢 (Tianshu) 终端与桌面端

### 1.1 项目级配置推荐 (`.rivet/config.json`)
在天枢项目中，通过项目级配置文件配置 MCP 服务，将工作区严格绑定到当前项目：

```json
{
  "mcp": {
    "servers": {
      "tianshu-research": {
        "command": "node",
        "args": [
          "D:/1_Research/Tianshu-Research/mcp-server.js",
          "--workspace", "D:/1_Research/Develop_Research",
          "--exposure", "connection"
        ],
        "cwd": "D:/1_Research/Develop_Research"
      }
    }
  }
}
```

### 1.2 原生插件模式
若作为天枢原生插件加载，默认通过 `plugins/tianshu-research/index.js` 注册 4 大网关。此时工具的执行同样受 `scope/invocation-guard.js` 的调用前边界校验保护。

---

## 2. Cursor (IDE)

### 2.1 推荐方案：项目级 `.cursor/mcp.json`
在科研工程根目录创建 `.cursor/mcp.json`。使用 Cursor 内置的 `${workspaceFolder}` 宏自动绑定当前工作区：

```json
{
  "mcpServers": {
    "tianshu-research": {
      "command": "node",
      "args": [
        "D:/1_Research/Tianshu-Research/mcp-server.js",
        "--workspace", "${workspaceFolder}",
        "--exposure", "connection"
      ]
    }
  }
}
```

**优势**：
- 仅在该项目窗口中启动科研 MCP 服务；
- 其他未配置 `.cursor/mcp.json` 的普通 Web/后端项目完全不加载该服务；
- 避免全局工具命名空间与大模型前缀缓存污染。

### 2.2 全局配置配合连接级休眠
若必须在全局 Cursor 设置中注册该服务，请不要在 `args` 中硬编码特定项目路径：

```json
{
  "mcpServers": {
    "tianshu-research": {
      "command": "node",
      "args": [
        "D:/1_Research/Tianshu-Research/mcp-server.js",
        "--exposure", "connection"
      ]
    }
  }
}
```

**行为保证**：
- Cursor 连接后会通过 MCP Roots 协议向服务器通告当前打开的工作区；
- 若打开的是普通工程（无 `.rivet/research.json` 且无科研数据目录），服务器自动进入 **Dormant（休眠）** 状态，`tools/list` 返回空数组；
- 仅当打开声明了科研配置的项目时，服务自动激活并暴露 4 大网关。

---

## 3. Claude Desktop

Claude Desktop 目前主要使用全局配置文件 `claude_desktop_config.json`。

### 3.1 专用科研配置
在 `%APPDATA%\Claude\claude_desktop_config.json` (Windows) 或 `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 中配置：

```json
{
  "mcpServers": {
    "tianshu-research": {
      "command": "node",
      "args": [
        "D:/1_Research/Tianshu-Research/mcp-server.js",
        "--workspace", "D:/1_Research/MyPaperProject",
        "--exposure", "connection"
      ]
    }
  }
}
```

**注意**：由于 Claude Desktop 的全局服务在全部对话中共享，绑定特定 `--workspace` 可以确保所有写入操作安全封闭在该目录内；在无根目录下启动时，服务将安全处于休眠状态。

---

## 4. 诊断与环境核验

开发者可在终端通过 CLI 工具直接核验当前工作区的科研资格与配置：

```bash
# 1. 快速初始化科研配置
npx tianshu-research init

# 2. 检查工作区资格与 Scope 状态
npx tianshu-research status

# 3. 校验配置文件合法性与 Python 环境
npx tianshu-research check-config
```

