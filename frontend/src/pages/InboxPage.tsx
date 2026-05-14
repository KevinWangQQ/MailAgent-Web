import { useState, useCallback, useMemo } from "react";
import type { EmailFilter, EmailListItem, EmailView } from "@/lib/types";
import { useEmails } from "@/hooks/useEmails";
import { useEmailBody } from "@/hooks/useEmailBody";
import { useEmailDetail } from "@/hooks/useEmailDetail";
import { useViewCounts } from "@/hooks/useViewCounts";
import { useKeyboard } from "@/hooks/useKeyboard";
import { FilterBar } from "@/components/email-list/FilterBar";
import { EmailList } from "@/components/email-list/EmailList";
import { DetailPanel } from "@/components/email-detail/DetailPanel";
import { AgentPanel } from "@/components/email-detail/AgentPanel";
import { HelpPanel } from "@/components/layout/HelpPanel";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ThreadGroup {
  representative: EmailListItem;
  threadId: string | null;
  count: number;
  /** 同线程内所有邮件（仅当前页内的） */
  members: EmailListItem[];
}

/** 按 thread_id 分组，同线程只保留最新一封作为代表 */
function buildGroups(emails: EmailListItem[]): ThreadGroup[] {
  const seen = new Map<string, ThreadGroup>();
  const result: ThreadGroup[] = [];

  for (const email of emails) {
    const tid = email.thread_id;
    if (!tid || email.thread_count <= 1) {
      result.push({ representative: email, threadId: null, count: 1, members: [email] });
      continue;
    }
    const existing = seen.get(tid);
    if (existing) {
      existing.members.push(email);
      continue;
    }
    const group: ThreadGroup = {
      representative: email,
      threadId: tid,
      count: email.thread_count,
      members: [email],
    };
    seen.set(tid, group);
    result.push(group);
  }
  return result;
}

export default function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get("id");
  const initialView = (searchParams.get("view") as EmailView) || "pending";

  const [filter, setFilter] = useState<EmailFilter>({ view: initialView });
  const [activeId, setActiveId] = useState<number | null>(
    initialId ? Number(initialId) : null
  );
  const [page, setPage] = useState(1);
  const [showHelp, setShowHelp] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [aiOpen, setAiOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data, isLoading } = useEmails(filter, page, 50);
  const { data: viewCounts } = useViewCounts();
  const emails = data?.items ?? [];
  const total = data?.total ?? 0;

  const { data: activeEmail } = useEmailDetail(activeId);
  const { data: bodyData } = useEmailBody(activeId);

  const activeView = filter.view ?? "pending";

  // 线程分组 — 导航、advance、多选都基于 groups
  const groups = useMemo(() => buildGroups(emails), [emails]);

  // 当前 activeId 所在 group 的 index
  const activeGroupIndex = useMemo(() => {
    if (activeId === null) return -1;
    return groups.findIndex(
      (g) => g.representative.internal_id === activeId || g.members.some((m) => m.internal_id === activeId),
    );
  }, [groups, activeId]);

  const performAction = useCallback(async (action: string, emailId?: number) => {
    const id = emailId ?? activeId;
    if (!id) return;

    const currentEmail = activeEmail ?? emails.find((e) => e.internal_id === id);
    const isThread = !!currentEmail?.thread_id && currentEmail.thread_count > 1;

    // advance 基于 groups（线程级）
    const shouldAdvance =
      (action === "mark_done" && activeView === "pending") ||
      (action === "mark_browsed" && activeView === "browse");
    let nextId: number | null = null;
    if (shouldAdvance) {
      const gIdx = activeGroupIndex;
      if (gIdx >= 0) {
        const nextGroup = groups[gIdx + 1] ?? groups[gIdx - 1];
        nextId = nextGroup?.representative.internal_id ?? null;
      }
    }

    try {
      if (isThread) {
        const threadEmails = await apiFetch<Array<{ internal_id: number }>>(
          `/emails/thread/${encodeURIComponent(currentEmail.thread_id!)}`,
        );
        const ids = threadEmails.map((e) => e.internal_id);
        await apiFetch("/emails/batch-action", {
          method: "POST",
          body: JSON.stringify({ action, email_ids: ids }),
        });
      } else {
        await apiFetch(`/emails/${id}/action`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
      }
      if (shouldAdvance) setActiveId(nextId);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["view-counts"] });
    } catch {
      // silent
    }
  }, [activeId, activeView, activeEmail, activeGroupIndex, groups, emails, queryClient]);

  const performBatchAction = useCallback(async (action: string) => {
    if (selectedIds.size === 0) return;

    // 展开线程成员：选中的 ID 如果是线程代表，把同线程所有成员都加上
    const allIds = new Set<number>();
    for (const id of selectedIds) {
      const group = groups.find(
        (g) => g.representative.internal_id === id || g.members.some((m) => m.internal_id === id),
      );
      if (group && group.threadId) {
        for (const m of group.members) allIds.add(m.internal_id);
      } else {
        allIds.add(id);
      }
    }

    await apiFetch("/emails/batch-action", {
      method: "POST",
      body: JSON.stringify({ action, email_ids: Array.from(allIds) }),
    }).catch(() => {});

    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["view-counts"] });
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, groups, queryClient]);

  const handleViewAction = useCallback(async (action: string, view: string) => {
    const count = viewCounts?.[view as keyof typeof viewCounts] ?? 0;
    if (count === 0) return;
    if (!confirm(`确定对"${view === "browse" ? "值得浏览" : "待处理"}"视图的 ${count} 封邮件执行此操作？`)) return;

    try {
      await apiFetch("/emails/view-action", {
        method: "POST",
        body: JSON.stringify({ action, view }),
      });
      setActiveId(null);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["view-counts"] });
    } catch {
      // silent
    }
  }, [viewCounts, queryClient]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // j/k 基于 groups 导航
  const handlers = useMemo(() => {
    return {
      j: () => {
        const next = activeGroupIndex < groups.length - 1 ? activeGroupIndex + 1 : activeGroupIndex;
        if (groups[next]) setActiveId(groups[next].representative.internal_id);
      },
      k: () => {
        const prev = activeGroupIndex > 0 ? activeGroupIndex - 1 : 0;
        if (groups[prev]) setActiveId(groups[prev].representative.internal_id);
      },
      e: () => performAction(activeView === "browse" ? "mark_browsed" : "mark_done"),
      s: () => performAction("toggle_flag"),
      r: () => performAction("toggle_read"),
      x: () => {
        setSelectMode((prev) => {
          if (prev) setSelectedIds(new Set());
          return !prev;
        });
      },
      "/": (ev: KeyboardEvent) => { ev.preventDefault(); setSearchOpen(true); },
      "?": () => setShowHelp((prev) => !prev),
      i: () => setAiOpen((prev) => !prev),
      Escape: () => {
        if (showHelp) { setShowHelp(false); return; }
        if (aiOpen) { setAiOpen(false); return; }
        if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); return; }
        setActiveId(null);
      },
    };
  }, [groups, activeGroupIndex, activeView, performAction, showHelp, selectMode, searchOpen, aiOpen]);

  useKeyboard(handlers);

  const handleSelect = useCallback((id: number) => {
    setActiveId(id);
  }, []);

  const handleFilterChange = useCallback((f: EmailFilter) => {
    setFilter(f);
    setPage(1);
    setActiveId(null);
    const view = f.view ?? "pending";
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (view === "pending") next.delete("view");
      else next.set("view", view);
      next.delete("id");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* 左侧列表 */}
      <div className="w-[380px] flex flex-col border-r border-border flex-shrink-0">
        <FilterBar
          filter={filter}
          onFilterChange={handleFilterChange}
          viewCounts={viewCounts}
          searchOpen={searchOpen}
          onSearchToggle={setSearchOpen}
          onViewAction={handleViewAction}
        />

        {/* 批量操作栏 */}
        {selectMode && (
          <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-accent/5">
            <span className="text-[11px] text-accent font-medium">
              已选 {selectedIds.size} 封
            </span>
            {activeView === "browse" ? (
              <button
                onClick={() => performBatchAction("mark_browsed")}
                disabled={selectedIds.size === 0}
                className="px-2 py-0.5 rounded text-[11px] bg-accent text-white disabled:opacity-40"
              >
                批量已阅
              </button>
            ) : (
              <button
                onClick={() => performBatchAction("mark_done")}
                disabled={selectedIds.size === 0}
                className="px-2 py-0.5 rounded text-[11px] bg-accent text-white disabled:opacity-40"
              >
                批量完成
              </button>
            )}
            <button
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
              className="ml-auto text-[11px] text-fg-muted hover:text-fg-secondary"
            >
              取消
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-fg-faint text-sm">
            加载中...
          </div>
        ) : (
          <EmailList
            emails={emails}
            groups={groups}
            activeId={activeId}
            onSelect={handleSelect}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}
        {total > 50 && (
          <div className="px-3 py-2 border-t border-border flex items-center justify-between text-[11px] text-fg-muted">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:border-accent"
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={emails.length < 50}
              className="px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:border-accent"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 中间详情 */}
      {activeId ? (
        <DetailPanel emailId={activeId} view={activeView} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-fg-faint text-sm gap-1">
          <span>选择一封邮件查看详情</span>
          <span className="text-[11px] text-fg-faint">
            快捷键: J/K 导航, E {activeView === "browse" ? "已阅" : "完成"}, S 旗标, I 打开AI, ? 帮助
          </span>
        </div>
      )}

      {/* AI 侧边栏切换按钮（收起状态） */}
      {!aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-accent text-white px-1.5 py-3 rounded-l-lg text-[11px] writing-vertical hover:bg-accent/80 transition-colors z-10 shadow-lg"
          style={{ writingMode: "vertical-rl" }}
        >
          AI 助手
        </button>
      )}

      {/* AI 右侧边栏 */}
      {aiOpen && (
        <div className="w-[360px] flex-shrink-0 border-l border-border">
          <AgentPanel
            emailId={activeId}
            body={bodyData?.body ?? null}
            subject={activeEmail?.subject ?? null}
            sender={activeEmail?.sender ?? undefined}
            senderName={activeEmail?.sender_name ?? undefined}
            date={activeEmail?.date_received ?? undefined}
            mailbox={activeEmail?.mailbox ?? undefined}
            threadId={activeEmail?.thread_id ?? undefined}
            onClose={() => setAiOpen(false)}
          />
        </div>
      )}

      {/* 帮助面板 */}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
    </div>
  );
}
