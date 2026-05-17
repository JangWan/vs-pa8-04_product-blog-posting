"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export type HistoryListItem = {
  id: string;
  topic: string;
  created_at: string;
  updated_at: string;
  guideline_title: string | null;
};

export type HistoryListPage = {
  data: HistoryListItem[];
  next_cursor: string | null;
};

export type HistoryDetail = {
  id: string;
  topic: string;
  keywords: string[];
  direction: string | null;
  body: string;
  seo_meta: {
    title: string;
    description: string;
    slug: string;
    keywords: string[];
  };
  source_lang: "ko" | "en";
  guideline_title: string | null;
  created_at: string;
  updated_at: string;
};

async function extractErrorMessage(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/* ── 목록 무한스크롤 ── */
export function useHistoryInfinite(pageSize = 20) {
  return useInfiniteQuery<HistoryListPage>({
    queryKey: ["history", "infinite", pageSize],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam) params.set("cursor", String(pageParam));
      const res = await fetch(`/api/history?${params.toString()}`);
      if (!res.ok) throw new Error("이력을 불러오지 못했습니다.");
      return res.json() as Promise<HistoryListPage>;
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 60 * 1000,
  });
}

/* ── 단건 상세 ── */
export function useHistoryDetail(id: string | undefined) {
  return useQuery<HistoryDetail>({
    queryKey: ["history", "detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/history/${id}`);
      if (res.status === 404) throw new Error("이력을 찾을 수 없습니다.");
      if (!res.ok) throw new Error(await extractErrorMessage(res, "이력을 불러오지 못했습니다."));
      return res.json() as Promise<HistoryDetail>;
    },
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

/* ── 삭제 (UC-15 §4-1) ── */
export function useDeleteHistory() {
  const queryClient = useQueryClient();
  return useMutation<{ success: true }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await extractErrorMessage(res, "이력 삭제에 실패했습니다."));
      return res.json() as Promise<{ success: true }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
  });
}
