"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Save, Copy, Download, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

/* MDX Editor — 동적 import로 SSR 방지 */
import dynamic from "next/dynamic";

const MarkdownEditor = dynamic(
  () => import("@/features/generate/components/markdown-editor"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-96 w-full rounded-lg" />,
  }
);

type ContentDetail = {
  id: string;
  topic: string;
  keywords: string[];
  direction: string | null;
  body: string;
  seo_meta: {
    title: string;
    description: string;
    slug: string;
    keywords: string[];
  };
  guideline_title: string | null;
  created_at: string;
  updated_at: string;
};

export default function GenerateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [content, setContent] = useState<ContentDetail | null>(null);
  const [editorBody, setEditorBody] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavUrl, setPendingNavUrl] = useState<string | null>(null);

  /* 콘텐츠 로딩 */
  useEffect(() => {
    async function fetchContent() {
      try {
        const res = await fetch(`/api/history/${id}`);
        if (res.status === 404) {
          toast.error("요청하신 정보를 찾을 수 없습니다.");
          router.push("/dashboard");
          return;
        }
        if (res.status === 403) {
          toast.error("접근 권한이 없습니다.");
          router.push("/dashboard");
          return;
        }
        if (!res.ok) throw new Error("로딩 실패");

        const data: ContentDetail = await res.json();
        setContent(data);
        setEditorBody(data.body);
      } catch {
        toast.error("콘텐츠를 불러오지 못했습니다.");
        router.push("/dashboard");
      } finally {
        setIsLoading(false);
      }
    }
    fetchContent();
  }, [id, router]);

  /* dirty 상태 감지 */
  useEffect(() => {
    if (!content) return;
    setIsDirty(editorBody !== content.body);
  }, [editorBody, content]);

  /* 브라우저 탭 닫기 / 새로고침 경고 */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* 저장 */
  async function handleSave() {
    if (!content) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/history/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editorBody }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setContent((prev) => (prev ? { ...prev, body: editorBody } : prev));
      setIsDirty(false);
      toast.success("저장되었습니다.");
    } catch {
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  /* 전체 복사 */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(editorBody);
      toast.success("클립보드에 복사되었습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }

  /* 마크다운 다운로드 */
  function handleDownload() {
    if (!content) return;
    const slug =
      content.seo_meta?.slug ||
      content.topic.toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    const dateStr = format(new Date(content.created_at), "yyyy-MM-dd");
    const filename = `${dateStr}-${slug}.md`;

    const blob = new Blob([editorBody], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* Next.js 내부 라우팅 이탈 방지 */
  const handleNavWithGuard = useCallback(
    (href: string) => {
      if (isDirty) {
        setPendingNavUrl(href);
        setShowLeaveDialog(true);
      } else {
        router.push(href);
      }
    },
    [isDirty, router]
  );

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!content) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="max-w-4xl mx-auto space-y-5"
    >
      {/* 상단 네비게이션 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleNavWithGuard("/dashboard")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          대시보드
        </button>
      </div>

      {/* 메타 정보 + 액션 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight line-clamp-2">
            {content.topic}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* 지침명 */}
            {content.guideline_title ? (
              <Badge variant="secondary">{content.guideline_title}</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                삭제된 지침
              </Badge>
            )}
            {/* 생성일 */}
            <span className="text-xs text-muted-foreground">
              {format(new Date(content.created_at), "yyyy.MM.dd HH:mm", {
                locale: ko,
              })}
            </span>
            {/* 키워드 태그 */}
            {content.keywords?.map((kw) => (
              <Badge key={kw} variant="outline" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5"
          >
            <Copy className="h-4 w-4" />
            전체 복사
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            다운로드
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>

      {/* dirty 상태 알림 */}
      {isDirty && (
        <p className="text-xs text-muted-foreground">
          저장하지 않은 변경사항이 있습니다.
        </p>
      )}

      {/* MDX 에디터 */}
      <div className="border border-border rounded-lg overflow-hidden min-h-[500px]">
        <MarkdownEditor
          initialValue={content.body}
          onChange={(val) => setEditorBody(val)}
        />
      </div>

      {/* 이탈 확인 다이얼로그 */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 변경사항이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              이 페이지를 떠나면 편집 내용이 소실됩니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNavUrl(null)}>
              계속 편집하기
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingNavUrl) router.push(pendingNavUrl);
                setShowLeaveDialog(false);
              }}
            >
              페이지 떠나기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
