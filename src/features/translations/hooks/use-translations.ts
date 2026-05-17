"use client";

import { useCallback, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export type TargetLang = "ko" | "en";
export type TranslationStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed";

export type TranslationStatusItem = {
  target_lang: TargetLang;
  status: TranslationStatus;
  error_message: string | null;
  updated_at: string;
};

export type TranslationsList = {
  source_lang: TargetLang;
  data: TranslationStatusItem[];
};

export type TranslationDetail = {
  target_lang: TargetLang;
  translated_body: string;
  translated_seo_meta: {
    title: string;
    description: string;
    slug: string;
    keywords: string[];
  };
  status: TranslationStatus;
  error_message: string | null;
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

/* ── 목록 (이력 상세 탭 구성용) ── */
export function useTranslationsList(contentId: string | undefined) {
  return useQuery<TranslationsList>({
    queryKey: ["translations", contentId, "list"],
    queryFn: async () => {
      const res = await fetch(`/api/contents/${contentId}/translations`);
      if (!res.ok) throw new Error(await extractErrorMessage(res, "번역 목록을 불러오지 못했습니다."));
      return res.json() as Promise<TranslationsList>;
    },
    enabled: Boolean(contentId),
    staleTime: 10 * 1000,
  });
}

/* ── 본문 단건 (UC-21) ── */
export function useTranslationDetail(
  contentId: string | undefined,
  lang: TargetLang | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery<TranslationDetail>({
    queryKey: ["translations", contentId, "detail", lang],
    queryFn: async () => {
      const res = await fetch(`/api/contents/${contentId}/translations/${lang}`);
      if (!res.ok) throw new Error(await extractErrorMessage(res, "번역본을 불러오지 못했습니다."));
      return res.json() as Promise<TranslationDetail>;
    },
    enabled: Boolean(contentId) && Boolean(lang) && (options.enabled ?? true),
    staleTime: Infinity, // 불변 데이터 (TRD §6)
  });
}

/* ── 삭제 (UC-22) ── */
export function useDeleteTranslation(contentId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    { deleted: true; target_lang: TargetLang },
    Error,
    TargetLang
  >({
    mutationFn: async (lang) => {
      const res = await fetch(`/api/contents/${contentId}/translations/${lang}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res, "번역본 삭제에 실패했습니다."));
      return res.json();
    },
    onSuccess: (_, lang) => {
      queryClient.invalidateQueries({ queryKey: ["translations", contentId] });
      queryClient.removeQueries({
        queryKey: ["translations", contentId, "detail", lang],
      });
    },
  });
}

/* ── 스트리밍 번역 (UC-20·21) ── */
export type TranslationStreamStatus =
  | "idle"
  | "streaming"
  | "done"
  | "error"
  | "cancelled"
  | "conflict";

export type TranslationStreamError = {
  code: "RATE_LIMIT" | "SERVER_ERROR" | "ALREADY_EXISTS";
  message: string;
};

export function useTranslationStream(contentId: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TranslationStreamStatus>("idle");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<TranslationStreamError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (input: { target_lang: TargetLang; force?: boolean }) => {
      setStatus("streaming");
      setStreamText("");
      setError(null);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch(
          `/api/contents/${contentId}/translations/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: abort.signal,
          },
        );

        if (res.status === 409) {
          /* 4-1: 기존 번역 존재 → 덮어쓰기 확인 */
          setStatus("conflict");
          setError({
            code: "ALREADY_EXISTS",
            message: "이미 해당 언어 번역본이 있습니다.",
          });
          return;
        }

        if (!res.ok || !res.body) {
          const message = await extractErrorMessage(res, "번역에 실패했습니다.");
          setStatus("error");
          setError({ code: "SERVER_ERROR", message });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          const doneIdx = chunk.indexOf("[DONE]");
          if (doneIdx !== -1) {
            const before = chunk.slice(0, doneIdx);
            if (before) setStreamText((prev) => prev + before);
            setStatus("done");
            queryClient.invalidateQueries({ queryKey: ["translations", contentId] });
            return;
          }

          const errIdx = chunk.indexOf("[ERROR]");
          if (errIdx !== -1) {
            const errPayload = chunk.slice(errIdx + "[ERROR]".length);
            try {
              const parsed = JSON.parse(errPayload) as TranslationStreamError;
              setError(parsed);
            } catch {
              setError({
                code: "SERVER_ERROR",
                message: "알 수 없는 오류가 발생했습니다.",
              });
            }
            setStatus("error");
            queryClient.invalidateQueries({ queryKey: ["translations", contentId] });
            return;
          }

          setStreamText((prev) => prev + chunk);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("cancelled");
        } else {
          setStatus("error");
          setError({
            code: "SERVER_ERROR",
            message: (err as Error).message ?? "번역 중 오류가 발생했습니다.",
          });
        }
      }
    },
    [contentId, queryClient],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("cancelled");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setStreamText("");
    setError(null);
  }, []);

  return { status, streamText, error, start, cancel, reset };
}
