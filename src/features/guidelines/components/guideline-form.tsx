"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TITLE_MAX = 100;
const CONTENT_MAX = 2000;

export type GuidelineFormValues = {
  title: string;
  content: string;
};

type Props = {
  initialValues?: GuidelineFormValues;
  isSubmitting: boolean;
  submitLabel?: string;
  onSubmit: (values: GuidelineFormValues) => void;
};

/**
 * 지침 생성·수정 공통 폼
 * — 제목 100자 + 내용 2000자 제한, 글자 카운터, 클라이언트 유효성 검사
 * — 서버 측 Zod 재검증과 일치하도록 길이 제한을 동일하게 적용
 */
export function GuidelineForm({
  initialValues,
  isSubmitting,
  submitLabel = "저장",
  onSubmit,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [titleError, setTitleError] = useState("");
  const [contentError, setContentError] = useState("");

  const titleOver = title.length > TITLE_MAX;
  const contentOver = content.length > CONTENT_MAX;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    /* 유효성 검사 (UC §5-1·5-2) */
    let valid = true;
    if (!title.trim()) {
      setTitleError("지침 제목을 입력해주세요.");
      valid = false;
    }
    if (!content.trim()) {
      setContentError("지침 내용을 입력해주세요.");
      valid = false;
    }
    if (titleOver) {
      setTitleError(`지침 제목은 ${TITLE_MAX}자 이내로 입력해주세요.`);
      valid = false;
    }
    if (contentOver) {
      setContentError(`내용은 ${CONTENT_MAX}자 이내로 입력해주세요.`);
      valid = false;
    }
    if (!valid) return;

    onSubmit({ title: title.trim(), content: content.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 제목 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="title">
            제목 <span className="text-destructive">*</span>
          </Label>
          <span
            className={`text-xs ${titleOver ? "text-destructive" : "text-muted-foreground"}`}
          >
            {title.length}/{TITLE_MAX}
          </span>
        </div>
        <Input
          id="title"
          placeholder="예: 친근하고 솔직한 인디해커 톤"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError) setTitleError("");
          }}
          disabled={isSubmitting}
          aria-invalid={titleError ? "true" : undefined}
        />
        {titleError && (
          <p className="text-xs text-destructive">{titleError}</p>
        )}
      </div>

      {/* 내용 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">
            내용 <span className="text-destructive">*</span>
          </Label>
          <span
            className={`text-xs ${contentOver ? "text-destructive" : "text-muted-foreground"}`}
          >
            {content.length}/{CONTENT_MAX}
          </span>
        </div>
        <Textarea
          id="content"
          placeholder="브랜드 톤·문체·금지 표현·글쓰기 규칙을 자유롭게 작성하세요."
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (contentError) setContentError("");
          }}
          disabled={isSubmitting}
          className="min-h-[240px] resize-y"
          aria-invalid={contentError ? "true" : undefined}
        />
        {contentError && (
          <p className="text-xs text-destructive">{contentError}</p>
        )}
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "저장 중..." : submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => router.push("/guidelines")}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
