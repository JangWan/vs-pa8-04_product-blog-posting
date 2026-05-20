"use client";

import { AlertTriangle, WifiOff } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useSubscription } from "@/features/billing/hooks/use-billing";
import { useOrganizations } from "@/features/organizations/hooks/use-organizations";

/**
 * 결제 이상 상태일 때 admin에게만 상단 배너를 표시한다.
 * - past_due: 정기결제 실패 (빨강, BR-36)
 * - suspended: 빌링키 없음, 결제 수단 재등록 필요 (주황)
 */
export function PastDueBanner() {
  const { orgId: activeClerkOrgId } = useAuth();
  const { data: orgs } = useOrganizations();
  const { data: subData } = useSubscription();

  // useAuth().orgId 기준으로 탐지 — setActive 직후 즉시 반영
  const activeOrg =
    orgs?.find((o) => o.clerk_org_id === activeClerkOrgId) ?? orgs?.[0];
  const isAdmin = activeOrg?.role === "admin";

  if (!isAdmin) return null;

  const status = subData?.subscription?.status;

  if (status === "past_due") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-300 text-red-800 text-sm shrink-0">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
        <span>
          정기결제에 실패했습니다. 3일 내에 카드 정보를 갱신하지 않으면 무료 플랜으로 전환됩니다.&nbsp;
          <Link href="/billing" className="underline underline-offset-2 font-medium">
            결제 관리
          </Link>
        </span>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border-b border-orange-300 text-orange-800 text-sm shrink-0">
        <WifiOff className="h-4 w-4 shrink-0 text-orange-500" />
        <span>
          결제 수단이 등록되어 있지 않습니다. 구독을 유지하려면 결제 수단을 재등록해 주세요.&nbsp;
          <Link href="/billing" className="underline underline-offset-2 font-medium">
            결제 관리
          </Link>
        </span>
      </div>
    );
  }

  return null;
}
