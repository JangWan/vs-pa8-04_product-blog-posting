"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export type VersionListItem = {
  version_no: number;
  created_at: string;
  is_current: boolean;
  char_count: number;
  char_diff: number | null;
};

export type VersionListPage = {
  data: VersionListItem[];
  next_cursor: number | null;
};

export type VersionDetail = {
  version_no: number;
  snapshot_body: string;
  snapshot_seo_meta: {
    title: string;
    description: string;
    slug: string;
    keywords: string[];
  };
  created_at: string;
};

export type VersionDiff = {
  from: {
    version_no: number;
    body: string;
    seo_meta: VersionDetail["snapshot_seo_meta"];
    created_at: string;
  };
  to: {
    version_no: number;
    body: string;
    seo_meta: VersionDetail["snapshot_seo_meta"];
    created_at: string;
  };
};

async function extractErrorMessage(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/* ── 목록 (UC-16) ── */
export function useVersionsInfinite(contentId: string | undefined, pageSize = 30) {
  return useInfiniteQuery<VersionListPage>({
    queryKey: ["versions", contentId, "infinite", pageSize],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam !== null) params.set("cursor", String(pageParam));
      const res = await fetch(
        `/api/contents/${contentId}/versions?${params.toString()}`,
      );
      if (!res.ok) throw new Error("버전 목록을 불러오지 못했습니다.");
      return res.json() as Promise<VersionListPage>;
    },
    enabled: Boolean(contentId),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30 * 1000,
  });
}

/* ── 단건 (UC-16 미리보기) ── */
export function useVersionDetail(
  contentId: string | undefined,
  versionNo: number | undefined,
) {
  return useQuery<VersionDetail>({
    queryKey: ["versions", contentId, "detail", versionNo],
    queryFn: async () => {
      const res = await fetch(`/api/contents/${contentId}/versions/${versionNo}`);
      if (!res.ok) throw new Error(await extractErrorMessage(res, "버전을 불러오지 못했습니다."));
      return res.json() as Promise<VersionDetail>;
    },
    enabled: Boolean(contentId) && typeof versionNo === "number",
    staleTime: Infinity, // 스냅샷은 불변 (TRD §6 캐싱 전략)
  });
}

/* ── 수동 스냅샷 (UC-17) ── */
export function useCreateSnapshot(contentId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ version_no: number; created_at: string }, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/contents/${contentId}/versions`, {
        method: "POST",
      });
      if (!res.ok) {
        const status = res.status;
        const message = await extractErrorMessage(res, "스냅샷 저장에 실패했습니다.");
        const err = new Error(message) as Error & { status?: number };
        err.status = status;
        throw err;
      }
      return res.json() as Promise<{ version_no: number; created_at: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["versions", contentId] });
    },
  });
}

/* ── 복원 (UC-18) ── */
export function useRestoreVersion(contentId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    {
      restored_from_version_no: number;
      new_current_version_no: number;
      updated_at: string;
    },
    Error,
    number
  >({
    mutationFn: async (versionNo) => {
      const res = await fetch(
        `/api/contents/${contentId}/versions/${versionNo}/restore`,
        { method: "POST" },
      );
      if (!res.ok) {
        const status = res.status;
        const message = await extractErrorMessage(res, "복원에 실패했습니다.");
        const err = new Error(message) as Error & { status?: number };
        err.status = status;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["versions", contentId] });
      queryClient.invalidateQueries({ queryKey: ["history", "detail", contentId] });
    },
  });
}

/* ── Diff (UC-19) ── */
export function useVersionDiff(
  contentId: string | undefined,
  from: number | undefined,
  to: number | undefined,
) {
  return useQuery<VersionDiff>({
    queryKey: ["versions", contentId, "diff", from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ from: String(from), to: String(to) });
      const res = await fetch(
        `/api/contents/${contentId}/versions/diff?${params.toString()}`,
      );
      if (!res.ok) throw new Error(await extractErrorMessage(res, "Diff를 불러오지 못했습니다."));
      return res.json() as Promise<VersionDiff>;
    },
    enabled:
      Boolean(contentId) && typeof from === "number" && typeof to === "number",
    staleTime: Infinity,
  });
}
