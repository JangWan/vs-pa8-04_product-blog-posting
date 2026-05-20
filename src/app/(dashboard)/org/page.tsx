"use client";

import Link from "next/link";
import { Plus, Building2, Users, ArrowRight, RotateCcw } from "lucide-react";
import { differenceInDays } from "date-fns";
import { motion } from "framer-motion";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations, useRestoreOrganization } from "@/features/organizations/hooks/use-organizations";

export default function OrgListPage() {
  const { data: orgs, isLoading } = useOrganizations();
  const restore = useRestoreOrganization();

  if (isLoading) {
    return (
      <PageShell title="내 조직" description="소속된 조직 목록입니다.">
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="내 조직"
      description="소속된 조직 목록입니다."
      actions={
        <Link href="/org/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            새 조직
          </Button>
        </Link>
      }
    >
      {(!orgs || orgs.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">소속된 조직이 없습니다.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {orgs.map((org, i) => {
            const isDeleted = !!org.deleted_at;
            const daysLeft = isDeleted
              ? 30 - differenceInDays(new Date(), new Date(org.deleted_at!))
              : null;

            return (
              <motion.div
                key={org.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={isDeleted ? "border-amber-300 bg-amber-50/30" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{org.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">/{org.slug}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {org.is_default && (
                          <Badge variant="outline" className="text-[10px]">개인</Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {org.plan_product_id ? "유료" : "free"}
                        </Badge>
                        <Badge variant={org.role === "admin" ? "default" : "outline"} className="text-[10px]">
                          {org.role === "admin" ? "관리자" : "멤버"}
                        </Badge>
                        {isDeleted && daysLeft !== null && (
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                            삭제 예정 {daysLeft}일
                          </Badge>
                        )}
                        {org.is_default && !isDeleted && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-0">
                            활성
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                      <Users className="h-3.5 w-3.5" />
                      <span>{org.member_count}명</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isDeleted ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50">
                              <RotateCcw className="h-3.5 w-3.5" />
                              복원
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>조직을 복원하시겠습니까?</AlertDialogTitle>
                              <AlertDialogDescription>
                                &apos;{org.name}&apos;을(를) 복원합니다.<br />
                                콘텐츠·지침은 즉시 복구되지만, 취소된 구독은 자동 재활성화되지 않습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction onClick={() => restore.mutate(org.id)}>
                                복원하기
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <>
                          {org.role === "admin" && (
                            <Link href={`/org/${org.id}`}>
                              <Button size="sm" variant="outline" className="gap-1.5">
                                <ArrowRight className="h-3.5 w-3.5" />
                                관리
                              </Button>
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
