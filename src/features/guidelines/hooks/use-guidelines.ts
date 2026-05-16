"use client";

import { useQuery } from "@tanstack/react-query";

export type GuidelineItem = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function useGuidelines() {
  return useQuery<GuidelineItem[]>({
    queryKey: ["guidelines"],
    queryFn: async () => {
      const res = await fetch("/api/guidelines");
      if (!res.ok) throw new Error("지침을 불러오지 못했습니다.");
      return res.json() as Promise<GuidelineItem[]>;
    },
    staleTime: 5 * 60 * 1000, // 5분
  });
}
