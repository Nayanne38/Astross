"use client";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/components/app-state";
import { getJSON, type Params } from "./api";

/** Cached GET through TanStack Query. Pass enabled=false to hold the request. */
export function useQ<T>(path: string, params: Params, enabled = true) {
  const { lang, markOffline } = useApp();
  return useQuery({
    queryKey: [path, params, lang],
    enabled,
    queryFn: async () => {
      const r = await getJSON<T>(path, params);
      if (r.offline) markOffline();
      return r.data;
    },
  });
}
