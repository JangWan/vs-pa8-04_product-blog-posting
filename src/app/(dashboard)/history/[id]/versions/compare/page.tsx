"use client";

import { use, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertCircle, ChevronRight, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useHistoryDetail } from "@/features/history/hooks/use-history";
import {
  useRestoreVersion,
  useVersionDiff,
} from "@/features/content-versions/hooks/use-versions";

/* react-diff-viewer-continued는 브라우저 전용으로 사용 (SSR 비활성) */
const ReactDiffViewer = dynamic(() => import("react-diff-viewer-continued"), {
  ssr: false,
  loading: () => (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  ),
});

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function VersionCompareePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = use(params);
  const { from: fromRaw, to: toRaw } = use(searchParams);
  const router = useRouter();

  const from = fromRaw ? parseInt(fromRaw) : NaN;
  const to = toRaw ? parseInt(toRaw) : NaN;
  const isValidParams =
    !Number.isNaN(from) && !Number.isNaN(to) && from !== to;

  const { data: detail } = useHistoryDetail(id);
  const { data, isLoading, isError } = useVersionDiff(
    id,
    isValidParams ? from : undefined,
    isValidParams ? to : undefined,
  );

  const restore = useRestoreVersion(id);

  const [splitView, setSplitView] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);

  function handleRestoreConfirm() {
    if (restoreTarget === null) return;
    const targetNo = restoreTarget;
    restore.mutate(targetNo, {
      onSuccess: (res) => {
        toast.success(
          `버전 v${res.restored_from_version_no}으로 복원되었습니다. 직전 본문은 새 버전으로 저장되었습니다.`,
        );
        setRestoreTarget(null);
        router.push(`/history/${id}/versions`);
      },
      onError: (err) => {
        const status = (err as Error & { status?: number }).status;
        if (status === 409) toast.warning(err.message);
        else toast.error(err.message);
        setRestoreTarget(null);
      },
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
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
        <Link
          href={`/history/${id}/versions`}
          className="hover:text-foreground transition-colors shrink-0"
        >
          버전 이력
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground shrink-0">
          비교 (v{isValidParams ? from : "?"} ↔ v{isValidParams ? to : "?"})
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            버전 비교
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            두 버전의 본문·SEO 메타 차이를 확인하고 원하는 버전으로 복원할 수 있습니다.
          </p>
        </div>

        {/* Split / Unified 토글 */}
        <div className="inline-flex rounded-md border border-border p-0.5 bg-background shrink-0">
          <button
            type="button"
            onClick={() => setSplitView(true)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-colors",
              splitView
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Split
          </button>
          <button
            type="button"
            onClick={() => setSplitView(false)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-colors",
              !splitView
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Unified
          </button>
        </div>
      </div>

      {!isValidParams ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>비교할 두 버전을 모두 선택해주세요.</span>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>비교 데이터를 불러오지 못했습니다.</span>
        </div>
      ) : (
        <>
          {/* 비교 헤더 */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="outline">v{data.from.version_no}</Badge>
              <span>{formatDateTime(data.from.created_at)}</span>
            </div>
            <span>↔</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">v{data.to.version_no}</Badge>
              <span>{formatDateTime(data.to.created_at)}</span>
            </div>
          </div>

          {/* SEO 메타 비교 */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["from", "to"] as const).map((side) => {
              const meta = data[side].seo_meta;
              return (
                <div
                  key={side}
                  className="border border-border rounded-lg p-4 space-y-2.5"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">v{data[side].version_no}</Badge>
                    <span>SEO 메타</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Title</p>
                      <p className="text-foreground">{meta.title}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="text-foreground line-clamp-3">{meta.description}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Keywords</p>
                      <div className="flex flex-wrap gap-1">
                        {meta.keywords?.map((k) => (
                          <Badge key={k} variant="secondary" className="text-xs">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Diff Viewer */}
          <div className="border border-border rounded-lg overflow-hidden">
            <ReactDiffViewer
              oldValue={data.from.body}
              newValue={data.to.body}
              splitView={splitView}
              leftTitle={`v${data.from.version_no}`}
              rightTitle={`v${data.to.version_no}`}
            />
          </div>

          {/* 액션 */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoreTarget(data.from.version_no)}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              v{data.from.version_no}으로 복원
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoreTarget(data.to.version_no)}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              v{data.to.version_no}으로 복원
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(`/history/${id}/versions`)}
            >
              목록으로
            </Button>
          </div>
        </>
      )}

      {/* 복원 확인 AlertDialog */}
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
