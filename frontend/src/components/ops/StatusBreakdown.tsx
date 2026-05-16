import { fmtNum } from "@/lib/ops";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  synced:       { label: "Synced",       cls: "bg-status-success" },
  fetched:      { label: "Fetched",      cls: "bg-status-info" },
  pending:      { label: "Pending",      cls: "bg-status-caution" },
  fetch_failed: { label: "Fetch Failed", cls: "bg-status-warning" },
  failed:       { label: "Failed",       cls: "bg-status-danger" },
  dead_letter:  { label: "Dead Letter",  cls: "bg-status-danger" },
  skipped:      { label: "Skipped",      cls: "bg-fg-muted" },
  deleted:      { label: "Deleted",      cls: "bg-fg-faint" },
};

const ORDER = ["synced", "fetched", "pending", "fetch_failed", "failed", "dead_letter", "skipped", "deleted"];

interface Props {
  byStatus: Record<string, number> | undefined;
}

export function StatusBreakdown({ byStatus }: Props) {
  const entries = Object.entries(byStatus ?? {}).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const ordered = [
    ...ORDER.filter((k) => entries.find(([key]) => key === k)),
    ...entries.map(([k]) => k).filter((k) => !ORDER.includes(k)),
  ];

  return (
    <div className="bg-bg-secondary rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-xs font-semibold text-fg-primary">状态分布</div>
      <div className="px-4 py-3">
        {entries.length === 0 ? (
          <div className="text-center text-xs text-fg-faint py-6">暂无数据</div>
        ) : (
          <>
            <div className="flex h-2 rounded-full overflow-hidden bg-bg-tertiary mb-3">
              {ordered.map((k) => {
                const v = byStatus?.[k] ?? 0;
                const pct = Math.max(0.5, (v / total) * 100);
                const meta = STATUS_META[k] ?? { label: k, cls: "bg-fg-muted" };
                return <div key={k} className={meta.cls} style={{ width: `${pct}%` }} title={`${meta.label}: ${fmtNum(v)}`} />;
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
              {ordered.map((k) => {
                const meta = STATUS_META[k] ?? { label: k, cls: "bg-fg-muted" };
                const v = byStatus?.[k] ?? 0;
                return (
                  <div key={k} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${meta.cls}`} />
                    <span className="text-fg-tertiary">{meta.label}</span>
                    <span className="text-fg-primary tabular-nums font-medium">{fmtNum(v)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
