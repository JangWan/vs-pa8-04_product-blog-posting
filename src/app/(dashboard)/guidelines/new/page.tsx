"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import {
  GuidelineForm,
  type GuidelineFormValues,
} from "@/features/guidelines/components/guideline-form";
import { useCreateGuideline } from "@/features/guidelines/hooks/use-guidelines";

export default function GuidelinesNewPage() {
  const router = useRouter();
  const createMutation = useCreateGuideline();

  function handleSubmit(values: GuidelineFormValues) {
    createMutation.mutate(values, {
      onSuccess: () => {
        toast.success("지침이 저장되었습니다.");
        router.push("/guidelines");
      },
      onError: (error) => {
        toast.error(error.message);
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
      <nav className="flex items-center text-xs text-muted-foreground gap-1">
        <Link
          href="/guidelines"
          className="hover:text-foreground transition-colors"
        >
          AI 지침 관리
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">새 지침</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          새 지침 등록
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI가 글을 쓸 때 따를 브랜드 톤과 문체 규칙을 작성하세요.
        </p>
      </div>

      {/* 폼 본체는 가독성을 위해 max-w-3xl 제한 */}
      <div className="max-w-3xl">
        <GuidelineForm
          isSubmitting={createMutation.isPending}
          submitLabel="저장"
          onSubmit={handleSubmit}
        />
      </div>
    </motion.div>
  );
}
