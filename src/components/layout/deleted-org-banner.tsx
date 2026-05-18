"use client";

import { differenceInDays } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useOrganizations } from "@/features/organizations/hooks/use-organizations";

/**
 * 활성 조직이 soft-delete 상태일 때 상단에 amber 경고 배너를 표시한다.
 * 조직 설정(/org/:id)에서 복원 가능하다는 안내 포함.
 */
export function DeletedOrgBanner() {
  const { data: orgs } = useOrganizations();

  const activeOrg = orgs?.find((o) => o.is_default) ?? orgs?.[0];

  if (!activeOrg?.deleted_at) return null;

  const daysLeft = 30 - differenceInDays(new Date(), new Date(activeOrg.deleted_at));

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-300 text-amber-800 text-sm shrink-0">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        현재 활성 조직 <strong>&apos;{activeOrg.name}&apos;</strong>이(가) 삭제 예정입니다.&nbsp;
        {daysLeft > 0 ? `${daysLeft}일 내` : "오늘"} 영구 삭제됩니다.&nbsp;
        <a href={`/org/${activeOrg.id}`} className="underline underline-offset-2 font-medium">
          지금 복원하기
        </a>
      </span>
    </div>
  );
}
