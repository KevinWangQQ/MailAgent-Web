import { clsx } from "clsx";
import { fmtNum } from "@/lib/ops";
import type { OpsQueue, OpsRedisConsumer } from "@/lib/ops";

interface Props {
  queues: Record<string, OpsQueue> | undefined;
  consumer: OpsRedisConsumer | undefined;
}

export function RedisQueues({ queues, consumer }: Props) {
  const list = Object.values(queues ?? {});
  const c = consumer ?? {};

  return (
    <div className="bg-bg-secondary rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-xs font-semibold text-fg-primary">Redis 队列 & Consumer</div>
      <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <div className="space-y-1.5">
          {list.length === 0 ? (
            <div className="text-center text-xs text-fg-faint py-4">No queue data</div>
          ) : (
            list.map((q) => {
              const pending = q.pending ?? 0;
              return (
                <div
                  key={q.queue}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-bg-tertiary"
                >
                  <span className="text-[11px] text-fg-secondary font-mono truncate">{q.queue ?? "--"}</span>
                  <span
                    className={clsx(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium tabular-nums",
                      pending === 0
                        ? "bg-status-success/15 text-status-success"
                        : "bg-status-caution/15 text-status-caution"
                    )}
                  >
                    {pending === 0 ? "empty" : `${fmtNum(pending)} pending`}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <div className="flex gap-3 lg:flex-col lg:min-w-[120px]">
          <ConsumerStat label="Received" value={fmtNum(c.received)} accent="text-fg-primary" />
          <ConsumerStat label="Processed" value={fmtNum(c.processed)} accent="text-status-success" />
          <ConsumerStat label="Errors" value={fmtNum(c.errors)} accent="text-status-danger" />
        </div>
      </div>
    </div>
  );
}

function ConsumerStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex-1 lg:flex-none">
      <div className="text-[10px] text-fg-muted mb-0.5">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}
