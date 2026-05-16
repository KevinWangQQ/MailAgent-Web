# MailAgent Web

[MailAgent](https://github.com/KevinWangQQ/MailAgent) 的独立 Web 工作台——邮件看板、AI 对话代理、线程视图。

通过只读 SQLite 连接复用 MailAgent 的 `sync_store.db`，不干扰主同步进程。

## 功能

| 功能 | 说明 |
|------|------|
| **Dashboard** | 统计卡片、优先级环图、行动类型分布、趋势图、系统状态、活跃发件人 |
| **Inbox 工作台** | 待处理 / 值得浏览 / 可忽略 / 全部 四视图，筛选/搜索/批量操作 |
| **线程视图** | 同 thread 邮件自动分组，展开/折叠，子邮件懒加载 |
| **AI Agent** | 多轮对话，6 个本地工具（搜索邮件、读正文、线程上下文、发件人统计等），SSE 流式输出 |
| **快捷键** | `j/k` 上下、`e` 已阅、`Enter` 完成、`?` 帮助 |

## 快速开始

```bash
# 1. 后端
cp .env.example .env
# 编辑 .env，至少设置 SYNC_STORE_DB_PATH

pip install -r requirements.txt
uvicorn api.main:app --port 8200

# 2. 前端（开发）
cd frontend
npm install
npm run dev

# 3. 前端（生产）
cd frontend && npm run build
# 构建产物在 frontend/dist/，由 FastAPI 自动 serve
```

## 多 agent 并行开发（git worktree）

本项目由多个 agent（Kevin / 小K / Jarvis / rr）并行迭代，**推荐用 `git worktree` 隔离工作目录**——同一份 `.git`，多个分支各占一个目录互不踩。

### 一次性目录布局

```text
~/code/
├── MailAgent-Web/                  # 主目录（main，留给 review/merge）
├── MailAgent-Web-jarvis-feat-x/    # Jarvis 的 feature 分支
├── MailAgent-Web-rr-ui-y/          # rr 的 UI 分支
└── MailAgent-Web-xiaok-feat-z/     # 小K 的 feature 分支
```

### 常用命令

```bash
# 在主目录里开新 worktree（自动建分支）
git worktree add ../MailAgent-Web-xiaok-feat-z -b agent/xiaok/feat-z

# 已有远端分支
git worktree add ../MailAgent-Web-fix-b origin/fix-b

git worktree list                    # 看所有 worktree
git worktree remove ../MailAgent-Web-xiaok-feat-z   # 用完清理
git worktree prune                   # 清理失效引用
```

### 每个新 worktree 必做

1. **拷 `.env`**（worktree 不自动同步未跟踪文件）：
   ```bash
   cp ../MailAgent-Web/.env .
   ```
2. **后端依赖**（建议每个 worktree 独立 venv，避免互相污染）：
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. **前端依赖**：
   ```bash
   cd frontend && npm install   # 或用 pnpm + shared store 省盘
   ```
4. **端口避让**（两个 worktree 同时跑 dev server 会撞端口）：
   - 后端：`uvicorn api.main:app --port 8201`（主目录 8200，每个 worktree +1）
   - 前端：`npm run dev -- --port 5174`（默认 5173）

### 注意

- 同一分支同一时间只能在一个 worktree checkout，重复 `add` 会报错
- 删 worktree 用 `git worktree remove`，**别直接 `rm -rf`**（会留悬挂引用）
- `.vscode/` / `.idea/` 也不同步，按需 copy
- 不熟 worktree 的 agent 推回普通 `git clone` 也行，主项目兼容两种模式

详细 agent 协作规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 配置

编辑 `.env`（参考 `.env.example`）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `SYNC_STORE_DB_PATH` | 是 | MailAgent `sync_store.db` 绝对路径 |
| `WEB_API_PORT` | 否 | API 端口，默认 8200 |
| `WEB_API_TOKEN` | 否 | API 认证 token，空值 = 开发模式免认证 |
| `REDIS_URL` / `REDIS_DB` | 否 | 写操作队列（mark_done / toggle_flag 等） |
| `NOTION_TOKEN` / `EMAIL_DATABASE_ID` | 否 | 邮件正文读取 + Notion 链接 |
| `LLM_API_KEY` | 否 | AI Agent 所需，Anthropic Messages API 兼容网关 |
| `LLM_API_BASE` | 否 | 默认 `https://api.anthropic.com` |
| `LLM_MODEL` | 否 | 默认 `claude-sonnet-4-20250514` |

## 架构

```
MailAgent (主进程)            MailAgent-Web (本项目)
┌──────────────┐             ┌─────────────────────────────────┐
│ Mail.app     │             │  FastAPI API (只读 SQLite)       │
│  AppleScript │             │  ├─ /emails    邮件列表/详情     │
│  SQLite DB ──┼─────────────┼→ ├─ /dashboard 统计看板          │
│  Notion API  │             │  ├─ /agent     AI 多轮对话 (SSE) │
│  LLM Agent   │  ← Redis ──┼──├─ /actions   操作队列          │
└──────────────┘             │  └─ /events    SSE 实时推送      │
                             ├─────────────────────────────────┤
                             │  React SPA                      │
                             │  ├─ Dashboard   统计面板         │
                             │  └─ Inbox       邮件工作台       │
                             │     ├─ 线程分组 + 展开/折叠      │
                             │     ├─ 邮件详情 + AI 字段        │
                             │     └─ Agent 对话面板            │
                             └─────────────────────────────────┘
```

## 项目结构

```
api/
├── agent/              # AI Agent 模块
│   ├── schemas.py      #   请求/响应模型
│   ├── session.py      #   会话管理（30min TTL）
│   ├── tools.py        #   6 个工具定义 + 本地执行器
│   └── loop.py         #   多轮 tool_use + SSE 流式输出
├── models/             # Pydantic 数据模型
├── routes/             # API 路由
│   ├── emails.py       #   邮件列表/详情/线程
│   ├── agent.py        #   AI Agent SSE 端点
│   ├── dashboard.py    #   统计看板
│   ├── actions.py      #   操作（已阅/旗标/完成）
│   └── events.py       #   SSE 实时推送
├── services/           # 业务逻辑
│   ├── db.py           #   SQLite 连接管理
│   ├── email_service.py#   邮件查询 + 线程计数
│   └── ...
├── config.py           # 配置（pydantic-settings）
└── main.py             # FastAPI 入口

frontend/
├── src/
│   ├── components/
│   │   ├── email-list/     # 邮件列表 + 线程分组
│   │   ├── email-detail/   # 详情面板 + Agent 对话
│   │   └── layout/         # 导航 + 帮助
│   ├── hooks/              # 数据 hooks（react-query）
│   ├── pages/              # Dashboard / Inbox
│   └── lib/                # 类型 + API + 常量
└── vite.config.ts
```

## AI Agent

基于 Anthropic Messages API 的多轮对话代理，支持工具调用：

| 工具 | 说明 |
|------|------|
| `search_emails` | 关键词搜索邮件（subject/sender/summary） |
| `read_email_body` | 读取邮件完整正文（via Notion API） |
| `get_thread_context` | 获取同线程所有邮件 |
| `get_sender_stats` | 发件人统计（邮件数/优先级分布/最近邮件） |
| `search_by_date` | 按日期范围搜索 |
| `get_email_ai_labels` | 读取 AI 分类标签 |

前端通过 SSE 接收流式响应，实时显示文本输出和工具调用卡片。

## License

MIT
