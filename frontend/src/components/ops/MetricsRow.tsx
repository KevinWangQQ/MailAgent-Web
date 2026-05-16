import { clsx } from "clsx";
import { fmtNum } from "@/lib/ops";
import type { OpsWatcher } from "@/lib/ops";

interface Props {
  watcher: OpsWatcher | undefined;
}

export function MetricsRow({ watcher }: Props) {
  const w = watcher ?? {};
  const failed = (Number(w.failed) || 0) + (Number(w.fetch_failed) || 0);
  const dead = Number(w.dead_letter) || 0;

  const cards = [
    { label: "Total", value: fmtNum(w.total_emails), sub: `polls: ${fmtNum(w.polls)}`, accent: "text-status-info" },
    { label: "Synced", value: fmtNum(w.synced), sub: `detected: ${fmtNum(w.new_emails_detected)}`, accent: "text-status-success" },
    { label: "Pending", value: fmtNum(w.pending), sub: `skipped: ${fmtNum(w.skipped)}`, accent: "text-status-caution" },
    { label: "Failed", value: failed === 0 ? "--" : fmtNum(failed), sub: `errors: ${fmtNum(w.errors)}`, accent: "text-status-danger" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-bg-secondary rounded-xl border border-border px-4 py-3">
            <div className="text-[11px] text-fg-muted mb-1.5">{c.label}</div>
            <div className={clsx("text-2xl font-bold tabular-nums tracking-tight", c.accent)}>{c.value}</div>
            <div className="text-[10px] text-fg-faint mt-1 tabular-nums">{c.sub}</div>
          </div>
        ))}
      </div>
      {dead > 0 && (
        <div className="bg-status-danger/10 border border-status-danger/30 rounded-lg px-3 py-2 text-xs text-status-danger">
          ⚠ Dead Letter: {fmtNum(dead)} 封邮件需人工介入
        </div>
      )}
    </div>
  );
}
