"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { History as HistoryIcon, Pencil, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import {
  useHistoryInfinite,
  type HistoryListItem,
} from "@/features/history/hooks/use-history";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: "easeOut" as const },
  },
};

function HistoryCardSkeleton() {
  return (
    <div className="border border-border rounded-lg p-5 space-y-2.5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="border border-border rounded-lg p-12 flex flex-col items-center text-center space-y-4">
      <HistoryIcon className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">
          아직 생성한 콘텐츠가 없습니다
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          첫 번째 블로그 초안을 AI로 생성해보세요.
        </p>
      </div>
      <Link
        href="/generate"
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors"
      >
        <Pencil className="h-4 w-4" />
        생성 시작
      </Link>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function HistoryCard({ item }: { item: HistoryListItem }) {
  return (
    <motion.div variants={cardVariants}>
      <Link
        href={`/history/${item.id}`}
        className="block border border-border rounded-lg p-5 bg-background hover:shadow-notion-card transition-shadow space-y-1.5"
      >
        <h3 className="text-base font-semibold text-foreground line-clamp-1">
          {item.topic}
        </h3>
        <p className="text-xs text-muted-foreground">
          {formatDate(item.created_at)}
          {" · "}
          {item.guideline_title ?? "삭제된 지침"}
        </p>
      </Link>
    </motion.div>
  );
}

export default function HistoryPage() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useHistoryInfinite(20);

  /* 무한스크롤 — sentinel을 IntersectionObserver로 감시 */
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

  const items = data?.pages.flatMap((p) => p.data) ?? [];
  const isEmpty = !isLoading && !isError && items.length === 0;

  return (
    <PageShell
      title="생성 이력"
      description="지금까지 생성한 콘텐츠를 모두 모아 보고 다시 편집·복원할 수 있습니다."
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <HistoryCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>이력을 불러오지 못했습니다. 새로고침 해주세요.</span>
        </div>
      ) : isEmpty ? (
        <EmptyHistory />
      ) : (
        <>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {items.map((item) => (
              <HistoryCard key={item.id} item={item} />
            ))}
          </motion.div>

          <div ref={sentinelRef} className="h-10" />

          {isFetchingNextPage && (
            <div className="space-y-3">
              <HistoryCardSkeleton />
              <HistoryCardSkeleton />
            </div>
          )}

          {!hasNextPage && items.length >= 20 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              마지막 항목입니다.
            </p>
          )}

          {/* IO 미지원·접근성 대비 수동 로드 버튼 */}
          {hasNextPage && !isFetchingNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fetchNextPage()}
                className="text-xs"
              >
                더 보기
              </Button>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
