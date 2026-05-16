"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export type GuidelineItem = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const GUIDELINES_KEY = ["guidelines"] as const;

/* ── 목록 조회 (UC-10) ── */
export function useGuidelines() {
  return useQuery<GuidelineItem[]>({
    queryKey: GUIDELINES_KEY,
    queryFn: async () => {
      const res = await fetch("/api/guidelines");
      if (!res.ok) throw new Error("지침을 불러오지 못했습니다.");
      return res.json() as Promise<GuidelineItem[]>;
    },
    staleTime: 5 * 60 * 1000, // 5분
  });
}

/* ── 단건 조회 (UC-12 수정 폼 초기 데이터) ── */
export function useGuideline(id: string | undefined) {
  return useQuery<GuidelineItem>({
    queryKey: ["guidelines", id],
    queryFn: async () => {
      const res = await fetch(`/api/guidelines/${id}`);
      if (res.status === 404) {
        throw new Error("지침을 찾을 수 없습니다.");
      }
      if (res.status === 403) {
        throw new Error("지침에 접근할 권한이 없습니다.");
      }
      if (!res.ok) throw new Error("지침을 불러오지 못했습니다.");
      return res.json() as Promise<GuidelineItem>;
    },
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/* ── 공통: 서버 오류 메시지 추출 ── */
async function extractErrorMessage(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/* ── 생성 (UC-11) ── */
export type CreateGuidelineInput = {
  title: string;
  content: string;
};

export function useCreateGuideline() {
  const queryClient = useQueryClient();

  return useMutation<GuidelineItem, Error, CreateGuidelineInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/guidelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, is_default: false }),
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, "지침 저장에 실패했습니다."));
      }
      return res.json() as Promise<GuidelineItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GUIDELINES_KEY });
    },
  });
}

/* ── 수정 (UC-12) ── */
export type UpdateGuidelineInput = {
  id: string;
  title: string;
  content: string;
};

export function useUpdateGuideline() {
  const queryClient = useQueryClient();

  return useMutation<GuidelineItem, Error, UpdateGuidelineInput>({
    mutationFn: async ({ id, title, content }) => {
      const res = await fetch(`/api/guidelines/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, "지침 수정에 실패했습니다."));
      }
      return res.json() as Promise<GuidelineItem>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: GUIDELINES_KEY });
      queryClient.invalidateQueries({ queryKey: ["guidelines", data.id] });
    },
  });
}

/* ── 삭제 (UC-13) ── */
export function useDeleteGuideline() {
  const queryClient = useQueryClient();

  return useMutation<{ success: true }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/guidelines/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res, "지침 삭제에 실패했습니다."));
      }
      return res.json() as Promise<{ success: true }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GUIDELINES_KEY });
    },
  });
}

/* ── 기본 지침 설정 (UC-14, BR-11 단일 보장) ── */
export function useSetDefaultGuideline() {
  const queryClient = useQueryClient();

  return useMutation<GuidelineItem, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/guidelines/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) {
        throw new Error(
          await extractErrorMessage(res, "기본 지침 설정에 실패했습니다.")
        );
      }
      return res.json() as Promise<GuidelineItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GUIDELINES_KEY });
    },
  });
}
