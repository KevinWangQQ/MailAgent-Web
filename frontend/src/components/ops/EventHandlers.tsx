import { fmtNum } from "@/lib/ops";
import type { OpsHandlers } from "@/lib/ops";

interface Props {
  handlers: OpsHandlers | undefined;
}

export function EventHandlers({ handlers }: Props) {
  const h = handlers ?? {};
  const items: { label: string; value: string; accent?: string }[] = [
    { label: "flag_changed", value: fmtNum(h.flag_changed) },
    { label: "ai_reviewed", value: fmtNum(h.ai_reviewed) },
    { label: "completed", value: fmtNum(h.completed) },
    { label: "query_mail", value: fmtNum(h.query_mail) },
    { label: "draft ✓", value: fmtNum(h.create_draft_success), accent: "text-status-success" },
    { label: "draft ✗", value: fmtNum(h.create_draft_error), accent: "text-status-danger" },
    { label: "feishu", value: fmtNum(h.feishu_notified), accent: "text-status-info" },
    { label: "draft total", value: fmtNum(h.create_draft) },
  ];

  return (
    <div className="bg-bg-secondary rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-xs font-semibold text-fg-primary">事件 Handlers</div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-between text-[11px]">
            <span className="text-fg-muted">{it.label}</span>
            <span className={`tabular-nums font-medium ${it.accent ?? "text-fg-primary"}`}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
