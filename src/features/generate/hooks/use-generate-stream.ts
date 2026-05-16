"use client";

import { useState, useRef, useCallback } from "react";

export type StreamStatus =
  | "idle"
  | "streaming"
  | "done"
  | "error"
  | "cancelled";

export type StreamError = {
  code: "RATE_LIMIT" | "SERVER_ERROR";
  message: string;
};

export type GenerateInput = {
  topic: string;
  keywords: string[];
  direction: string;
  guidelineId: string | null;
};

export function useGenerateStream() {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<StreamError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (
      input: GenerateInput,
      onDone: (id: string) => void
    ) => {
      setStatus("streaming");
      setStreamText("");
      setError(null);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch("/api/generate/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error("스트리밍 연결에 실패했습니다.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          /* [DONE] 청크 감지 */
          const doneIdx = buffer.indexOf("[DONE]");
          if (doneIdx !== -1) {
            const beforeDone = buffer.slice(0, doneIdx);
            if (beforeDone) setStreamText((prev) => prev + beforeDone);

            const donePayload = buffer.slice(doneIdx + "[DONE]".length);
            try {
              const parsed = JSON.parse(donePayload) as { id: string };
              setStatus("done");
              onDone(parsed.id);
            } catch {
              setStatus("error");
              setError({ code: "SERVER_ERROR", message: "응답 파싱에 실패했습니다." });
            }
            return;
          }

          /* [ERROR] 청크 감지 */
          const errIdx = buffer.indexOf("[ERROR]");
          if (errIdx !== -1) {
            const errPayload = buffer.slice(errIdx + "[ERROR]".length);
            try {
              const parsed = JSON.parse(errPayload) as StreamError;
              setError(parsed);
            } catch {
              setError({ code: "SERVER_ERROR", message: "알 수 없는 오류가 발생했습니다." });
            }
            setStatus("error");
            return;
          }

          setStreamText((prev) => prev + chunk);
          buffer = "";
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("cancelled");
        } else {
          setStatus("error");
          setError({
            code: "SERVER_ERROR",
            message: (err as Error).message || "AI 생성 중 오류가 발생했습니다.",
          });
        }
      }
    },
    []
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

  return { status, streamText, error, generate, cancel, reset };
}
