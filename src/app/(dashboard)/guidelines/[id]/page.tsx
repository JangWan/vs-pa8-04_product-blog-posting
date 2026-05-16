"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GuidelineForm,
  type GuidelineFormValues,
} from "@/features/guidelines/components/guideline-form";
import {
  useGuideline,
  useUpdateGuideline,
} from "@/features/guidelines/hooks/use-guidelines";

export default function GuidelinesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data, isLoading, isError, error } = useGuideline(id);
  const updateMutation = useUpdateGuideline();

  function handleSubmit(values: GuidelineFormValues) {
    updateMutation.mutate(
      { id, ...values },
      {
        onSuccess: () => {
          toast.success("지침이 저장되었습니다.");
          router.push("/guidelines");
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
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
        <Link
          href="/guidelines"
          className="hover:text-foreground transition-colors shrink-0"
        >
          AI 지침 관리
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground truncate">
          {data?.title ?? "지침 수정"}
        </span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          지침 수정
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          기존 지침의 제목과 내용을 수정할 수 있습니다.
        </p>
      </div>

      {/* 폼 본체는 가독성을 위해 max-w-3xl 제한 */}
      <div className="max-w-3xl">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-60 w-full" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-20" />
            </div>
          </div>
        ) : isError || !data ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error?.message ?? "지침을 불러오지 못했습니다."}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/guidelines")}
            >
              지침 목록으로
            </Button>
          </div>
        ) : (
          <GuidelineForm
            initialValues={{ title: data.title, content: data.content }}
            isSubmitting={updateMutation.isPending}
            submitLabel="저장"
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </motion.div>
  );
}
