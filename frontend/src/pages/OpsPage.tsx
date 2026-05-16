import { useOpsStats } from "@/hooks/useOpsStats";
import { AlertsList } from "@/components/ops/AlertsList";
import { EventHandlers } from "@/components/ops/EventHandlers";
import { MailboxBars } from "@/components/ops/MailboxBars";
import { MetricsRow } from "@/components/ops/MetricsRow";
import { RedisQueues } from "@/components/ops/RedisQueues";
import { ReverseSync } from "@/components/ops/ReverseSync";
import { ServiceRow } from "@/components/ops/ServiceRow";
import { StatusBreakdown } from "@/components/ops/StatusBreakdown";

export default function OpsPage() {
  const { data, isLoading, error } = useOpsStats();

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-fg-muted">加载中…</div>;
  }
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-status-danger">
        加载失败：{error instanceof Error ? error.message : String(error)}
      </div>
    );
  }
  if (!data) return null;

  const d = data.data;
  if (!d) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-fg-muted">
        没有上报数据（mail-sync 的 stats_reporter 未启用或未写入 Redis）
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 w-full max-w-[1800px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-fg-primary tracking-tight">运维看板</h1>
        <span className="text-[11px] text-fg-muted">5s 自动刷新</span>
      </div>

      <ServiceRow data={d} online={data.online} lastHeartbeat={data.last_heartbeat} />

      <MetricsRow watcher={d.watcher} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MailboxBars byMailbox={d.watcher?.by_mailbox} />
        <StatusBreakdown byStatus={d.watcher?.by_status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReverseSync reverse={d.reverse} />
        <EventHandlers handlers={d.handlers} />
      </div>

      <RedisQueues queues={d.queues} consumer={d.redis_consumer} />

      <AlertsList alerts={d.alerts} />
    </div>
  );
}
