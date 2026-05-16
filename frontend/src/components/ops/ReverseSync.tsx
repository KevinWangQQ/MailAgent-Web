import { fmtDateTime, fmtNum } from "@/lib/ops";
import type { OpsReverse } from "@/lib/ops";

interface Props {
  reverse: OpsReverse | undefined;
}

export function ReverseSync({ reverse }: Props) {
  const r = reverse ?? {};
  const items = [
    { label: "Synced to Mail", value: fmtNum(r.total_synced), accent: "text-fg-primary" },
    { label: "Feishu Notified", value: fmtNum(r.total_notified), accent: "text-status-info" },
    { label: "Errors", value: fmtNum(r.total_errors), accent: "text-status-danger" },
    { label: "Last Check", value: fmtDateTime(r.last_check), accent: "text-fg-secondary", sm: true },
  ];

  return (
    <div className="bg-bg-secondary rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-xs font-semibold text-fg-primary">反向同步</div>
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.label}>
            <div className="text-[10px] text-fg-muted mb-1">{it.label}</div>
            <div className={`${it.accent} tabular-nums font-semibold ${it.sm ? "text-sm" : "text-xl"}`}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
