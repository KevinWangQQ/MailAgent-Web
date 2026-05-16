import { clsx } from "clsx";
import { asBool, fmtUptime, relativeTime } from "@/lib/ops";
import type { OpsData } from "@/lib/ops";

interface Props {
  data: OpsData | null;
  online: boolean;
  lastHeartbeat: number | null;
}

interface Chip {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}

export function ServiceRow({ data, online, lastHeartbeat }: Props) {
  const svc = data?.service ?? {};
  const watcher = data?.watcher ?? {};
  const consumer = data?.redis_consumer ?? {};
  const watcherOk = asBool(watcher.running);
  const consumerOk = asBool(consumer.running);

  const chips: Chip[] = [
    { label: "服务", value: online ? "在线" : "离线", tone: online ? "ok" : "warn" },
    { label: "Uptime", value: fmtUptime(svc.uptime_seconds), tone: "muted" },
    { label: "Python", value: svc.python_version ?? "--", tone: "muted" },
    { label: "心跳", value: relativeTime(lastHeartbeat), tone: "muted" },
    { label: "Watcher", value: watcherOk ? "运行中" : "已停止", tone: watcherOk ? "ok" : "warn" },
    { label: "Redis", value: consumerOk ? "运行中" : "已停止", tone: consumerOk ? "ok" : "warn" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div
          key={c.label}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs"
        >
          <span className="text-fg-muted">{c.label}</span>
          <span
            className={clsx(
              "font-medium tabular-nums",
              c.tone === "ok" && "text-status-success",
              c.tone === "warn" && "text-status-warning",
              (!c.tone || c.tone === "muted") && "text-fg-primary"
            )}
          >
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}
