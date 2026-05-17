"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronRight,
  Eye,
  GitCompare,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { cn } from "@/lib/utils";
import { MarkdownView } from "@/components/layout/markdown-view";
import { useHistoryDetail } from "@/features/history/hooks/use-history";
import {
  useCreateSnapshot,
  useRestoreVersion,
  useVersionDetail,
  useVersionsInfinite,
  type VersionListItem,
} from "@/features/content-versions/hooks/use-versions";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDiff(diff: number | null) {
  if (diff === null) return "—";
  if (diff === 0) return "±0";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff}`;
}

function VersionCardSkeleton() {
  return (
    <div className="border border-border rounded-lg p-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/3 mt-2" />
    </div>
  );
}

function EmptyVersions({ onCreate, isCreating }: { onCreate: () => void; isCreating: boolean }) {
  return (
    <div className="border border-border rounded-lg p-12 flex flex-col items-center text-center space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">
          아직 저장된 버전이 없습니다
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          본문을 편집·저장하면 직전 본문이 자동으로 버전으로 쌓입니다.
        </p>
      </div>
      <Button type="button" onClick={onCreate} disabled={isCreating} className="gap-1.5">
        <Plus className="h-4 w-4" />
        {isCreating ? "저장 중..." : "지금 버전으로 저장하기"}
      </Button>
    </div>
  );
}

export default function VersionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: detail } = useHistoryDetail(id);
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useVersionsInfinite(id, 30);

  const createSnapshot = useCreateSnapshot(id);
  const restore = useRestoreVersion(id);

  /* 미리보기 Drawer 상태 */
  const [previewNo, setPreviewNo] = useState<number | null>(null);
  const { data: previewVersion, isLoading: previewLoading } = useVersionDetail(
    id,
    previewNo ?? undefined,
  );

  /* 복원 확인 다이얼로그 */
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);

  /* 비교 선택 — 최대 2개 */
  const [compareSelection, setCompareSelection] = useState<number[]>([]);
  function toggleCompare(no: number) {
    setCompareSelection((prev) => {
      if (prev.includes(no)) return prev.filter((n) => n !== no);
      if (prev.length >= 2) {
        toast.info("비교는 최대 2개까지 선택할 수 있습니다.");
        return prev;
      }
      return [...prev, no];
    });
  }

  /* 무한스크롤 */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const versions: VersionListItem[] = data?.pages.flatMap((p) => p.data) ?? [];
  const isEmpty = !isLoading && !isError && versions.length === 0;

  function handleCreateSnapshot() {
    createSnapshot.mutate(undefined, {
      onSuccess: () => toast.success("버전이 저장되었습니다."),
      onError: (err) => {
        const status = (err as Error & { status?: number }).status;
        if (status === 409) toast.warning(err.message);
        else toast.error(err.message);
      },
    });
  }

  function handleRestoreConfirm() {
    if (restoreTarget === null) return;
    const targetNo = restoreTarget;
    restore.mutate(targetNo, {
      onSuccess: (res) => {
        toast.success(
          `버전 v${res.restored_from_version_no}으로 복원되었습니다. 직전 본문은 새 버전으로 저장되었습니다.`,
        );
        setRestoreTarget(null);
        setPreviewNo(null);
      },
      onError: (err) => {
        const status = (err as Error & { status?: number }).status;
        if (status === 409) toast.warning(err.message);
        else toast.error(err.message);
        setRestoreTarget(null);
      },
    });
  }

  function handleGotoCompare() {
    if (compareSelection.length !== 2) {
      toast.info("비교할 버전 1개를 더 선택해주세요.");
      return;
    }
    const [a, b] = compareSelection;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    router.push(`/history/${id}/versions/compare?from=${from}&to=${to}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6 pb-24"
    >
      {/* Breadcrumb */}
      <nav className="flex items-center text-xs text-muted-foreground gap-1 min-w-0">
        <Link href="/history" className="hover:text-foreground transition-colors shrink-0">
          생성 이력
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link
          href={`/history/${id}`}
          className="hover:text-foreground transition-colors truncate"
        >
          {detail?.topic ?? "이력 상세"}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground shrink-0">버전 이력</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            버전 이력
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            저장된 버전을 미리 보고 복원하거나 두 버전을 비교할 수 있습니다.
          </p>
        </div>
        {!isEmpty && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreateSnapshot}
            disabled={createSnapshot.isPending}
            className="gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            {createSnapshot.isPending ? "저장 중..." : "현재 본문 저장"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <VersionCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>버전 목록을 불러오지 못했습니다.</span>
        </div>
      ) : isEmpty ? (
        <EmptyVersions
          onCreate={handleCreateSnapshot}
          isCreating={createSnapshot.isPending}
        />
      ) : (
        <>
          <div className="space-y-3">
            {versions.map((v) => {
              const selected = compareSelection.includes(v.version_no);
              return (
                <article
                  key={v.version_no}
                  className={cn(
                    "border rounded-lg p-4 bg-background flex items-center justify-between gap-4 transition-colors",
                    selected
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border",
                  )}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <Badge variant="outline" className="shrink-0">
                      v{v.version_no}
                    </Badge>
                    {v.is_current && (
                      <Badge className="bg-primary text-primary-foreground shrink-0">
                        현재
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{formatDateTime(v.created_at)}</span>
                      <span>·</span>
                      <span>{v.char_count.toLocaleString()}자</span>
                      <span>·</span>
                      <span
                        className={cn(
                          v.char_diff === null
                            ? "text-muted-foreground"
                            : v.char_diff > 0
                              ? "text-primary"
                              : v.char_diff < 0
                                ? "text-destructive"
                                : "text-muted-foreground",
                        )}
                      >
                        {formatDiff(v.char_diff)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewNo(v.version_no)}
                      className="gap-1 h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">미리보기</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRestoreTarget(v.version_no)}
                      disabled={v.is_current}
                      className="gap-1 h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">복원</span>
                    </Button>
                    <Button
                      type="button"
                      variant={selected ? "default" : "ghost"}
                      size="sm"
                      onClick={() => toggleCompare(v.version_no)}
                      className={cn(
                        "gap-1 h-8 px-2",
                        !selected && "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {selected ? "선택됨" : "비교"}
                      </span>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          <div ref={sentinelRef} className="h-8" />

          {isFetchingNextPage && (
            <div className="space-y-3">
              <VersionCardSkeleton />
              <VersionCardSkeleton />
            </div>
          )}
        </>
      )}

      {/* 비교 floating bar (UC-19 진입) */}
      {compareSelection.length > 0 && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-primary/95 backdrop-blur-sm text-primary-foreground rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-3">
            <span className="text-sm">
              {compareSelection
                .slice()
                .sort((a, b) => a - b)
                .map((n) => `v${n}`)
                .join(" ↔ ")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCompareSelection([])}
              className="h-7 px-2 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              선택 해제
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGotoCompare}
              disabled={compareSelection.length !== 2}
              className="h-7 px-3"
            >
              비교하기
            </Button>
          </div>
        </motion.div>
      )}

      {/* 미리보기 Drawer (UC-16 step 5~6) */}
      <Sheet
        open={previewNo !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewNo(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto p-6">
          <SheetHeader className="space-y-1 p-0 mb-4">
            <SheetTitle>
              v{previewNo ?? ""} 미리보기
            </SheetTitle>
            <SheetDescription>
              {previewVersion ? formatDateTime(previewVersion.created_at) : ""}
            </SheetDescription>
          </SheetHeader>

          {previewLoading || !previewVersion ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <MarkdownView source={previewVersion.snapshot_body} />
          )}

          {previewVersion && (
            <div className="mt-6 flex items-center gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => setRestoreTarget(previewVersion.version_no)}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                이 버전으로 복원
              </Button>
              <Button type="button" variant="outline" onClick={() => setPreviewNo(null)}>
                닫기
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 복원 확인 AlertDialog (UC-18, BR-19 안내 포함) */}
      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open && !restore.isPending) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              정말 v{restoreTarget}으로 복원하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              현재 본문은 새 버전으로 자동 저장됩니다. 복원 후에도 직전 상태로
              다시 되돌릴 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRestoreConfirm();
              }}
              disabled={restore.isPending}
            >
              {restore.isPending ? "복원 중..." : "복원"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
