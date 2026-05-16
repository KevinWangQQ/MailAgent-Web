# Contributing to MailAgent-Web

> 多 agent 协作维护手册。Kevin（owner） + Jarvis（@ChenyqThu） + rr（@rainachan） + 小K（@KevinWangQQ via Kevin's MBA）。

## 工作流（必读）

1. **从 main 拉新分支**——禁止直推 main（branch protection 已启用）
2. **分支命名**：`agent/<name>/<short-feature>`，例如：
   - `agent/jarvis/refactor-classifier`
   - `agent/rr/ui-card-layout`
   - `agent/xiaok/add-cron-digest`
3. **commit message**：祈使句一句话，prefix 可选 `feat/fix/docs/refactor/chore/test`
4. **PR 提交**：标题清晰 + body 写动机/改动/验证方式；@ 一个人 review
5. **Review**：至少 1 approve 才能 merge（owner 也守这条；admin 紧急情况可 override 但需 PR 留痕）
6. **Merge 策略**：默认 squash merge 保持 main 线性历史

## 本地并行开发：git worktree（推荐）

多 agent 同时在同一份 repo 上起不同分支时，强烈推荐 `git worktree` 而不是多份 `git clone`：同一份 `.git`、多个工作目录、分支独立。

### 创建一个 worktree

```bash
# 在主目录（跟main）里
GIT_BRANCH=agent/xiaok/feat-z       # 遵从上面的分支命名规范
WT_DIR=../MailAgent-Web-xiaok-feat-z
git worktree add "$WT_DIR" -b "$GIT_BRANCH"

# 进去初始化
cd "$WT_DIR"
cp ../MailAgent-Web/.env .                  # .env 不跟踪，手动 copy
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..
```

### 端口公约（避免互撞）

| worktree | API 端口 | Vite 端口 |
|------|------|------|
| 主目录 (main) | 8200 | 5173 |
| jarvis-* | 8201 | 5174 |
| rr-* | 8202 | 5175 |
| xiaok-* | 8203 | 5176 |
| 临时 | 8210+ | 5180+ |

起服务时显式指端口：

```bash
uvicorn api.main:app --port 8203 --reload
cd frontend && npm run dev -- --port 5176
```

### 生命周期规矩

- **创建**：`git worktree add <dir> -b agent/<name>/<feat>`（同时建分支）
- **查看**：`git worktree list`
- **删除**：合并后 `git worktree remove <dir>`，然后 `git branch -d agent/<name>/<feat>` 删本地分支
- **禁止**：直接 `rm -rf <worktree>`——会留悬挂引用，需 `git worktree prune` 抢救
- **同一分支不能同时起两个 worktree**，会报 `already checked out`

### .env 与本地配置

- `.env` / `.vscode/` / `.idea/` / `.venv/` / `node_modules/` **不**同步，每个 worktree 独立维护
- 如果用 pnpm，可设 `node-linker=hoisted` + 共享 store 省磁盘
- secrets/token 严禁提交；pre-commit 已检查常见 key 模式

### 不熟 worktree？

允许回退 `git clone` 多份的传统模式——主项目两者都兼容。但同时跑多个 dev server 的场景下 worktree 体验明显更顺。

## 谁负责什么（暂定，可调整）

- **Kevin / 小K**：架构 / API 层 / 部署 / 心跳集成
- **Jarvis（陈源泉的 agent）**：分类器 / prompt 工程 / LLM 调度
- **rr（Yuhui 的 agent）**：前端 / UI / 看板交互

具体目录归属看 `CODEOWNERS`。

## Agent 沟通约定

- 跨 agent 协调走飞书蛋姐群（`oc_9ba7a535...`），**不**走 GitHub Issue 长聊
- GitHub Issue 用于：bug 追踪 / 功能提案 / 长文档讨论
- PR 评论 = 代码层讨论，不 cross-post 到飞书

## Agent 自检清单（push 前）

- [ ] 本地跑过 `pytest`（或对应测试入口）通过
- [ ] 没引入新的硬编码 secret / token / API key
- [ ] 没改到 `.env.example` 之外的环境配置文件
- [ ] commit author 是当前 agent 的 GitHub 账号（不是别人借号）

## 紧急 hotfix

1. 在 main 上 PR，标题加 `[HOTFIX]`
2. PR body 说明为什么需要绕过 review
3. owner（Kevin）可 admin override merge，但 24h 内必须有人补 review

## 联系

- repo owner: Kevin (@KevinWangQQ)
- 飞书群: 蛋姐群（联系 Kevin 拉入）

🐾 by 小K, 2026-05-14
