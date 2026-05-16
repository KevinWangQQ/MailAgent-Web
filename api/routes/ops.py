"""运维看板 API。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import verify_token
from api.services.ops_service import get_ops_stats

router = APIRouter(prefix="/ops", tags=["运维"], dependencies=[Depends(verify_token)])


@router.get("/stats")
async def stats():
    return await get_ops_stats()
