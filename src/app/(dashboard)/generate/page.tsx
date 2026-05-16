"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2,
  X,
  Sparkles,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGuidelines } from "@/features/guidelines/hooks/use-guidelines";
import { useGenerateStream } from "@/features/generate/hooks/use-generate-stream";

/* ── 키워드 태그 입력 컴포넌트 ── */
function KeywordInput({
  keywords,
  onChange,
}: {
  keywords: string[];
  onChange: (kw: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const MAX = 5;
  const isMax = keywords.length >= MAX;

  function addKeyword(value: string) {
    const trimmed = value.trim();
    if (!trimmed || keywords.includes(trimmed) || isMax) return;
    onChange([...keywords, trimmed]);
    setInputValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      addKeyword(inputValue);
    } else if (e.key === "Backspace" && !inputValue && keywords.length > 0) {
      onChange(keywords.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-background min-h-[42px] focus-within:ring-1 focus-within:ring-ring">
      {keywords.map((kw) => (
        <span
          key={kw}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-full"
        >
          {kw}
          <button
            type="button"
            onClick={() => onChange(keywords.filter((k) => k !== kw))}
            className="hover:text-destructive transition-colors"
            aria-label={`${kw} 제거`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {!isMax && (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addKeyword(inputValue)}
          placeholder={keywords.length === 0 ? "키워드 입력 후 Space·Enter" : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      )}
      {isMax && (
        <span className="text-xs text-muted-foreground self-center">
          키워드는 최대 5개까지 입력 가능합니다.
        </span>
      )}
    </div>
  );
}

/* ── 스트리밍 미리보기 ── */
function StreamingPreview({
  text,
  streamRef,
}: {
  text: string;
  streamRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={streamRef}
      className="mt-6 p-4 border border-border rounded-lg bg-secondary/30 max-h-96 overflow-y-auto"
    >
      <p className="text-xs text-muted-foreground mb-3 font-medium">
        AI 초안 생성 중...
      </p>
      <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
        {text}
        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />
      </pre>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function GeneratePage() {
  const router = useRouter();
  const { data: guidelines } = useGuidelines();
  const { status, streamText, error, generate, cancel, reset } =
    useGenerateStream();

  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [direction, setDirection] = useState("");
  const [guidelineId, setGuidelineId] = useState<string | null>(null);
  const [topicError, setTopicError] = useState("");

  const streamRef = useRef<HTMLDivElement>(null);

  /* 기본 지침 자동 선택 */
  useEffect(() => {
    if (!guidelines) return;
    const def = guidelines.find((g) => g.is_default);
    if (def) setGuidelineId(def.id);
  }, [guidelines]);

  /* 스트리밍 중 자동 스크롤 */
  useEffect(() => {
    if (streamRef.current && status === "streaming") {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [streamText, status]);

  /* 완료 후 토스트 (done 상태는 onDone 콜백에서 처리) */
  useEffect(() => {
    if (status === "error" && error) {
      toast.error(error.message, {
        action:
          error.code === "RATE_LIMIT"
            ? { label: "재시도", onClick: () => handleSubmit() }
            : undefined,
      });
    }
    if (status === "cancelled") {
      toast.info("생성이 취소되었습니다.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, error]);

  function handleSubmit() {
    if (!topic.trim()) {
      setTopicError("주제를 입력해주세요.");
      return;
    }
    setTopicError("");

    generate(
      {
        topic: topic.trim(),
        keywords,
        direction: direction.trim(),
        guidelineId,
      },
      (id) => {
        toast.success("초안 생성이 완료되었습니다.");
        router.push(`/generate/${id}`);
      }
    );
  }

  const isStreaming = status === "streaming";
  const showPreview = isStreaming && streamText;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">콘텐츠 생성</h1>
        <p className="text-sm text-muted-foreground mt-1">
          주제를 입력하면 AI가 SEO 최적화된 블로그 초안을 작성합니다.
        </p>
      </div>

      <div className="space-y-5">
        {/* 주제 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="topic">
              주제 <span className="text-destructive">*</span>
            </Label>
            <span
              className={`text-xs ${topic.length > 280 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {topic.length}/300
            </span>
          </div>
          <Textarea
            id="topic"
            placeholder="예: Next.js로 SaaS 만든 후기 — 3개월의 기록"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value.slice(0, 300));
              if (topicError) setTopicError("");
            }}
            disabled={isStreaming}
            className="min-h-[80px] resize-none"
          />
          {topicError && (
            <p className="text-xs text-destructive">{topicError}</p>
          )}
        </div>

        {/* 키워드 */}
        <div className="space-y-1.5">
          <Label>키워드 (선택, 최대 5개)</Label>
          <KeywordInput
            keywords={keywords}
            onChange={setKeywords}
          />
        </div>

        {/* 글 방향 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="direction">글 방향 (선택)</Label>
            <span
              className={`text-xs ${direction.length > 180 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {direction.length}/200
            </span>
          </div>
          <Textarea
            id="direction"
            placeholder="예: 실패 경험을 솔직하게 공유하고, 독자에게 실용적인 교훈을 전달"
            value={direction}
            onChange={(e) => setDirection(e.target.value.slice(0, 200))}
            disabled={isStreaming}
            className="min-h-[60px] resize-none"
          />
        </div>

        {/* 지침 선택 */}
        <div className="space-y-1.5">
          <Label>AI 지침 (선택)</Label>
          <Select
            value={guidelineId ?? "none"}
            onValueChange={(v) => setGuidelineId(v === "none" ? null : v)}
            disabled={isStreaming}
          >
            <SelectTrigger>
              <SelectValue placeholder="지침 선택..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                기본 SEO 지침 (지침 없음)
              </SelectItem>
              {guidelines?.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="flex items-center gap-2">
                    {g.title}
                    {g.is_default && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        기본
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isStreaming}
            className="gap-2 relative overflow-hidden"
            size="lg"
          >
            {isStreaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI가 초안을 작성하고 있습니다...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                AI 초안 생성
              </>
            )}
          </Button>

          <AnimatePresence>
            {isStreaming && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={cancel}
                >
                  취소
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {(status === "error" || status === "cancelled") && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={reset}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              초기화
            </Button>
          )}
        </div>

        {/* 에러 인라인 표시 */}
        {status === "error" && error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error.message}</span>
          </div>
        )}
      </div>

      {/* 스트리밍 미리보기 */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <StreamingPreview text={streamText} streamRef={streamRef} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
