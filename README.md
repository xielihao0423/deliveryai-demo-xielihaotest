# AgentHub — Agent 纳管与对话管理平台

Agent 纳管与对话管理平台，支持将 Codex AppServer 或 Trae CLI 纳管为 Agent，提供统一的对话交互、Skill 管理、Session 持久化和飞书双向集成。

## 功能

- **Agent 纳管**：页面化配置 Agent 连接信息，支持连接验证、状态监控（在线/离线/异常）
- **对话交互**：选择在线 Agent 发起流式对话，支持 Markdown 渲染和代码高亮
- **Skill 管理**：查看、配置、启用/禁用 Agent 的 Skill 列表
- **Session 持久化**：对话 Session 持久化存储，支持历史查看、续接、归档
- **飞书集成**：消息通知 + 双向 Bot 对话（飞书群组中 @Bot 与 Agent 交互）

## 技术栈

- 前端：React 18 + TypeScript + Vite 6 + Tailwind CSS + Radix UI + React Router
- 后端：Express 4.21 + TypeScript + tsx
- 存储：SQLite (better-sqlite3)
- 流式输出：SSE (Server-Sent Events)
- 测试：Playwright

## 本地开发

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..

# 启动前后端开发服务（需要两个终端）
npm run dev          # 前端 http://localhost:5173
npm run dev:server   # 后端 http://localhost:3001

# 或同时启动
npm run dev:all
```

前端开发服务已配置代理，将 `/api` 请求转发到后端 `http://localhost:3001`。

## 常用命令

```bash
# 前端开发
npm run dev

# 前端构建
npm run build

# 代码检查
npm run lint

# 后端开发
cd server && npm run dev

# 后端类型检查
cd server && npm run typecheck

# 后端构建
cd server && npm run build
```

## 项目结构

```
.
├── src/                    # 前端源码
│   ├── api/                # API 客户端
│   ├── components/         # 页面组件
│   │   ├── agents/         # Agent 列表与详情
│   │   ├── chat/           # 对话交互
│   │   ├── feishu/         # 飞书配置
│   │   ├── sessions/       # Session 管理
│   │   └── ui/             # 基础 UI 组件
│   ├── types/              # TypeScript 类型定义
│   ├── lib/                # 工具函数
│   ├── App.tsx             # 应用入口与路由
│   └── index.css           # 全局样式
├── server/                 # 后端源码
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── db/             # 数据库初始化
│   │   ├── adapters/       # Agent 适配器
│   │   ├── services/       # 业务服务（健康检查、飞书）
│   │   ├── types/          # 类型定义
│   │   └── index.ts        # 服务入口
│   └── package.json
├── index.html
├── vite.config.ts
└── tailwind.config.js
```

## API 设计

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/agents` | GET | 获取 Agent 列表 |
| `/api/agents` | POST | 注册 Agent（含连接验证） |
| `/api/agents/:id` | GET/PUT/DELETE | Agent 详情/编辑/删除 |
| `/api/agents/:id/skills` | GET | 获取 Skill 列表 |
| `/api/agents/:id/skills/:skillId` | PUT | 配置/启停 Skill |
| `/api/sessions` | GET/POST | Session 列表/创建 |
| `/api/sessions/:id` | GET | Session 详情（含消息） |
| `/api/sessions/:id/messages` | POST | 发送消息（SSE 流式） |
| `/api/sessions/:id/archive` | POST | 归档 Session |
| `/api/feishu/config` | GET/PUT | 飞书配置 |
| `/api/feishu/webhook` | POST | 飞书 Bot 回调 |
