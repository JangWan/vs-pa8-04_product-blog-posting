"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BookOpen,
  Pencil,
  Plus,
  Star,
  Trash2,
  AlertCircle,
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
import {
  useGuidelines,
  useDeleteGuideline,
  useSetDefaultGuideline,
  type GuidelineItem,
} from "@/features/guidelines/hooks/use-guidelines";
import { PageShell } from "@/components/layout/page-shell";

/* ── Framer Motion variants (stagger 등장) ── */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: "easeOut" as const },
  },
};

/* ── 카드 스켈레톤 ── */
function GuidelineCardSkeleton() {
  return (
    <div className="border border-border rounded-lg p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

/* ── Empty State (UC §4-2) ── */
function EmptyGuidelines() {
  return (
    <div className="border border-border rounded-lg p-12 flex flex-col items-center text-center space-y-4">
      <BookOpen className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">
          첫 번째 AI 지침을 등록해보세요
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          브랜드 톤과 문체를 지침으로 등록하면 AI가 항상 일관된 스타일로
          글을 씁니다.
        </p>
      </div>
      <Link
        href="/guidelines/new"
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        지침 등록하기
      </Link>
    </div>
  );
}

/* ── 지침 카드 ── */
function GuidelineCard({
  item,
  onRequestDelete,
  onSetDefault,
}: {
  item: GuidelineItem;
  onRequestDelete: (item: GuidelineItem) => void;
  onSetDefault: (item: GuidelineItem) => void;
}) {
  const router = useRouter();

  function handleSetDefaultClick() {
    if (item.is_default) {
      toast.info("이미 기본 지침으로 설정되어 있습니다.");
      return;
    }
    onSetDefault(item);
  }

  return (
    <motion.article
      variants={cardVariants}
      className="border border-border rounded-lg p-5 bg-background hover:shadow-notion-card transition-shadow space-y-3"
    >
      {/* 상단: 제목 + 기본 Badge + 액션 버튼 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate">
            {item.title}
          </h3>
          {item.is_default && (
            <Badge className="bg-primary text-primary-foreground shrink-0">
              기본
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/guidelines/${item.id}`)}
            className="gap-1 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">수정</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRequestDelete(item)}
            className="gap-1 h-8 px-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">삭제</span>
          </Button>
        </div>
      </div>

      {/* 본문 미리보기 (최대 2줄) */}
      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
        {item.content}
      </p>

      {/* 하단: 기본으로 설정 토글 */}
      <div className="pt-1 flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={item.is_default}
          onClick={handleSetDefaultClick}
          className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-primary disabled:opacity-100 disabled:text-primary"
        >
          <Star
            className={`h-3.5 w-3.5 ${item.is_default ? "fill-primary text-primary" : ""}`}
          />
          {item.is_default ? "기본 지침" : "기본으로 설정"}
        </Button>
      </div>
    </motion.article>
  );
}

/* ── 메인 페이지 ── */
export default function GuidelinesPage() {
  const { data, isLoading, isError } = useGuidelines();
  const deleteMutation = useDeleteGuideline();
  const setDefaultMutation = useSetDefaultGuideline();

  const [pendingDelete, setPendingDelete] = useState<GuidelineItem | null>(null);

  const items = data ?? [];
  const isEmpty = !isLoading && !isError && items.length === 0;

  function handleDeleteConfirm() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        toast.success("지침이 삭제되었습니다.");
        setPendingDelete(null);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  }

  function handleSetDefault(item: GuidelineItem) {
    setDefaultMutation.mutate(item.id, {
      onSuccess: () => {
        toast.success("기본 지침으로 설정되었습니다.");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  }

  return (
    <PageShell
      title="AI 지침 관리"
      description="브랜드 톤·문체 지침을 등록하면 AI가 일관된 스타일로 글을 씁니다."
      actions={
        !isEmpty ? (
          <Link
            href="/guidelines/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors shrink-0"
            aria-label="새 지침 추가"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">새 지침</span>
          </Link>
        ) : undefined
      }
    >

      {/* 본문 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <GuidelineCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>지침을 불러오지 못했습니다. 새로고침 해주세요.</span>
        </div>
      ) : isEmpty ? (
        <EmptyGuidelines />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {items.map((item) => (
            <GuidelineCard
              key={item.id}
              item={item}
              onRequestDelete={setPendingDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </motion.div>
      )}

      {/* 삭제 확인 AlertDialog (UC-13) */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 지침을 삭제하면 해당 지침으로 생성된 이력에서 지침명이
              {" "}<span className="font-medium">&apos;삭제된 지침&apos;</span>
              으로 표시됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
