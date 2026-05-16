"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Pencil,
  BookOpen,
  FileText,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useRecentHistory, type RecentHistoryItem } from "@/features/history/hooks/use-recent-history";
import { useGuidelines, type GuidelineItem } from "@/features/guidelines/hooks/use-guidelines";

/* ── 애니메이션 variants ── */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" as const } },
};

/* ── 스켈레톤 ── */
function ContentCardSkeleton() {
  return (
    <div className="border border-border rounded-lg p-4 space-y-2.5">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3.5 w-1/2" />
      <Skeleton className="h-5 w-20 rounded-full" />
    </div>
  );
}

function GuidelinesSkeletonSection() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/* ── 최근 생성 콘텐츠 카드 ── */
function ContentCard({ item }: { item: RecentHistoryItem }) {
  const router = useRouter();
  const formattedDate = format(new Date(item.created_at), "yyyy.MM.dd", {
    locale: ko,
  });

  return (
    <motion.button
      variants={itemVariants}
      type="button"
      onClick={() => router.push(`/generate/${item.id}`)}
      className="w-full text-left border border-border rounded-lg p-4 bg-background hover:shadow-notion-card transition-shadow space-y-2 group"
    >
      {/* 제목 (최대 2줄 말줄임) */}
      <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
        {item.topic}
      </p>
      {/* 날짜 */}
      <p className="text-xs text-muted-foreground">{formattedDate}</p>
      {/* 지침명 Badge */}
      <Badge variant="secondary" className="text-xs">
        {item.guideline_title ?? "삭제된 지침"}
      </Badge>
    </motion.button>
  );
}

/* ── Empty State: 콘텐츠 없음 ── */
function EmptyContents() {
  return (
    <div className="border border-border rounded-lg p-8 flex flex-col items-center text-center space-y-3">
      <FileText className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        아직 생성한 콘텐츠가 없습니다
      </p>
      <Link
        href="/generate"
        className="text-sm text-primary hover:underline font-medium"
      >
        첫 콘텐츠 생성하기 →
      </Link>
    </div>
  );
}

/* ── Empty State: 지침 없음 (강조 배너) ── */
function EmptyGuidelinesBanner() {
  return (
    <div className="border border-primary/30 bg-primary/5 rounded-lg p-5 flex flex-col items-center text-center space-y-3">
      <BookOpen className="h-8 w-8 text-primary" />
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          먼저 AI 지침을 등록해보세요
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          AI가 일관된 브랜드 톤으로 글을 쓸 수 있도록 지침을 등록해주세요.
        </p>
      </div>
      <Link
        href="/guidelines/new"
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors"
      >
        지침 등록하기
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/* ── 지침 현황 섹션 ── */
function GuidelinesStatus({ items }: { items: GuidelineItem[] }) {
  const defaultGuideline = items.find((g) => g.is_default);

  return (
    <div className="space-y-2.5 text-sm">
      <p className="text-foreground">
        <span className="font-semibold text-primary">{items.length}개</span>
        의 지침이 등록되어 있습니다
      </p>
      {defaultGuideline ? (
        <p className="text-muted-foreground">
          기본 지침:{" "}
          <span className="text-foreground font-medium">
            {defaultGuideline.title}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">
          기본 지침이 설정되지 않았습니다.{" "}
          <Link href="/guidelines" className="text-primary hover:underline">
            지침 관리 →
          </Link>
        </p>
      )}
    </div>
  );
}

/* ── API 에러 알림 ── */
function ApiErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-xs text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function DashboardPage() {
  const { user } = useUser();
  const {
    data: historyData,
    isLoading: historyLoading,
    isError: historyError,
  } = useRecentHistory(5);
  const {
    data: guidelinesData,
    isLoading: guidelinesLoading,
    isError: guidelinesError,
  } = useGuidelines();

  const displayName = user?.firstName || "사용자";
  const recentItems = historyData?.data ?? [];
  const guidelines = guidelinesData ?? [];
  const isEmptyState = !guidelinesLoading && !guidelinesError && guidelines.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          안녕하세요, {displayName}님
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          오늘도 IndiePost AI로 콘텐츠를 작성해보세요.
        </p>
      </div>

      {/* ── 빠른 시작 CTA ── */}
      <Link
        href="/generate"
        className="flex items-center justify-between w-full px-5 py-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <Pencil className="h-5 w-5" />
          <div>
            <p className="font-semibold text-sm">새 콘텐츠 생성</p>
            <p className="text-xs text-primary-foreground/80 mt-0.5">
              주제를 입력하면 AI가 SEO 최적화된 초안을 작성합니다
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
      </Link>

      {/* ── 지침 0개 신규 사용자 Empty State ── */}
      {isEmptyState && <EmptyGuidelinesBanner />}

      {/* ── 2단 그리드: 최근 생성 + 지침 현황 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 최근 생성 콘텐츠 (2/3) */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              최근 생성
            </h2>
            <Link
              href="/history"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              전체 보기 →
            </Link>
          </div>

          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <ContentCardSkeleton key={i} />
              ))}
            </div>
          ) : historyError ? (
            <ApiErrorNotice message="최근 생성 콘텐츠를 불러오지 못했습니다. 새로고침 해주세요." />
          ) : recentItems.length === 0 ? (
            <EmptyContents />
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              {recentItems.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </motion.div>
          )}
        </section>

        {/* 지침 현황 (1/3) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              지침 현황
            </h2>
            <Link
              href="/guidelines"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              관리 →
            </Link>
          </div>

          <div className="border border-border rounded-lg p-4">
            {guidelinesLoading ? (
              <GuidelinesSkeletonSection />
            ) : guidelinesError ? (
              <ApiErrorNotice message="지침 정보를 불러오지 못했습니다." />
            ) : guidelines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                등록된 지침이 없습니다.
              </p>
            ) : (
              <GuidelinesStatus items={guidelines} />
            )}
          </div>

          {/* 지침 추가 바로가기 */}
          {!guidelinesLoading && !guidelinesError && (
            <Link
              href="/guidelines/new"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-base leading-none">+</span>
              새 지침 추가
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
