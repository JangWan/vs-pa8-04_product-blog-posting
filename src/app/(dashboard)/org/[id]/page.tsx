"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { differenceInDays } from "date-fns";
import { AlertTriangle, LogOut, RotateCcw } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  useRestoreOrganization,
} from "@/features/organizations/hooks/use-organizations";
import { useLeaveOrganization } from "@/features/billing/hooks/use-billing";
import { MembersTab } from "./_components/members-tab";

type Props = { params: Promise<{ id: string }> };

type GeneralForm = { name: string; slug: string };

export default function OrgSettingsPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "general";
  const { data: org, isLoading } = useOrganization(id);
  const update = useUpdateOrganization(id);
  const deleteOrg = useDeleteOrganization(id);
  const restore = useRestoreOrganization();
  const leave = useLeaveOrganization(id);

  const { register, handleSubmit, formState: { isDirty } } = useForm<GeneralForm>();
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  if (isLoading) {
    return (
      <PageShell title="조직 설정" description="">
        <Skeleton className="h-64 rounded-xl" />
      </PageShell>
    );
  }

  if (!org) {
    return (
      <PageShell title="조직 설정" description="">
        <p className="text-sm text-muted-foreground">조직을 찾을 수 없습니다.</p>
      </PageShell>
    );
  }

  const isDeleted = !!org.deleted_at;
  const daysLeft = isDeleted
    ? 30 - differenceInDays(new Date(), new Date(org.deleted_at!))
    : null;

  const onGeneral = handleSubmit(async (data) => {
    await update.mutateAsync({ name: data.name, slug: data.slug });
  });

  const handleDelete = async () => {
    await deleteOrg.mutateAsync();
    setDeleteOpen(false);
    router.push("/org");
  };

  const handleLeave = async () => {
    await leave.mutateAsync();
    setLeaveOpen(false);
    router.push("/org");
  };

  return (
    <PageShell
      title={org.name}
      description="조직 설정을 관리합니다."
    >
      {/* soft-deleted 배너 */}
      {isDeleted && (
        <div className="flex items-center justify-between gap-3 p-3 mb-4 rounded-md bg-amber-50 border border-amber-300 text-amber-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>이 조직은 {daysLeft}일 후 영구 삭제됩니다.</span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                복원하기
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>조직을 복원하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  &apos;{org.name}&apos;을(를) 복원합니다. 모든 데이터가 즉시 복구됩니다.
                  취소된 구독은 자동 재활성화되지 않습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <Button onClick={() => restore.mutate(id)}>복원하기</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">일반</TabsTrigger>
          <TabsTrigger value="members">멤버</TabsTrigger>
          <TabsTrigger value="danger">위험 영역</TabsTrigger>
        </TabsList>

        {/* 일반 탭 */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">기본 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onGeneral} className="space-y-4 max-w-sm">
                <div className="space-y-1.5">
                  <Label htmlFor="name">조직명</Label>
                  <Input
                    id="name"
                    {...register("name")}
                    defaultValue={org.name}
                    disabled={isDeleted}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug">슬러그</Label>
                  <Input
                    id="slug"
                    {...register("slug")}
                    defaultValue={org.slug}
                    className="font-mono text-sm"
                    disabled={isDeleted}
                  />
                </div>
                <Button type="submit" disabled={update.isPending || isDeleted}>
                  {update.isPending ? "저장 중..." : "저장"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 멤버 탭 */}
        <TabsContent value="members">
          <MembersTab org={org} />
        </TabsContent>

        {/* 위험 영역 탭 */}
        <TabsContent value="danger">
          {org.is_default ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                기본 팀에는 위험 영역 기능이 없습니다.
                <br />
                기본 팀을 삭제하려면 계정 삭제가 필요합니다.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">위험 영역</CardTitle>
                <CardDescription>
                  아래 작업은 되돌리기 어렵습니다. 신중하게 진행하세요.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 팀 탈퇴 (H-05) */}
                <div className="flex items-center justify-between p-4 rounded-md border border-border">
                  <div>
                    <p className="text-sm font-medium">팀 탈퇴</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      이 팀을 탈퇴합니다. 콘텐츠는 팀에 남습니다.
                    </p>
                  </div>
                  <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDeleted || leave.isPending}
                        className="gap-1.5"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        팀 탈퇴
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>팀을 탈퇴하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-2">
                            <p>
                              &apos;{org.name}&apos;에서 탈퇴합니다. 이 팀의 콘텐츠에 대한
                              접근 권한을 즉시 잃습니다.
                            </p>
                            {!!org.plan_product_id && (
                              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs">
                                이 팀의 구독(결제)은 계속 유지됩니다.
                                결제 카드가 등록된 경우 다음 결제일에 자동 청구됩니다.
                                결제 관련 사항은 팀 관리자에게 문의하세요.
                              </p>
                            )}
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <Button
                          variant="destructive"
                          onClick={handleLeave}
                          disabled={leave.isPending}
                        >
                          {leave.isPending ? "탈퇴 중..." : "탈퇴하기"}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* 조직 삭제 */}
                <div className="flex items-center justify-between p-4 rounded-md border border-destructive/30 bg-destructive/5">
                  <div>
                    <p className="text-sm font-medium">조직 삭제</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      삭제 후 30일 내 복원 가능 · 30일 경과 시 모든 데이터 영구 삭제
                    </p>
                  </div>
                  <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isDeleted}
                      >
                        조직 삭제
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              삭제 후 <strong>30일 내에는 복원 가능</strong>하며,
                              30일 경과 시 이 조직의 모든 콘텐츠·지침·결제 이력이 영구 삭제됩니다.
                            </p>
                            <div className="space-y-1.5">
                              <p className="text-sm">
                                확인을 위해 조직 슬러그를 정확히 입력해주세요:
                              </p>
                              <p className="font-mono text-sm text-foreground bg-muted px-2 py-1 rounded">
                                {org.slug}
                              </p>
                              <Input
                                value={deleteSlugInput}
                                onChange={(e) => setDeleteSlugInput(e.target.value)}
                                placeholder={org.slug}
                                className="font-mono text-sm"
                              />
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteSlugInput("")}>
                          취소
                        </AlertDialogCancel>
                        <Button
                          variant="destructive"
                          onClick={handleDelete}
                          disabled={deleteSlugInput !== org.slug || deleteOrg.isPending}
                        >
                          {deleteOrg.isPending ? "삭제 중..." : "삭제하기"}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
