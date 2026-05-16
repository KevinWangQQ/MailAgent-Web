export interface OpsService {
  python_version?: string;
  uptime_seconds?: number;
  start_time?: number;
  last_heartbeat?: number;
}

export interface OpsWatcher {
  polls?: number;
  new_emails_detected?: number;
  emails_synced?: number;
  emails_skipped?: number;
  meeting_invites?: number;
  retries_attempted?: number;
  retries_succeeded?: number;
  flag_changes_synced?: number;
  errors?: number;
  consecutive_errors?: number;
  healthy?: string | boolean;
  running?: string | boolean;
  total_emails?: number;
  by_status?: Record<string, number>;
  by_mailbox?: Record<string, number>;
  pending?: number;
  synced?: number;
  failed?: number;
  fetch_failed?: number;
  dead_letter?: number;
  skipped?: number;
  failure_queue?: number;
  last_max_row_id?: number;
  last_sync_time?: string;
  db_size_bytes?: number;
  db_size_mb?: number;
  radar_last_max_row_id?: number;
  radar_available?: string | boolean;
}

export interface OpsReverse {
  last_check?: string;
  total_synced?: number;
  total_errors?: number;
  total_notified?: number;
}

export interface OpsRedisConsumer {
  received?: number;
  processed?: number;
  errors?: number;
  queue?: string;
  running?: string | boolean;
}

export interface OpsHandlers {
  flag_changed?: number;
  ai_reviewed?: number;
  completed?: number;
  create_draft?: number;
  create_draft_success?: number;
  create_draft_error?: number;
  query_mail?: number;
  fetch_mail_content?: number;
  feishu_notified?: number;
}

export interface OpsQueue {
  queue?: string;
  pending?: number;
}

export interface OpsData {
  service?: OpsService;
  watcher?: OpsWatcher;
  reverse?: OpsReverse;
  redis_consumer?: OpsRedisConsumer;
  handlers?: OpsHandlers;
  queues?: Record<string, OpsQueue>;
  alerts?: unknown[];
}

export interface OpsStats {
  online: boolean;
  last_heartbeat: number | null;
  data: OpsData | null;
}

export function asBool(v: unknown): boolean {
  return v === true || v === "True" || v === "true" || v === 1 || v === "1";
}

export function fmtNum(n: number | undefined | null): string {
  if (n == null) return "--";
  return Number(n).toLocaleString("en-US");
}

export function fmtUptime(secs: number | undefined): string {
  if (secs == null) return "--";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return "--";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 0) return "刚刚";
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export function fmtDateTime(s: string | undefined): string {
  if (!s) return "--";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
