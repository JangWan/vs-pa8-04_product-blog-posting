"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronRight,
  Copy,
  Languages,
  History as HistoryIcon,
  Pencil,
  Trash2,
} from "lucide-react";
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
import { MarkdownView } from "@/components/layout/markdown-view";
import {
  useDeleteHistory,
  useHistoryDetail,
} from "@/features/history/hooks/use-history";

const LANG_LABEL: Record<"ko" | "en", string> = {
  ko: "한국어",
  en: "English",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data, isLoading, isError, error } = useHistoryDetail(id);
  const deleteMutation = useDeleteHistory();

  const sourceLang: "ko" | "en" = data?.source_lang ?? "ko";
  const otherLang: "ko" | "en" = sourceLang === "ko" ? "en" : "ko";

  const [activeTab, setActiveTab] = useState<"source" | "other">("source");
  const [pendingDelete, setPendingDelete] = useState(false);

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.body);
      toast.success("클립보드에 복사되었습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }

  function handleDelete() {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success("이력이 삭제되었습니다.");
        router.push("/history");
      },
      onError: (err) => toast.error(err.message),
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
        <span className="text-foreground truncate">
          {data?.topic ?? "이력 상세"}
        </span>
      </nav>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error?.message ?? "이력을 불러오지 못했습니다."}</span>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push("/history")}>
            이력 목록으로
          </Button>
        </div>
      ) : (
        <>
          {/* 헤더 */}
          <header className="border-b border-border pb-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                  {data.topic}
                </h1>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>{formatDate(data.created_at)}</span>
                  <span>·</span>
                  <span>{data.guideline_title ?? "삭제된 지침"}</span>
                  <Badge variant="outline" className="ml-1">
                    원문 {LANG_LABEL[sourceLang]}
                  </Badge>
                </div>
              </div>

              {/* 우상단 액션 5개 (UC-15 §3 step 5) */}
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/generate/${id}`)}
                  className="gap-1 h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">편집</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1 h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">복사</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toast.info("번역 기능은 곧 제공될 예정입니다 (UC-20).")}
                  className="gap-1 h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <Languages className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">번역</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/history/${id}/versions`)}
                  className="gap-1 h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <HistoryIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">버전 이력</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDelete(true)}
                  className="gap-1 h-8 px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">삭제</span>
                </Button>
              </div>
            </div>
          </header>

          {/* 탭 (원문 + 번역 placeholder) */}
          <div className="border-b border-border">
            <div className="flex gap-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "source"}
                onClick={() => setActiveTab("source")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  activeTab === "source"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                원문 ({LANG_LABEL[sourceLang]})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "other"}
                onClick={() => setActiveTab("other")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  activeTab === "other"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {LANG_LABEL[otherLang]}
              </button>
            </div>
          </div>

          {/* 본문 */}
          {activeTab === "source" ? (
            <div className="max-w-4xl">
              <MarkdownView source={data.body} />
            </div>
          ) : (
            <div className="border border-border rounded-lg p-10 flex flex-col items-center text-center space-y-3">
              <Languages className="h-9 w-9 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {LANG_LABEL[otherLang]} 번역본이 없습니다.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toast.info("번역 기능은 곧 제공될 예정입니다 (UC-20).")}
              >
                <Languages className="h-3.5 w-3.5 mr-1" />
                번역하기
              </Button>
            </div>
          )}
        </>
      )}

      {/* 삭제 확인 AlertDialog (UC-15 §4-1, BR-24) */}
      <AlertDialog
        open={pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이력을 삭제하면 모든 버전과 번역본도 함께 영구 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
