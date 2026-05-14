"""Agent 工具定义 + 本地执行器。

8 个工具：7 个只读查询 + 1 个写操作（batch_action）。
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from loguru import logger

from api.config import web_config
from api.services.db import get_db

# ---------------------------------------------------------------------------
# Tool schemas（Anthropic tool_use 格式）
# ---------------------------------------------------------------------------

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "search_emails",
        "description": (
            "搜索邮件。按关键词匹配主题、发件人、AI 摘要、分类。"
            "可限定在特定视图内搜索（pending/browse/all）。"
            "返回匹配邮件列表（internal_id, subject, sender, date, mailbox, ai_summary, priority, category）。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词（匹配主题、发件人、AI 摘要、分类）",
                },
                "view": {
                    "type": "string",
                    "description": "限定搜索范围到指定视图（可选）: pending, browse, all",
                    "enum": ["pending", "browse", "all"],
                },
                "limit": {
                    "type": "integer",
                    "description": "最大返回数量，默认 20",
                    "default": 20,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_email_body",
        "description": (
            "读取指定邮件的完整正文（纯文本）。"
            "需要先通过 search_emails 或上下文获取 internal_id。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "internal_id": {
                    "type": "integer",
                    "description": "邮件 internal_id",
                },
            },
            "required": ["internal_id"],
        },
    },
    {
        "name": "get_thread_context",
        "description": (
            "获取邮件线程上下文。返回同一线程内最近 8 封邮件的摘要、优先级、操作类型。"
            "用于理解邮件的对话背景。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "thread_id": {
                    "type": "string",
                    "description": "线程 ID（邮件的 thread_id 字段）",
                },
            },
            "required": ["thread_id"],
        },
    },
    {
        "name": "get_sender_stats",
        "description": (
            "获取发件人统计。返回最近 30 天的邮件数量、优先级分布、最近 5 封邮件主题。"
            "用于了解某个发件人的沟通模式。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sender_address": {
                    "type": "string",
                    "description": "发件人邮箱地址（支持模糊匹配）",
                },
            },
            "required": ["sender_address"],
        },
    },
    {
        "name": "search_by_date",
        "description": (
            "按日期范围搜索邮件。返回指定时间段内的邮件列表。"
            "日期格式: YYYY-MM-DD。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "description": "开始日期 (YYYY-MM-DD)",
                },
                "end_date": {
                    "type": "string",
                    "description": "结束日期 (YYYY-MM-DD)",
                },
                "mailbox": {
                    "type": "string",
                    "description": "邮箱名称过滤（可选，如 '收件箱'）",
                },
                "limit": {
                    "type": "integer",
                    "description": "最大返回数量，默认 20",
                    "default": 20,
                },
            },
            "required": ["start_date", "end_date"],
        },
    },
    {
        "name": "get_view_summary",
        "description": (
            "获取指定视图（pending/browse/all）的邮件统计摘要。"
            "返回总数、按类别/发件人/优先级的分布、以及完整邮件列表（最多 200 封，含 subject/sender/date/priority/category）。"
            "适合用户想快速了解某个视图全貌、或决定是否批量处理。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "view": {
                    "type": "string",
                    "description": "视图名称: pending, browse, all",
                    "enum": ["pending", "browse", "all"],
                },
            },
            "required": ["view"],
        },
    },
    {
        "name": "get_email_ai_labels",
        "description": (
            "获取邮件的 AI 分析结果。返回 AI 生成的分类、优先级、摘要、操作类型等标签。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "internal_id": {
                    "type": "integer",
                    "description": "邮件 internal_id",
                },
            },
            "required": ["internal_id"],
        },
    },
    {
        "name": "batch_action",
        "description": (
            "对多封邮件执行批量操作。支持的操作: mark_done（标记已完成）、mark_browsed（标记已阅）、toggle_flag（切换旗标）、toggle_read（切换已读）。"
            "可以传入 email_ids 列表直接操作，也可以传 view 对整个视图批量操作（view 模式下 mark_browsed 用于 browse 视图，mark_done 用于 pending 视图）。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "操作类型: mark_done, mark_browsed, toggle_flag, toggle_read",
                    "enum": ["mark_done", "mark_browsed", "toggle_flag", "toggle_read"],
                },
                "email_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "要操作的邮件 internal_id 列表（与 view 二选一）",
                },
                "view": {
                    "type": "string",
                    "description": "对整个视图批量操作（与 email_ids 二选一）: pending, browse",
                    "enum": ["pending", "browse"],
                },
            },
            "required": ["action"],
        },
    },
]


# ---------------------------------------------------------------------------
# 工具执行器
# ---------------------------------------------------------------------------

async def execute_tool(tool_name: str, tool_input: dict[str, Any]) -> str:
    """执行工具，返回 JSON 字符串结果。"""
    try:
        if tool_name == "search_emails":
            return _search_emails(tool_input)
        if tool_name == "read_email_body":
            return await _read_email_body(tool_input)
        if tool_name == "get_thread_context":
            return _get_thread_context(tool_input)
        if tool_name == "get_sender_stats":
            return _get_sender_stats(tool_input)
        if tool_name == "search_by_date":
            return _search_by_date(tool_input)
        if tool_name == "get_view_summary":
            return _get_view_summary(tool_input)
        if tool_name == "get_email_ai_labels":
            return _get_email_ai_labels(tool_input)
        if tool_name == "batch_action":
            return await _batch_action(tool_input)
        return json.dumps({"error": f"unknown tool: {tool_name}"})
    except Exception as e:
        logger.warning(f"[agent-tool] {tool_name} failed: {e!r}")
        return json.dumps({"error": str(e)})


# ---------------------------------------------------------------------------
# 各工具实现
# ---------------------------------------------------------------------------

def _search_emails(inp: dict[str, Any]) -> str:
    query = inp.get("query", "").strip()
    view = inp.get("view", "").strip()
    limit = min(inp.get("limit", 20), 50)
    if not query:
        return json.dumps({"emails": [], "note": "empty query"})

    # 有 view 参数时：通过 email_service 获取视图内邮件，再做关键词过滤
    if view and view != "all":
        from api.models.email import EmailFilter
        from api.services import email_service

        items, total = email_service.list_emails(
            EmailFilter(view=view), page=1, page_size=500,
        )
        q_lower = query.lower()
        matched = []
        for item in items:
            searchable = " ".join([
                item.subject or "",
                item.sender or "",
                item.sender_name or "",
                item.ai_summary or "",
                item.category or "",
                item.action_type or "",
            ]).lower()
            if q_lower in searchable:
                matched.append({
                    "internal_id": item.internal_id,
                    "subject": item.subject or "",
                    "sender": f"{item.sender_name or ''} <{item.sender or ''}>".strip(),
                    "date": item.date_received or "",
                    "mailbox": item.mailbox or "",
                    "priority": item.priority or "",
                    "category": item.category or "",
                    "action_type": item.action_type or "",
                    "ai_summary": item.ai_summary or "",
                })
                if len(matched) >= limit:
                    break
        return json.dumps(
            {"count": len(matched), "view": view, "emails": matched},
            ensure_ascii=False,
        )

    # 无 view：全局 SQL LIKE 搜索
    pattern = f"%{query}%"
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT em.internal_id, em.subject, em.sender, em.sender_name,
                   em.date_received, em.mailbox, em.thread_id,
                   lp.labels_json
            FROM email_metadata em
            LEFT JOIN llm_processing lp ON em.internal_id = lp.internal_id
            WHERE em.sync_status = 'synced'
            AND (
                em.subject LIKE ? OR em.sender LIKE ? OR em.sender_name LIKE ?
                OR json_extract(lp.labels_json, '$.ai_summary') LIKE ?
                OR json_extract(lp.labels_json, '$.category') LIKE ?
            )
            ORDER BY em.internal_id DESC
            LIMIT ?
            """,
            (pattern, pattern, pattern, pattern, pattern, limit),
        ).fetchall()

    return json.dumps(
        {"count": len(rows), "emails": [_row_to_email(r) for r in rows]},
        ensure_ascii=False,
    )


async def _read_email_body(inp: dict[str, Any]) -> str:
    internal_id = inp.get("internal_id")
    if not internal_id:
        return json.dumps({"error": "missing internal_id"})

    with get_db() as conn:
        row = conn.execute(
            "SELECT notion_page_id FROM email_metadata WHERE internal_id = ?",
            (internal_id,),
        ).fetchone()

    if not row or not row["notion_page_id"]:
        return json.dumps({"error": f"邮件 {internal_id} 未同步到 Notion"})

    from api.services.notion_service import get_page_body

    body = await get_page_body(row["notion_page_id"])
    if not body:
        return json.dumps({"error": f"无法获取邮件 {internal_id} 的正文"})

    # 截断避免 token 爆炸
    max_chars = 8000
    truncated = len(body) > max_chars
    return json.dumps(
        {
            "internal_id": internal_id,
            "body": body[:max_chars],
            "truncated": truncated,
            "total_chars": len(body),
        },
        ensure_ascii=False,
    )


def _get_thread_context(inp: dict[str, Any]) -> str:
    """复用 src/llm_agent/tools 的逻辑，但用 web db 连接。"""
    thread_id = inp.get("thread_id", "").strip()
    if not thread_id:
        return json.dumps({"emails": [], "note": "empty thread_id"})

    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT e.internal_id, e.subject, e.sender, e.sender_name,
                   e.date_received, e.mailbox, e.is_read, e.is_flagged,
                   l.labels_json
            FROM email_metadata e
            LEFT JOIN llm_processing l ON e.internal_id = l.internal_id
            WHERE e.thread_id = ?
              AND e.sync_status = 'synced'
            ORDER BY e.date_received DESC
            LIMIT 8
            """,
            (thread_id,),
        ).fetchall()

    emails = []
    for r in rows:
        entry = _row_to_email(r)
        entry["is_read"] = bool(r["is_read"])
        entry["is_flagged"] = bool(r["is_flagged"])
        emails.append(entry)

    return json.dumps(
        {"thread_id": thread_id, "count": len(emails), "emails": emails},
        ensure_ascii=False,
    )


def _get_sender_stats(inp: dict[str, Any]) -> str:
    """复用 src/llm_agent/tools 的逻辑，但用 web db 连接。"""
    sender = inp.get("sender_address", "").strip()
    if not sender:
        return json.dumps({"error": "empty sender_address"})

    import time

    cutoff = time.time() - 30 * 86400

    with get_db() as conn:
        pattern = f"%{sender}%"
        stats_row = conn.execute(
            """
            SELECT COUNT(*) as total,
                   MIN(date_received) as earliest,
                   MAX(date_received) as latest
            FROM email_metadata
            WHERE sender LIKE ? AND created_at >= ? AND sync_status = 'synced'
            """,
            (pattern, cutoff),
        ).fetchone()

        total = stats_row["total"] if stats_row else 0

        priority_rows = conn.execute(
            """
            SELECT json_extract(l.labels_json, '$.priority') as priority,
                   COUNT(*) as cnt
            FROM email_metadata e
            JOIN llm_processing l ON e.internal_id = l.internal_id
            WHERE e.sender LIKE ? AND e.created_at >= ?
              AND l.status = 'success' AND l.labels_json IS NOT NULL
            GROUP BY priority
            """,
            (pattern, cutoff),
        ).fetchall()
        priority_dist = {r["priority"]: r["cnt"] for r in priority_rows if r["priority"]}

        subject_rows = conn.execute(
            """
            SELECT subject, date_received, mailbox
            FROM email_metadata
            WHERE sender LIKE ? AND created_at >= ? AND sync_status = 'synced'
            ORDER BY date_received DESC LIMIT 5
            """,
            (pattern, cutoff),
        ).fetchall()
        recent = [
            {"subject": r["subject"] or "", "date": r["date_received"] or "",
             "mailbox": r["mailbox"] or ""}
            for r in subject_rows
        ]

    return json.dumps(
        {
            "sender": sender,
            "total_30d": total,
            "priority_distribution": priority_dist,
            "recent_subjects": recent,
        },
        ensure_ascii=False,
    )


def _search_by_date(inp: dict[str, Any]) -> str:
    start = inp.get("start_date", "").strip()
    end = inp.get("end_date", "").strip()
    mailbox = inp.get("mailbox", "").strip()
    limit = min(inp.get("limit", 20), 50)

    if not start or not end:
        return json.dumps({"error": "missing start_date or end_date"})

    with get_db() as conn:
        if mailbox:
            rows = conn.execute(
                """
                SELECT em.internal_id, em.subject, em.sender, em.sender_name,
                       em.date_received, em.mailbox, em.thread_id,
                       lp.labels_json
                FROM email_metadata em
                LEFT JOIN llm_processing lp ON em.internal_id = lp.internal_id
                WHERE em.sync_status = 'synced'
                  AND em.date_received >= ? AND em.date_received <= ?
                  AND em.mailbox = ?
                ORDER BY em.date_received DESC
                LIMIT ?
                """,
                (start, end + "T23:59:59", mailbox, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT em.internal_id, em.subject, em.sender, em.sender_name,
                       em.date_received, em.mailbox, em.thread_id,
                       lp.labels_json
                FROM email_metadata em
                LEFT JOIN llm_processing lp ON em.internal_id = lp.internal_id
                WHERE em.sync_status = 'synced'
                  AND em.date_received >= ? AND em.date_received <= ?
                ORDER BY em.date_received DESC
                LIMIT ?
                """,
                (start, end + "T23:59:59", limit),
            ).fetchall()

    return json.dumps(
        {"count": len(rows), "emails": [_row_to_email(r) for r in rows]},
        ensure_ascii=False,
    )


def _get_view_summary(inp: dict[str, Any]) -> str:
    from api.models.email import EmailFilter
    from api.services import email_service

    view = inp.get("view", "browse")
    items, total = email_service.list_emails(
        EmailFilter(view=view), page=1, page_size=200,
    )

    # 统计分布
    by_category: dict[str, int] = {}
    by_sender: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    email_list = []

    for item in items:
        cat = item.category or "未分类"
        by_category[cat] = by_category.get(cat, 0) + 1
        sender = item.sender_name or item.sender or "未知"
        by_sender[sender] = by_sender.get(sender, 0) + 1
        pri = item.priority or "未标注"
        by_priority[pri] = by_priority.get(pri, 0) + 1
        email_list.append({
            "internal_id": item.internal_id,
            "subject": item.subject or "",
            "sender": f"{item.sender_name or ''} <{item.sender or ''}>".strip(),
            "date": item.date_received or "",
            "priority": item.priority or "",
            "category": item.category or "",
            "action_type": item.action_type or "",
        })

    # sender 排序，只保留 top 15
    top_senders = sorted(by_sender.items(), key=lambda x: -x[1])[:15]

    return json.dumps(
        {
            "view": view,
            "total": total,
            "showing": len(items),
            "by_category": dict(sorted(by_category.items(), key=lambda x: -x[1])),
            "by_priority": dict(sorted(by_priority.items(), key=lambda x: -x[1])),
            "top_senders": dict(top_senders),
            "emails": email_list,
        },
        ensure_ascii=False,
    )


def _get_email_ai_labels(inp: dict[str, Any]) -> str:
    internal_id = inp.get("internal_id")
    if not internal_id:
        return json.dumps({"error": "missing internal_id"})

    with get_db() as conn:
        row = conn.execute(
            """
            SELECT l.labels_json, l.status, l.model,
                   e.subject, e.sender, e.date_received
            FROM llm_processing l
            JOIN email_metadata e ON l.internal_id = e.internal_id
            WHERE l.internal_id = ?
            """,
            (internal_id,),
        ).fetchone()

    if not row:
        return json.dumps({"error": f"邮件 {internal_id} 无 AI 标签"})

    labels = {}
    try:
        labels = json.loads(row["labels_json"] or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    return json.dumps(
        {
            "internal_id": internal_id,
            "subject": row["subject"] or "",
            "sender": row["sender"] or "",
            "date": row["date_received"] or "",
            "llm_status": row["status"] or "",
            "model": row["model"] or "",
            "labels": labels,
        },
        ensure_ascii=False,
    )


async def _batch_action(inp: dict[str, Any]) -> str:
    """调用内部 action 接口执行批量操作。"""
    import httpx

    action = inp.get("action", "")
    email_ids = inp.get("email_ids")
    view = inp.get("view")

    if not action:
        return json.dumps({"error": "missing action"})

    port = web_config.web_api_port
    base = f"http://127.0.0.1:{port}/api"
    token = web_config.web_api_token
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=30) as client:
        if view:
            resp = await client.post(
                f"{base}/emails/view-action",
                headers=headers,
                json={"action": action, "view": view},
            )
        elif email_ids:
            if len(email_ids) > 200:
                email_ids = email_ids[:200]
            resp = await client.post(
                f"{base}/emails/batch-action",
                headers=headers,
                json={"action": action, "email_ids": email_ids},
            )
        else:
            return json.dumps({"error": "需要提供 email_ids 或 view 参数"})

        if resp.status_code != 200:
            return json.dumps({"error": f"API {resp.status_code}: {resp.text[:200]}"})

        return resp.text


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _row_to_email(r: sqlite3.Row) -> dict[str, Any]:
    labels: dict[str, Any] = {}
    try:
        labels = json.loads(r["labels_json"] or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    # sqlite3.Row 不支持 .get()，用 keys() 判断列是否存在
    keys = r.keys()
    return {
        "internal_id": r["internal_id"],
        "subject": r["subject"] or "",
        "sender": f"{r['sender_name'] or ''} <{r['sender'] or ''}>".strip(),
        "date": r["date_received"] or "",
        "mailbox": r["mailbox"] or "",
        "thread_id": r["thread_id"] if "thread_id" in keys else "",
        "ai_summary": labels.get("ai_summary", ""),
        "priority": labels.get("priority", ""),
        "action_type": labels.get("action_type", ""),
        "category": labels.get("category", ""),
    }
