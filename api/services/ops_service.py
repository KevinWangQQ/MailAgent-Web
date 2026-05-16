"""运维看板数据。

直接从 Redis 读取主进程 stats_reporter 上报的运行统计，与远程
webhook-server `/dashboard/api/stats` 等价（同一份 Redis、同一份 schema）。
等本地 web 接管 cloudflared tunnel 后即可下线远程那个看板。
"""

from __future__ import annotations

import json
import time
from typing import Any, Dict

from api.services.redis_service import get_redis

_STATS_KEY_PREFIX = "mailagent:stats:"
_QUEUE_PREFIX = "mailagent"
_STATS_TTL = 300  # 与 webhook-server/app.py:35 对齐

_SECTIONS = ("service", "watcher", "reverse", "redis_consumer", "handlers")


def _parse_hash(raw: Dict[str, str]) -> Dict[str, Any]:
    parsed: Dict[str, Any] = {}
    for k, v in raw.items():
        try:
            parsed[k] = json.loads(v)
        except (json.JSONDecodeError, TypeError):
            parsed[k] = v
    return parsed


async def get_ops_stats() -> Dict[str, Any]:
    """聚合一次完整的运维看板数据快照。

    返回结构与远程 webhook-server `/dashboard/api/stats` 完全一致，
    便于前端复用 schema、便于将来彻底替换。
    """
    r = await get_redis()

    db_ids: set[str] = set()
    async for key in r.scan_iter(f"{_STATS_KEY_PREFIX}*:service"):
        parts = key.split(":")
        if len(parts) >= 4:
            db_ids.add(parts[2])

    if not db_ids:
        return {"online": False, "last_heartbeat": None, "data": None}

    db_id = sorted(db_ids)[0]
    key_prefix = f"{_STATS_KEY_PREFIX}{db_id}"

    pipe = r.pipeline()
    for section in _SECTIONS:
        pipe.hgetall(f"{key_prefix}:{section}")
    pipe.lrange(f"{key_prefix}:alerts", 0, 49)
    results = await pipe.execute()

    sections = {name: _parse_hash(results[i]) for i, name in enumerate(_SECTIONS)}
    alerts_raw = results[len(_SECTIONS)]
    alerts = [json.loads(a) for a in alerts_raw] if alerts_raw else []

    last_heartbeat_raw = sections["service"].get("last_heartbeat")
    try:
        last_hb = int(float(last_heartbeat_raw)) if last_heartbeat_raw else 0
    except (ValueError, TypeError):
        last_hb = 0
    online = (time.time() - last_hb) < _STATS_TTL if last_hb else False

    queues: Dict[str, Dict[str, Any]] = {}
    async for key in r.scan_iter(f"{_QUEUE_PREFIX}:*:events"):
        q_db_id = key.split(":")[1]
        length = await r.llen(key)
        queues[q_db_id] = {"queue": key, "pending": length}

    return {
        "online": online,
        "last_heartbeat": last_hb,
        "data": {
            **sections,
            "queues": queues,
            "alerts": alerts,
        },
    }
