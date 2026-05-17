"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Languages, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MarkdownView } from "@/components/layout/markdown-view";
import {
  useTranslationStream,
  type TargetLang,
} from "@/features/translations/hooks/use-translations";

const LANG_LABEL: Record<TargetLang, string> = {
  ko: "한국어",
  en: "English",
};
const QUOTA_KEY = "translation_quota_notice_seen";

type Props = {
  open: boolean;
  contentId: string;
  sourceLang: TargetLang;
  sourceBody: string;
  /* 미리 선택된 target_lang (UC §4-3 — 탭에서 진입 시) */
  initialTargetLang?: TargetLang;
  onOpenChange: (open: boolean) => void;
};

export function TranslationModal({
  open,
  contentId,
  sourceLang,
  sourceBody,
  initialTargetLang,
  onOpenChange,
}: Props) {
  const allLangs: TargetLang[] = ["ko", "en"];
  const otherLangs = allLangs.filter((l) => l !== sourceLang);

  const initial =
    initialTargetLang && initialTargetLang !== sourceLang
      ? initialTargetLang
      : otherLangs[0];

  const [targetLang, setTargetLang] = useState<TargetLang>(initial);
  const [quotaNoticeOpen, setQuotaNoticeOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  const { status, streamText, error, start, cancel, reset } =
    useTranslationStream(contentId);

  /* 모달 열릴 때 상태 초기화, initial target 갱신 */
  useEffect(() => {
    if (open) {
      reset();
      setTargetLang(initial);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);

  /* status='done' 시 3초 후 자동 닫힘 (UC-20 step 10) */
  useEffect(() => {
    if (status === "done") {
      toast.success(`${LANG_LABEL[targetLang]} 번역이 완료되었습니다.`);
      const timer = setTimeout(() => onOpenChange(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [status, targetLang, onOpenChange]);

  /* status='conflict' 감지 시 덮어쓰기 다이얼로그 오픈 */
  useEffect(() => {
    if (status === "conflict") setOverwriteOpen(true);
  }, [status]);

  function triggerStart(force = false) {
    /* BR-21 quota 안내 1회 노출 */
    if (!force) {
      const seen = typeof window !== "undefined"
        ? window.localStorage.getItem(QUOTA_KEY)
        : "true";
      if (seen !== "true") {
        setQuotaNoticeOpen(true);
        return;
      }
    }
    void start({ target_lang: targetLang, force });
  }

  function handleQuotaConfirm() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(QUOTA_KEY, "true");
    }
    setQuotaNoticeOpen(false);
    void start({ target_lang: targetLang, force: false });
  }

  function handleOverwriteConfirm() {
    setOverwriteOpen(false);
    reset();
    void start({ target_lang: targetLang, force: true });
  }

  const isStreaming = status === "streaming";
  const isDone = status === "done";
  const isError = status === "error";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && isStreaming) {
            cancel();
          }
          onOpenChange(next);
        }}
      >
        <DialogContent
          className="sm:max-w-4xl max-h-[85vh] p-0 overflow-hidden grid grid-rows-[auto_1fr_auto]"
          showCloseButton={false}
        >
          {/* 헤더 */}
          <DialogHeader className="flex flex-row items-center justify-between gap-3 p-4 border-b border-border">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-medium">
                <Languages className="h-4 w-4" />
                번역
              </DialogTitle>
              <Badge variant="outline" className="shrink-0">
                원문 {LANG_LABEL[sourceLang]}
              </Badge>
              <span className="text-muted-foreground text-xs">→</span>
              <Select
                value={targetLang}
                onValueChange={(v) => setTargetLang(v as TargetLang)}
                disabled={isStreaming}
              >
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allLangs.map((l) => (
                    <SelectItem
                      key={l}
                      value={l}
                      disabled={l === sourceLang}
                      /* BR-22: 원문 언어는 비활성 */
                    >
                      {LANG_LABEL[l]}
                      {l === sourceLang && " (원문)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogDescription className="sr-only">
              원문 콘텐츠를 선택한 언어로 번역합니다.
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (isStreaming) cancel();
                onOpenChange(false);
              }}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">닫기</span>
            </Button>
          </DialogHeader>

          {/* 좌(원문) / 우(번역) */}
          <div className="grid grid-cols-2 divide-x divide-border overflow-hidden min-h-0">
            <section className="overflow-y-auto p-4">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                원문 ({LANG_LABEL[sourceLang]})
              </h4>
              <MarkdownView source={sourceBody} />
            </section>

            <section className="overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-muted-foreground">
                  번역 결과 ({LANG_LABEL[targetLang]})
                </h4>
                {isStreaming && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    번역 중...
                  </span>
                )}
              </div>

              {status === "idle" && (
                <p className="text-sm text-muted-foreground">
                  번역 언어를 선택하고 [번역 시작]을 눌러주세요.
                </p>
              )}

              {(isStreaming || isDone) && (
                <div
                  className={cn(
                    "transition-opacity",
                    isStreaming && "opacity-90",
                  )}
                >
                  <MarkdownView source={streamText} />
                </div>
              )}

              {isError && error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-2">
                  <p className="font-medium">번역에 실패했습니다.</p>
                  <p className="text-xs">{error.message}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      reset();
                      triggerStart(true);
                    }}
                  >
                    다시 번역
                  </Button>
                </div>
              )}
            </section>
          </div>

          {/* 푸터 */}
          <div className="flex items-center justify-end gap-2 p-3 border-t border-border bg-muted/30">
            {isStreaming ? (
              <Button
                type="button"
                variant="outline"
                onClick={cancel}
                className="text-destructive"
              >
                중단
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isStreaming}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={() => triggerStart(false)}
                  disabled={isDone}
                >
                  {isDone ? "완료" : "번역 시작"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* quota 안내 모달 (BR-21, UC §4-2) — AlertDialog 아닌 단순 Dialog */}
      <Dialog open={quotaNoticeOpen} onOpenChange={setQuotaNoticeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>잠시만요</DialogTitle>
            <DialogDescription>
              번역도 AI 생성 횟수에 포함됩니다. 무료 티어 한도가 빠르게
              소진될 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleQuotaConfirm}>
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 덮어쓰기 확인 AlertDialog (UC-21, BR-23) */}
      <AlertDialog
        open={overwriteOpen}
        onOpenChange={(next) => {
          if (!next) {
            setOverwriteOpen(false);
            reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 번역본을 덮어쓸까요?</AlertDialogTitle>
            <AlertDialogDescription>
              현재 {LANG_LABEL[targetLang]} 번역본이 새 번역으로 교체됩니다.
              되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleOverwriteConfirm();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              덮어쓰기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
