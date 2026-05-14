import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import type { EmailFilter, EmailView, ViewCounts } from "@/lib/types";

const VIEW_TABS: { key: EmailView; label: string }[] = [
  { key: "pending", label: "待处理" },
  { key: "browse", label: "值得浏览" },
  { key: "ignore", label: "可忽略" },
  { key: "all", label: "全部" },
];

const QUICK_FILTERS: { label: string; key: keyof EmailFilter; value: string }[] = [
  { label: "紧急", key: "priority", value: "🔴 紧急" },
  { label: "重要", key: "priority", value: "🟡 重要" },
  { label: "需要回复", key: "action_type", value: "需要回复" },
  { label: "需要决策", key: "action_type", value: "需要决策" },
];

interface Props {
  filter: EmailFilter;
  onFilterChange: (f: EmailFilter) => void;
  viewCounts?: ViewCounts;
  searchOpen?: boolean;
  onSearchToggle?: (open: boolean) => void;
  onViewAction?: (action: string, view: string) => void;
}

export function FilterBar({ filter, onFilterChange, viewCounts, searchOpen: externalSearchOpen, onSearchToggle, onViewAction }: Props) {
  const [internalSearchOpen, setInternalSearchOpen] = useState(false);
  const searchOpen = externalSearchOpen ?? internalSearchOpen;
  const setSearchOpen = onSearchToggle ?? setInternalSearchOpen;
  const [searchText, setSearchText] = useState(filter.search ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const activeView: EmailView = filter.view ?? "pending";

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  function handleSearchChange(value: string) {
    setSearchText(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange({ ...filter, search: value || undefined });
    }, 300);
  }

  function clearSearch() {
    setSearchText("");
    onFilterChange({ ...filter, search: undefined });
    setSearchOpen(false);
  }

  function switchView(view: EmailView) {
    setSearchText("");
    onFilterChange({ view });
  }

  const isActive = (key: keyof EmailFilter, value: string) =>
    filter[key] === value;

  function toggle(key: keyof EmailFilter, value: string) {
    if (filter[key] === value) {
      onFilterChange({ ...filter, [key]: undefined });
    } else {
      onFilterChange({ ...filter, [key]: value });
    }
  }

  function getCount(view: EmailView): number | undefined {
    if (!viewCounts) return undefined;
    return viewCounts[view];
  }

  return (
    <div className="border-b border-border">
      {/* 视图切换 + 搜索 */}
      <div className="px-3 py-2 flex items-center gap-1 border-b border-border">
        {VIEW_TABS.map((tab) => {
          const count = getCount(tab.key);
          const isCurrentView = activeView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => switchView(tab.key)}
              className={clsx(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1",
                isCurrentView
                  ? "bg-accent text-white"
                  : "text-fg-muted hover:text-fg-secondary hover:bg-bg-hover"
              )}
            >
              {tab.label}
              {count !== undefined && (
                <span
                  className={clsx(
                    "text-[10px] min-w-[16px] text-center rounded-full px-1",
                    isCurrentView ? "bg-white/20" : "bg-bg-tertiary"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {/* 视图级快捷操作 */}
        {activeView === "browse" && onViewAction && (
          <button
            onClick={() => onViewAction("mark_browsed", "browse")}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-status-success/15 text-status-success hover:bg-status-success/25 transition-colors ml-auto"
          >
            全部已阅
          </button>
        )}
        {activeView === "pending" && onViewAction && (
          <button
            onClick={() => onViewAction("mark_done", "pending")}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-status-success/15 text-status-success hover:bg-status-success/25 transition-colors ml-auto"
          >
            全部完成
          </button>
        )}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={clsx(
            "px-2 py-0.5 rounded text-[11px] border transition-colors",
            activeView !== "browse" && activeView !== "pending" && "ml-auto",
            searchOpen || filter.search
              ? "border-accent bg-accent-dim text-accent"
              : "border-border text-fg-muted hover:border-accent hover:text-accent"
          )}
        >
          🔍
        </button>
      </div>

      {/* 搜索栏 */}
      {searchOpen && (
        <div className="px-3 py-2 flex gap-2 items-center border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") clearSearch(); }}
            placeholder="搜索主题或发件人..."
            className="flex-1 bg-transparent text-xs text-fg-primary placeholder:text-fg-faint outline-none"
          />
          {searchText && (
            <button onClick={clearSearch} className="text-fg-faint hover:text-fg-tertiary text-xs">
              ✕
            </button>
          )}
        </div>
      )}

      {/* 快捷过滤标签（待处理和全部视图显示） */}
      {(activeView === "pending" || activeView === "all") && (
        <div className="px-3 py-1.5 flex gap-1.5 flex-wrap items-center">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => toggle(f.key, f.value)}
              className={clsx(
                "px-2 py-0.5 rounded-xl text-[10px] border transition-colors",
                isActive(f.key, f.value)
                  ? "border-accent bg-accent-dim text-accent"
                  : "border-border text-fg-faint hover:border-accent hover:text-accent"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
