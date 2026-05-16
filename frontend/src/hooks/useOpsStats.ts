import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { OpsStats } from "@/lib/ops";

export function useOpsStats() {
  return useQuery({
    queryKey: ["ops-stats"],
    queryFn: () => apiFetch<OpsStats>("/ops/stats"),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
}
