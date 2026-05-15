# CLAUDE.md

为 Claude Code 提供的项目指南。本仓只含 **Web 工作台**（FastAPI + React），数据源来自上游 [MailAgent](https://github.com/KevinWangQQ/MailAgent) 的 `sync_store.db`，**不动主同步管道**。

## 通用指南

- 被要求做具体修改时，直接动手，偏向行动。
- macOS 环境下 **没有 sudo**，不要尝试 sudo 命令。
- 修改前先读相关文件；改完后用 `git diff` 自检。
- 不在嵌套 session 里做 CLI / 全局变更。

## 项目定位

| 角色 | 仓库 | 职责 |
|------|------|------|
| 主同步管道 | [MailAgent](https://github.com/KevinWangQQ/MailAgent) | Mail.app → AppleScript → Notion 同步 / LLM 分类 / Redis 事件 |
| **本仓 MailAgent-Web** | 当前 | 只读 SQLite + 看板 + AI Agent 对话 + 操作队列（write 走 Redis 推回主进程） |

**关键边界：**
- `sync_store.db` **只读连接**（`get_db()` 走 `mode=ro`），写操作走 `get_db_rw()` 仅限 `email_metadata.processing_status / is_flagged / is_read / web_action_at` 几个字段
- 真正影响 Mail.app 的写动作（mark_done / toggle_flag）通过 Redis 推 event 给主进程的 handler 执行
- LLM 邮件**分类**逻辑（priority / action_type / confidence 等）属主仓 `src/llm_agent/`，本仓只**读取** `llm_processing.labels_json`

## 命令速查

```bash
# 后端
cp .env.example .env  # 至少设 SYNC_STORE_DB_PATH
pip install -r requirements.txt
uvicorn api.main:app --port 8200

# 前端（开发）
cd frontend && npm install && npm run dev

# 前端（生产，FastAPI 自动 serve dist/）
cd frontend && npm run build

# PM2（生产）
pm2 start "uvicorn api.main:app --host 0.0.0.0 --port 8200" --name mail-web --interpreter ./venv/bin/python3

# 日志
pm2 logs mail-web --lines 30 --nostream
```

## 架构

```
┌─ MailAgent (上游)            ┌─ MailAgent-Web (本仓)
│  Mail.app + AppleScript      │  api/main.py (FastAPI)
│  Notion API                  │  ├─ routes/emails    列表/详情/线程
│  LLM Agent (分类)            │  ├─ routes/dashboard 统计看板
│  Redis consumer ◄────────────┼──┤  ├─ routes/agent     SSE 多轮对话
│  sync_store.db ──(只读)──────┼─→│  ├─ routes/actions   操作 → Redis push
└──────────────────────────────┘  │  └─ routes/events    SSE 实时推送
                                  └─ frontend/ (React SPA)
                                     ├─ Dashboard
                                     └─ Inbox (3 列: 列表/详情/AI)
```

**实时流：**
- 主进程同步邮件 → 写 SQLite → 经文件变化或定时轮询 → SSE `/api/events` 广播 → 前端 `useSSE` 失效 react-query 缓存 → 自动重拉
- 用户在 web 上点「完成」→ `actions.py` 写 SQLite + Redis push_event → 主进程 handler 操作 Mail.app + Notion

## 模块说明

### Backend (`api/`)

| 模块 | 职责 |
|------|------|
| `main.py` | FastAPI 入口；mount 路由、静态文件、CORS、健康检查 |
| `config.py` | pydantic-settings 配置（env 驱动） |
| `deps.py` | `verify_token` 中间件 |
| `services/db.py` | SQLite 只读 / 读写连接 |
| `services/email_queries.py` | **共享查询模板**（`EMAIL_BASE_SELECT` / `parse_labels` / `build_search_conditions`）—— 任何 `email_metadata JOIN llm_processing` 都从这里走 |
| `services/email_service.py` | 列表 / 详情 / 线程查询 |
| `services/dashboard_service.py` | 看板统计聚合 |
| `services/notion_service.py` | Notion 正文读取（block → HTML）。失败抛 `NotionBodyError`，**不**静默吞 |
| `services/redis_service.py` | Redis 连接 + `push_event` |
| `routes/emails.py` | `/emails` `/emails/{id}` `/emails/thread/{id}` `/emails/{id}/body` |
| `routes/actions.py` | `/emails/{id}/action` `/emails/batch-action` `/emails/view-action`。批量操作必须 `asyncio.gather` 并行 push |
| `routes/agent.py` | `/agent/chat` SSE 多轮对话 + session 历史/删除 |
| `routes/dashboard.py` | `/dashboard/stats` `/dashboard/attention` `/dashboard/digest` `/dashboard/system` `/dashboard/trend` |
| `routes/events.py` | `/events` SSE 推送 |
| `agent/loop.py` | 多轮 tool_use loop（Anthropic Messages API） |
| `agent/session.py` | session 状态（内存 + SQLite 兜底） |
| `agent/tools/` | **8 个工具模块**（每个一文件） |
| `agent/schemas.py` | Pydantic 请求/响应 |

#### `agent/tools/` 拆分

```
tools/
├── __init__.py        # 路由 + execute_tool + TOOL_SCHEMAS 导出
├── _common.py         # 共享 row_to_email helper
├── schemas.py         # 8 个 tool 的 JSON Schema
├── search.py          # search_emails + search_by_date
├── reader.py          # read_email_body + get_email_ai_labels
├── thread_ctx.py      # get_thread_context
├── sender.py          # get_sender_stats
├── view_summary.py    # get_view_summary
└── batch_action.py    # batch_action（调内部 actions API）
```

每个工具 50-120 行，不超过单一职责。新增工具时**仅**加一个新文件 + 在 `__init__.py` 注册 + 在 `schemas.py` 加 schema。

### Frontend (`frontend/src/`)

| 模块 | 职责 |
|------|------|
| `pages/InboxPage.tsx` | 3 列布局（列表 / 详情 / AI），`ResizeObserver` 监听容器宽度，拖把柄调整列宽 |
| `pages/DashboardPage.tsx` | 仅 ~60 行壳；widget 在 `components/dashboard/` |
| `components/dashboard/` | StatCards / AttentionList / PriorityRing / ActionTypeBar / TrendChart / SystemStatus / TopSenders + `constants.ts` |
| `components/email-list/EmailList.tsx` | 线程分组、展开/折叠、活动 id 滚动跟随 |
| `components/email-list/EmailRow.tsx` | 单封邮件 + 线程 badge 按钮 |
| `components/email-detail/DetailPanel.tsx` | 头部（可折叠）+ 横向拖把柄 + 正文区。线程模式用 `ThreadConversation`，单封用 `SingleBody` |
| `components/email-detail/AgentPanel.tsx` | AI 对话 SSE 流式 UI，工具调用卡片 |
| `hooks/useEmails.ts` | 列表分页查询。**SSE 失效驱动，60s 兜底刷新**（不要拉短 polling 间隔） |
| `hooks/useSSE.ts` | 单一 EventSource，收到 `email_updated/email_new` 失效相关 query keys |
| `hooks/useThreadEmails.ts` `useThreadBodies.ts` | 线程懒加载 |
| `lib/api.ts` | `apiFetch` 统一 fetch + token 注入 |
| `lib/types.ts` | EmailListItem / EmailDetail / ViewCounts |

## 代码规范

### 通用

- **DRY**：发现重复立刻抽。`email_metadata JOIN llm_processing` 在主仓重复了 6 次，本仓抽成 `email_queries.py`。新加 SQL 时先看那里。
- **文件 <500 行**：超了就拆。
- **不可变 / 函数式优先**：state 更新永远 `new Set(prev)` 而非 mutate。useEffect 里**不要**直接 mutate state。
- **不写默认注释**。仅在 WHY 不显而易见时写一行。
- **不为假想场景构建**。简单正确优于精巧投机。

### Python

- 类型注解所有公开函数
- 错误用专门异常（如 `NotionBodyError`）让调用方区分；**不要**`return ""`/`return None` 吞错
- 批量异步操作用 `asyncio.gather`，**不要**`for x in xs: await f(x)`
- `from __future__ import annotations` 放每个文件首

### TypeScript / React

- 严格类型，避免 `any`；用 `unknown` + narrow
- `useState(() => new Set())` lazy init，避免每 render 构造
- 不要 mutate 渲染期间的 state；状态初始化用 `useEffect`
- 长组件拆到 `components/<feature>/<Widget>.tsx`，每个 widget 文件 50-100 行
- `placeholderData: (prev) => prev` 保持 query 跨刷新不重挂载

### SQL

- 总是参数化（`?` 占位 + tuple/list）。**不要** f-string 拼用户输入
- `WHERE em.sync_status = 'synced'` 几乎所有读取都要带
- 多个查询合并到一个 connection block；不要 N 次开 `with get_db() as conn`

## 调试流程

按顺序排查：

1. **进程存活**：`pm2 status mail-web` 是否 online；`curl http://localhost:8200/api/health`
2. **配置**：`.env` 里 `SYNC_STORE_DB_PATH` 是否绝对路径、`WEB_API_TOKEN` 是否前后端一致
3. **SQLite 权限**：`sqlite3 $SYNC_STORE_DB_PATH "SELECT COUNT(*) FROM email_metadata"`。需要 Full Disk Access。
4. **日志**：`pm2 logs mail-web --lines 30 --nostream` 看具体错
5. **前端 bundle**：浏览器 `/index.html` 里的 `index-*.js` hash 是否是最新构建。Cmd+Shift+R 强刷
6. **SSE**：DevTools Network → EventStream，看 `/api/events` 是否在推
7. **Redis**：`redis-cli LRANGE mailagent:events:queue 0 -1` 看 push 是否堆积

**不要做：**
- `sudo` 任何东西
- 在没看日志前改代码
- 用 `--no-verify` 跳 hook

## 多人协作（必读）

- **禁止直推 main**，必须走 `agent/<name>/<feature>` 分支 + PR
- PR 模板见 `.github/PULL_REQUEST_TEMPLATE.md`，CODEOWNERS 见 `CODEOWNERS`
- 跨目录改动（`api/` + `frontend/`）需要两边 CODEOWNERS approve
- merge 由 owner（小K MBA）执行，本地 cc 不动 main
- 详见 `CONTRIBUTING.md`

## 已知限制 / 常见坑

- **CLAUDE.md 不在 LLM 分类管道里**——邮件优先级 / action_type 是主仓的 `src/llm_agent/` 决定的，本仓只读取 `labels_json`。要调分类规则去主仓。
- **SQLite 只读模式锁**：如果同时有主进程在写 + web 在读，偶尔会撞锁；用 `get_db()` 已设 `mode=ro` 不会引起冲突
- **Notion 正文延迟**：第一次拉时可能 2-5s，前端会显示「加载中」。已加 `react-query` 缓存
- **窄屏布局**：`InboxPage` 在 <1000px 自动收起 AI 边栏；detail 列 `flex-1` 不会被挤出屏幕
- **Token 注入**：`WEB_API_TOKEN=""`（空）表示开发模式免认证；上线必须填
- **SSE 重连**：`useSSE` 3s 后自动重连，不要在前端自己加 polling 兜底

## 重构亮点（近期）

- `agent/tools.py` 640 行 → 拆 8 文件（每个工具独立模块 + schemas）
- `DashboardPage.tsx` 534 行 → 拆 7 widget + 主页 62 行
- `actions.py` `mark_done` 批量 N+1 → `asyncio.gather`
- `notion_service.get_page_body` silent failure → `NotionBodyError`
- `useEmails` 15s polling → SSE 失效驱动 + 60s fallback
- `DetailPanel` 加横向拖把柄（双击恢复自适应）
- `InboxPage` 用 `ResizeObserver` 替代 `window.resize`（F12 docked 也能触发）

新加功能前看看现有同类实现，复用 hook / helper，**不要**新建第二套。
