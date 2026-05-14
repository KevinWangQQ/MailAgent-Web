# MailAgent Web

[MailAgent](https://github.com/KevinWangQQ/MailAgent) 的 Web 工作台，提供邮件看板和 AI 分类浏览界面。

独立部署，通过只读 SQLite 连接复用 MailAgent 的 `sync_store.db` 数据。

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

## 架构

```
MailAgent (主进程)          MailAgent-Web (本项目)
┌──────────────┐           ┌──────────────┐
│ Mail.app     │           │ FastAPI API  │──→ Redis ──→ MailAgent EventHandlers
│ ↕ AppleScript│           │   (只读 DB)   │
│ ↕ SQLite DB ─┼───────────┼→ sync_store  │
│ ↕ Notion API │           │              │
│ ↕ LLM Agent │           ├──────────────┤
└──────────────┘           │ React SPA    │
                           │ (Dashboard)  │
                           └──────────────┘
```

- **只读**：Web 通过 `?mode=ro` 连接 SQLite，不干扰主进程
- **写操作**：`mark_done`/`toggle_flag` 等通过 Redis 队列投递给 MailAgent EventHandlers 执行
- **独立部署**：同机只需配 `SYNC_STORE_DB_PATH` 指向 MailAgent 的 db 文件

## 功能

- **Dashboard**：统计卡片、优先级环图、行动类型分布、趋势图、系统状态、活跃发件人
- **Inbox 工作台**：待处理 / 值得浏览 / 可忽略 / 全部 四视图
- **AI 侧边栏**：翻译、摘要、起草回复（需配 LLM_API_KEY）
- **快捷键**：`j/k` 上下、`e` 已阅、`Enter` 完成、`?` 帮助
