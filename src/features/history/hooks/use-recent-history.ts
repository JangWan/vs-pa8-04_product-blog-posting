"use client";

import { useQuery } from "@tanstack/react-query";

export type RecentHistoryItem = {
  id: string;
  topic: string;
  created_at: string;
  updated_at: string;
  guideline_title: string | null;
};

type RecentHistoryResponse = {
  data: RecentHistoryItem[];
  next_cursor: string | null;
};

export function useRecentHistory(limit = 5) {
  return useQuery<RecentHistoryResponse>({
    queryKey: ["history", "recent", limit],
    queryFn: async () => {
      const res = await fetch(`/api/history?limit=${limit}`);
      if (!res.ok) throw new Error("이력을 불러오지 못했습니다.");
      return res.json() as Promise<RecentHistoryResponse>;
    },
    staleTime: 60 * 1000, // 1분
  });
}
