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
