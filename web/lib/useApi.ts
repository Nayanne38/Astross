"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type Params } from "./fire-data";

/** Compat wrapper (used by the ported teachers page) over TanStack Query. */
export function useApi<T>(path: string | null, params: Params = {}) {
  const q = useQuery({
    queryKey: ["compat", path, params],
    enabled: !!path,
    queryFn: () => api<T>(path as string, params),
  });
  const error = q.error ? (q.error.message.includes("fetch") ? "API unavailable — run `python tasks.py api`." : q.error.message) : null;
  return { data: (q.data ?? null) as T | null, error, loading: q.isPending && !!path };
}
