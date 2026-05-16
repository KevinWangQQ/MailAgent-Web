interface AlertDict {
  level?: string;
  message?: string;
  timestamp?: number;
  [k: string]: unknown;
}

interface Props {
  alerts: unknown[] | undefined;
}

function toText(a: unknown): { level: string; text: string; ts?: number } {
  if (typeof a === "string") return { level: "info", text: a };
  if (a && typeof a === "object") {
    const d = a as AlertDict;
    return {
      level: typeof d.level === "string" ? d.level : "info",
      text: typeof d.message === "string" ? d.message : JSON.stringify(d),
      ts: typeof d.timestamp === "number" ? d.timestamp : undefined,
    };
  }
  return { level: "info", text: String(a) };
}

const LEVEL_CLS: Record<string, string> = {
  critical: "bg-status-danger/15 text-status-danger",
  error: "bg-status-danger/10 text-status-danger",
  warning: "bg-status-warning/15 text-status-warning",
  info: "bg-status-info/10 text-status-info",
};

export function AlertsList({ alerts }: Props) {
  const list = alerts ?? [];

  return (
    <div className="bg-bg-secondary rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-xs font-semibold text-fg-primary flex items-center justify-between">
        <span>告警</span>
        <span className="text-[10px] text-fg-muted tabular-nums">{list.length} / 50</span>
      </div>
      <div className="px-4 py-3 max-h-[320px] overflow-y-auto">
        {list.length === 0 ? (
          <div className="text-center text-xs text-fg-faint py-6">✅ 无告警</div>
        ) : (
          <ul className="space-y-1.5">
            {list.map((a, i) => {
              const { level, text, ts } = toText(a);
              return (
                <li key={i} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0 ${LEVEL_CLS[level] ?? LEVEL_CLS.info}`}
                  >
                    {level}
                  </span>
                  <span className="text-fg-secondary break-words">{text}</span>
                  {ts != null && (
                    <span className="text-fg-faint tabular-nums shrink-0 ml-auto">
                      {new Date(ts * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
