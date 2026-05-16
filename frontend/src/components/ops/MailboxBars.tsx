import { fmtNum } from "@/lib/ops";

const COLORS = [
  "bg-status-info",
  "bg-status-purple",
  "bg-status-success",
  "bg-status-caution",
  "bg-status-warning",
  "bg-status-danger",
];

interface Props {
  byMailbox: Record<string, number> | undefined;
}

export function MailboxBars({ byMailbox }: Props) {
  const entries = Object.entries(byMailbox ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Card title="邮箱分布">
      {entries.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-2.5">
          {entries.map(([name, count], i) => {
            const max = entries[0]?.[1] ?? 1;
            const pct = Math.round((count / max) * 100);
            return (
              <div key={name}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-fg-secondary truncate">{name}</span>
                  <span className="text-fg-muted tabular-nums">{fmtNum(count)}</span>
                </div>
                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${COLORS[i % COLORS.length]} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-secondary rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-xs font-semibold text-fg-primary">{title}</div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-center text-xs text-fg-faint py-6">📭 暂无数据</div>;
}
