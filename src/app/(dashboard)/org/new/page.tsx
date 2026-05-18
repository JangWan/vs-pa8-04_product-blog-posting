"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateOrganization } from "@/features/organizations/hooks/use-organizations";

type FormValues = { name: string; slug: string };

export default function OrgNewPage() {
  const router = useRouter();
  const create = useCreateOrganization();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const [slugManual, setSlugManual] = useState(false);

  const nameValue = watch("name") ?? "";

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue("name", val);
    if (!slugManual) {
      const autoSlug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setValue("slug", autoSlug);
    }
  };

  const onSubmit = async (data: FormValues) => {
    const result = await create.mutateAsync({ name: data.name, slug: data.slug || undefined });
    router.push("/org");
  };

  return (
    <PageShell
      title="새 조직 만들기"
      description="조직은 멤버를 초대해 콘텐츠·지침을 공유할 수 있는 공간입니다."
    >
      <div className="max-w-md">
        <p className="text-xs text-muted-foreground mb-6 p-3 bg-muted rounded-md">
          이미 본인 전용 Personal Workspace가 자동 생성되어 있습니다.
          팀 협업이 필요할 때만 새 조직을 만드세요. Free 플랜은 멤버 1명까지 초대 가능합니다.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">조직명 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              {...register("name", { required: "조직명을 입력해주세요.", maxLength: 80, onChange: handleNameChange })}
              placeholder="예: Acme Team"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">슬러그</Label>
            <Input
              id="slug"
              {...register("slug")}
              onChange={(e) => {
                setSlugManual(true);
                setValue("slug", e.target.value);
              }}
              placeholder="자동 생성됩니다"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">URL에 사용됩니다. 소문자·숫자·하이픈만 허용.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/org")}
              disabled={create.isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={create.isPending || !nameValue}>
              {create.isPending ? "생성 중..." : "조직 생성"}
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
