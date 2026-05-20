"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  CreditCard,
  ArrowRight,
  ArrowDown,
  Crown,
  Users,
  WifiOff,
  Check,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useSubscription,
  usePlans,
  useBillingUsage,
  useSubscriptionHistory,
  useCancelSubscription,
  useResumeCancelSubscription,
  useCancelImmediateSubscription,
  useUpgradeToMax,
  useScheduleDowngrade,
  useCancelScheduledDowngrade,
  type Subscription,
  type SubscriptionHistoryItem,
} from "@/features/billing/hooks/use-billing";

// ── 타입 ──────────────────────────────────────────────────────────────────────

type PlanCode = "free" | "pro" | "max";

type PlanFeature = {
  label: string;
  value: string;
  grayed?: boolean;
};

type PlanCardDef = {
  code: PlanCode;
  name: string;
  price: number;
  description: string;
  features: PlanFeature[];
  recommended?: boolean;
};

// ── 플랜 카드 정의 ────────────────────────────────────────────────────────────

// 개인 조직은 비즈니스 규칙상 Free + Pro 2열만 제공 (MAX 없음)
const PERSONAL_PLAN_DEFS: PlanCardDef[] = [
  {
    code: "free",
    name: "Free",
    price: 0,
    description: "무료로 기본 기능 체험",
    features: [
      { label: "콘텐츠 생성", value: "10회/월" },
      { label: "번역", value: "5회/월" },
      { label: "AI Agent", value: "미포함", grayed: true },
    ],
  },
  {
    code: "pro",
    name: "Pro",
    price: 29000,
    description: "10배 더 많은 콘텐츠 생성",
    features: [
      { label: "콘텐츠 생성", value: "100회/월" },
      { label: "번역", value: "50회/월" },
      { label: "AI Agent", value: "30회/월" },
    ],
  },
];

const TEAM_PLAN_DEFS: PlanCardDef[] = [
  {
    code: "free",
    name: "Free",
    price: 0,
    description: "팀 기능 미포함",
    features: [
      { label: "콘텐츠 생성", value: "0회", grayed: true },
      { label: "번역", value: "0회", grayed: true },
      { label: "AI Agent", value: "0회", grayed: true },
      { label: "팀 멤버", value: "0명", grayed: true },
    ],
  },
  {
    code: "pro",
    name: "Pro",
    price: 29000,
    description: "팀과 함께 AI 활용",
    features: [
      { label: "콘텐츠 생성", value: "100회/월" },
      { label: "번역", value: "50회/월" },
      { label: "AI Agent", value: "30회/월" },
      { label: "팀 멤버", value: "최대 3명" },
    ],
  },
  {
    code: "max",
    name: "MAX",
    price: 58000,
    description: "대규모 팀 최적화",
    recommended: true,
    features: [
      { label: "콘텐츠 생성", value: "400회/월" },
      { label: "번역", value: "200회/월" },
      { label: "AI Agent", value: "120회/월" },
      { label: "팀 멤버", value: "무제한" },
    ],
  },
];

// ── 플랜 카드 feature 값 표시 헬퍼 ───────────────────────────────────────────
// 현재 구독 플랜: 실제 사용량(used/limit), 나머지 플랜: 한도 설명 그대로

function getFeatureDisplayValue(
  label: string,
  defaultValue: string,
  grayed: boolean,
  isCurrent: boolean,
  usageData: ReturnType<typeof useBillingUsage>["data"]
): string {
  if (!isCurrent || grayed || !usageData) return defaultValue;
  const { usage, limits } = usageData;
  switch (label) {
    case "콘텐츠 생성": return `${usage.generations_used} / ${limits.generations}회`;
    case "번역": return `${usage.translations_used} / ${limits.translations}회`;
    case "AI Agent":
      return limits.agent_runs === 0 ? "미포함" : `${usage.agent_runs_used} / ${limits.agent_runs}회`;
    default: return defaultValue;
  }
}

// ── 구독 이벤트 이력 카드 (D-2: subscription_history 기반) ──────────────────

const BILLING_KIND_META: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  activated:            { label: "구독 시작",      icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,   className: "bg-green-50 border-green-200" },
  resubscribed:         { label: "재구독",          icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,   className: "bg-green-50 border-green-200" },
  renewed:              { label: "갱신 결제",        icon: <CreditCard   className="h-3.5 w-3.5 text-blue-500" />,    className: "bg-blue-50 border-blue-200" },
  downgrade_scheduled:  { label: "다운그레이드 예약", icon: <ArrowDown    className="h-3.5 w-3.5 text-amber-500" />,   className: "bg-amber-50 border-amber-200" },
  downgraded:           { label: "다운그레이드 적용", icon: <ArrowDown    className="h-3.5 w-3.5 text-orange-500" />,  className: "bg-orange-50 border-orange-200" },
  billing_key_replaced: { label: "결제 수단 변경",   icon: <CreditCard   className="h-3.5 w-3.5 text-purple-500" />,  className: "bg-purple-50 border-purple-200" },
};

function BillingEventCard({ history }: { history: SubscriptionHistoryItem[] }) {
  if (history.length === 0) return null;

  const visible = history
    .filter((h) => ["activated", "resubscribed", "renewed", "downgraded", "billing_key_replaced"].includes(h.kind))
    .slice(0, 3);

  if (visible.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            최근 결제 이력
          </CardTitle>
          <Link href="/billing/payments">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-7">
              전체 보기 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {visible.map((item) => {
            const meta = BILLING_KIND_META[item.kind] ?? {
              label: item.kind,
              icon: <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />,
              className: "bg-muted border-border",
            };
            const date = item.period_start
              ? format(new Date(item.period_start), "yyyy.MM.dd", { locale: ko })
              : format(new Date(item.created_at), "yyyy.MM.dd", { locale: ko });
            const periodLabel = item.period_start && item.period_end
              ? `${format(new Date(item.period_start), "M.d", { locale: ko })} ~ ${format(new Date(item.period_end), "M.d", { locale: ko })}`
              : null;

            return (
              <div key={item.id} className="flex items-center justify-between py-3 gap-3">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border ${meta.className}`}>
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{periodLabel ?? date}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── 구독 대시보드 (pro/max 구독 중일 때) ──────────────────────────────────────

function SubscriptionDashboard({
  sub,
  cardDisplay,
  currentPlan,
  isPersonal,
  usageData,
  cancelSub,
  resumeCancel,
  cancelImmediate,
  upgradeToMax,
  scheduleDowngrade,
  cancelDowngrade,
  isCancelScheduled,
  isDowngradeScheduled,
  canCancelImmediately,
}: {
  sub: Subscription;
  cardDisplay: string | null;
  currentPlan: PlanCode;
  isPersonal: boolean;
  usageData: ReturnType<typeof useBillingUsage>["data"];
  cancelSub: ReturnType<typeof useCancelSubscription>;
  resumeCancel: ReturnType<typeof useResumeCancelSubscription>;
  cancelImmediate: ReturnType<typeof useCancelImmediateSubscription>;
  upgradeToMax: ReturnType<typeof useUpgradeToMax>;
  scheduleDowngrade: ReturnType<typeof useScheduleDowngrade>;
  cancelDowngrade: ReturnType<typeof useCancelScheduledDowngrade>;
  isCancelScheduled: boolean;
  isDowngradeScheduled: boolean;
  canCancelImmediately: boolean;
}) {
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const nextBilling = sub?.next_billing_at ? new Date(sub.next_billing_at) : null;
  const isPro = currentPlan === "pro";
  const isMax = currentPlan === "max";
  const planLabel = isMax ? "MAX" : "Pro";

  const genUsed = usageData?.usage.generations_used ?? 0;
  const transUsed = usageData?.usage.translations_used ?? 0;
  const agentUsed = usageData?.usage.agent_runs_used ?? 0;
  const genLimit = usageData?.limits.generations ?? (isPro ? 100 : 400);
  const transLimit = usageData?.limits.translations ?? (isPro ? 50 : 200);
  const agentLimit = usageData?.limits.agent_runs ?? (isPro ? 30 : 120);
  const totalUsed = genUsed + transUsed + agentUsed;
  const totalLimit = genLimit + transLimit + agentLimit;
  const usagePct = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;

  const remainingDays = periodEnd
    ? Math.max(0, Math.floor((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const proratedCost = Math.floor(((58000 - 29000) / 30) * remainingDays);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {isMax ? (
              <Crown className="h-5 w-5 text-purple-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            <CardTitle className="text-base">{planLabel} 플랜 구독 중</CardTitle>
            <Badge
              className={cn(
                "text-[10px]",
                isMax && "bg-purple-100 text-purple-700 border-purple-200 border"
              )}
            >
              {isMax ? "MAX" : "활성"}
            </Badge>
            {isPersonal && (
              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">개인 구독</Badge>
            )}
            {isCancelScheduled && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">해지 예약됨</Badge>
            )}
            {isDowngradeScheduled && !isCancelScheduled && (
              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">다운그레이드 예약됨</Badge>
            )}
          </div>
          {/* 관리 액션 버튼 */}
          <div className="flex items-center gap-1">
            {canCancelImmediately && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs">즉시 취소</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>구독을 즉시 취소하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      아직 서비스를 사용하지 않으셨으므로 결제 금액이 전액 환불됩니다. 취소 즉시 {planLabel} 기능 사용이 중단되며, 무료 플랜으로 전환됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소 안 함</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => cancelImmediate.mutate()}>즉시 취소 및 전액 환불</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isMax && !isCancelScheduled && !isDowngradeScheduled && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-blue-600 text-xs">
                    <ArrowDown className="h-3 w-3 mr-1" />
                    Pro로 다운그레이드
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Pro 플랜으로 다운그레이드</AlertDialogTitle>
                    <AlertDialogDescription>
                      {nextBilling && <>{format(nextBilling, "yyyy년 M월 d일", { locale: ko })} 다음 결제일부터 Pro 플랜(₩29,000/월)이 적용됩니다.<br /></>}
                      현재 구독 기간({periodEnd ? format(periodEnd, "M월 d일", { locale: ko }) : "—"})까지는 MAX 기능을 계속 사용할 수 있습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={() => scheduleDowngrade.mutate()}>다운그레이드 예약</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isDowngradeScheduled && !isCancelScheduled && (
              <Button size="sm" variant="ghost" className="text-blue-600 text-xs" disabled={cancelDowngrade.isPending} onClick={() => cancelDowngrade.mutate()}>
                다운그레이드 취소
              </Button>
            )}
            {isCancelScheduled ? (
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50" disabled={resumeCancel.isPending} onClick={() => resumeCancel.mutate()}>
                해지 예약 취소
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-600 text-xs">구독 취소</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>구독을 취소하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {periodEnd && <>{format(periodEnd, "yyyy년 M월 d일", { locale: ko })}까지 {planLabel} 기능을 계속 사용할 수 있습니다.<br /></>}
                      결제 예정일 전이라면 언제든 해지 예약을 취소할 수 있습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소 안 함</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => cancelSub.mutate()}>구독 취소 예약</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* payer_warning 배너 */}
        {sub?.payer_warning && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>결제자가 팀을 떠났습니다. 결제 수단을 재등록하거나 결제자를 변경하세요.</span>
          </div>
        )}

        {/* 통계 그리드 */}
        <div className={cn("grid gap-3", !isPersonal ? "grid-cols-4" : "grid-cols-3")}>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">다음 결제일</p>
            <p className="text-sm font-semibold">
              {nextBilling ? format(nextBilling, "M월 d일", { locale: ko }) : isCancelScheduled ? "없음" : "—"}
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">기간 만료</p>
            <p className="text-sm font-semibold">
              {periodEnd ? format(periodEnd, "M월 d일", { locale: ko }) : "—"}
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">이번 달 사용률</p>
            <p className={cn("text-sm font-semibold", usagePct >= 90 ? "text-red-600" : usagePct >= 70 ? "text-amber-600" : "")}>
              {usagePct}%
            </p>
          </div>
          {!isPersonal && (
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">결제 수단</p>
              <p className="text-sm font-semibold truncate">
                {cardDisplay ?? (sub?.payer_user_id ? "등록됨" : "미등록")}
              </p>
            </div>
          )}
        </div>

        {/* 팀 멤버 관리 링크 */}
        {!isPersonal && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>팀 멤버 관리는 <Link href="/org" className="underline underline-offset-2 text-foreground">조직 설정</Link>에서 할 수 있습니다.</span>
          </div>
        )}

        {/* Pro → MAX 업그레이드 CTA (팀 org만 — 개인 org는 MAX 불가) */}
        {isPro && !isPersonal && !isCancelScheduled && remainingDays > 0 && (
          <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50/40 to-purple-100/20 border-purple-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="h-4 w-4 text-purple-600" />
                  <p className="text-sm font-bold text-purple-900">MAX 플랜으로 업그레이드</p>
                </div>
                <p className="text-xs text-purple-700">콘텐츠 생성 400회, 번역 200회, AI Agent 120회 · 멤버 무제한</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white shrink-0 gap-1.5">
                    <Crown className="h-3.5 w-3.5" />
                    업그레이드
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>MAX 플랜으로 업그레이드</AlertDialogTitle>
                    <AlertDialogDescription>
                      현재 구독 잔여 {remainingDays}일에 대한 일할 금액 ₩{proratedCost.toLocaleString()}이 즉시 결제됩니다.
                      <br />잔여 Pro 한도의 4배 혜택이 이번 달에 적용됩니다.
                      <br />다음 결제일부터는 MAX 정가(₩58,000/월)가 청구됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => upgradeToMax.mutate()}>
                      ₩{proratedCost.toLocaleString()} 결제 후 업그레이드
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 플랜 카드 (통합) ──────────────────────────────────────────────────────────

function PlanCard({
  plan,
  currentPlan,
  isPersonal,
  isCancelScheduled,
  usageData,
}: {
  plan: PlanCardDef;
  currentPlan: PlanCode;
  isPersonal: boolean;
  isCancelScheduled: boolean;
  usageData: ReturnType<typeof useBillingUsage>["data"];
}) {
  const isCurrent = plan.code === currentPlan;
  const isFree = plan.code === "free";
  const isMaxPlan = plan.code === "max";
  const checkoutHref = `/billing/checkout?plan=${plan.code}&from=%2Fbilling`;

  return (
    <Card
      className={cn(
        "flex flex-col",
        isCurrent && "border-primary ring-1 ring-primary",
        plan.recommended && !isCurrent && "border-primary/60",
        isFree && !isCurrent && "opacity-70"
      )}
    >
      {/* 헤더: 플랜명 + 인라인 뱃지 + 설명 + 금액 */}
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-base">{plan.name}</CardTitle>
          {isMaxPlan && <Crown className="h-4 w-4 text-purple-500" />}
          {isCurrent && (
            <Badge className="text-[10px] h-5 px-1.5">
              {isCancelScheduled ? "해지 예약됨" : "구독 중"}
            </Badge>
          )}
          {plan.recommended && !isCurrent && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-primary text-primary">
              추천
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
        <p className="text-2xl font-bold mt-2 leading-none">
          {isFree ? "무료" : `₩${plan.price.toLocaleString()}`}
          {!isFree && <span className="text-sm font-normal text-muted-foreground ml-0.5">/월</span>}
        </p>
      </CardHeader>

      {/* 금액과 한도 사이 구분선 */}
      <div className="h-px bg-border" />

      {/* 한도 / 사용량 목록 */}
      <CardContent className="flex flex-col flex-1 pt-3 pb-4 space-y-2">
        {plan.features.map((f) => {
          const displayValue = getFeatureDisplayValue(
            f.label, f.value, !!f.grayed, isCurrent, usageData
          );
          const isUsage = isCurrent && !f.grayed && displayValue.includes("/");
          return (
            <div
              key={f.label}
              className={cn(
                "flex items-center justify-between text-xs",
                f.grayed ? "text-muted-foreground/50" : "text-foreground"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Check className={cn("h-3 w-3 shrink-0", f.grayed ? "text-muted-foreground/40" : "text-primary")} />
                {f.label}
              </span>
              <span className={cn(
                "font-medium tabular-nums",
                f.grayed ? "text-muted-foreground/50" : "",
                isUsage ? "text-primary" : ""
              )}>
                {displayValue}
              </span>
            </div>
          );
        })}

        {/* 유료 플랜 버튼
            - 현재 플랜: 상태 표시 (disabled)
            - free → 유료: "가입하기" (신규 구독)
            - 유료 → 다른 유료: 버튼 없음 (업그레이드/다운그레이드는 SubscriptionDashboard에서 처리)
        */}
        {!isFree && (
          <div className="pt-3 mt-auto">
            {isCurrent ? (
              <Button className="w-full" size="sm" disabled>
                {isCancelScheduled ? "해지 예약됨" : "구독 중"}
              </Button>
            ) : currentPlan === "free" ? (
              <Link href={checkoutHref} className="block">
                <Button
                  className={cn("w-full", isMaxPlan && "bg-purple-600 hover:bg-purple-700")}
                  size="sm"
                  variant={plan.recommended ? "default" : "outline"}
                >
                  가입하기
                </Button>
              </Link>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlanCardsSection({
  currentPlan,
  isPersonal,
  isCancelScheduled,
  usageData,
}: {
  currentPlan: PlanCode;
  isPersonal: boolean;
  isCancelScheduled: boolean;
  usageData: ReturnType<typeof useBillingUsage>["data"];
}) {
  const plans = isPersonal ? PERSONAL_PLAN_DEFS : TEAM_PLAN_DEFS;
  // 카드 1장당 최대 ~270px, 2장=560px, 3장=830px
  const gridClass = plans.length === 2
    ? "grid-cols-2 max-w-[560px]"
    : "grid-cols-3 max-w-[830px]";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">플랜 비교</h3>
      <div className={cn("grid gap-4", gridClass)}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            currentPlan={currentPlan}
            isPersonal={isPersonal}
            isCancelScheduled={isCancelScheduled}
            usageData={usageData}
          />
        ))}
      </div>
      {!isPersonal && (
        <p className="text-xs text-muted-foreground">한도는 팀원 공유 풀 · 언제든 해지 가능</p>
      )}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { orgId } = useAuth();
  const { data: subData, isLoading: subLoading } = useSubscription();
  const { data: usageData, isLoading: usageLoading } = useBillingUsage();
  const { data: billingHistory } = useSubscriptionHistory();
  usePlans();

  const cancelSub = useCancelSubscription();
  const resumeCancel = useResumeCancelSubscription();
  const cancelImmediate = useCancelImmediateSubscription();
  const upgradeToMax = useUpgradeToMax();
  const scheduleDowngrade = useScheduleDowngrade();
  const cancelDowngrade = useCancelScheduledDowngrade();

  // orgId가 없으면 Clerk 아직 로딩 중 → 스켈레톤 표시
  const isLoading = !orgId || subLoading || usageLoading;

  if (isLoading) {
    return (
      <PageShell title="결제·플랜" description="구독 및 결제를 관리합니다.">
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl max-w-3xl" />
          <div className="grid grid-cols-2 gap-4 max-w-[560px]">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </div>
      </PageShell>
    );
  }

  const sub = subData?.subscription;
  const cardDisplay = subData?.card_display ?? null;
  const currentPlan = (subData?.current_plan ?? "free") as PlanCode;
  const isPersonal = subData?.is_default ?? true;

  const subStatus = sub?.status ?? null;
  const isSuspended = subStatus === "suspended";
  const isPastDue = subStatus === "past_due";
  const isCancelScheduled = subStatus === "cancel_scheduled";
  const isActive = subStatus === "active";

  const isSubscribed = (isActive || isCancelScheduled) && (currentPlan === "pro" || currentPlan === "max");
  const isDowngradeScheduled = !!sub?.pending_plan_product_id;

  const usage = usageData?.usage;
  const canCancelImmediately =
    isActive &&
    !!usage &&
    usage.generations_used === 0 &&
    usage.translations_used === 0 &&
    usage.agent_runs_used === 0;

  const history = billingHistory ?? [];

  return (
    <PageShell
      title="결제·플랜"
      description="구독 및 결제를 관리합니다."
      actions={
        history.length > 0 ? (
          <Link href="/billing/payments">
            <Button variant="outline" size="sm" className="gap-1.5">
              <CreditCard className="h-4 w-4" />
              전체 결제 이력
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-4">

        {/* 전체 너비 상태 배너 */}
        {isSuspended && (
          <Card className="border-orange-300 bg-orange-50/40">
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <WifiOff className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-orange-800">결제 수단이 등록되어 있지 않습니다</p>
                    <p className="text-sm text-orange-700 mt-0.5">결제 수단을 재등록해야 구독이 정상 유지됩니다.</p>
                  </div>
                </div>
                <Link href="/billing/checkout?mode=update-payment-method&from=%2Fbilling">
                  <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-50 shrink-0">
                    결제 수단 재등록
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {isPastDue && (
          <Card className="border-red-300 bg-red-50/40">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">정기결제에 실패했습니다</p>
                  <p className="text-sm text-red-600 mt-0.5">카드 정보를 확인하고 3일 내에 갱신하세요. 기한 초과 시 무료 플랜으로 전환됩니다.</p>
                  {sub?.past_due_since && (
                    <p className="text-xs text-red-500 mt-1">
                      실패일: {format(new Date(sub.past_due_since), "yyyy년 M월 d일", { locale: ko })}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 구독 대시보드 (pro/max 구독 중) — 전체 너비 */}
        {isSubscribed && sub && (
          <SubscriptionDashboard
            sub={sub}
            cardDisplay={cardDisplay}
            currentPlan={currentPlan}
            isPersonal={isPersonal}
            usageData={usageData}
            cancelSub={cancelSub}
            resumeCancel={resumeCancel}
            cancelImmediate={cancelImmediate}
            upgradeToMax={upgradeToMax}
            scheduleDowngrade={scheduleDowngrade}
            cancelDowngrade={cancelDowngrade}
            isCancelScheduled={isCancelScheduled}
            isDowngradeScheduled={isDowngradeScheduled}
            canCancelImmediately={canCancelImmediately}
          />
        )}

        {/* 플랜 비교 카드 — 폭 제한 */}
        <PlanCardsSection
          currentPlan={currentPlan}
          isPersonal={isPersonal}
          isCancelScheduled={isCancelScheduled}
          usageData={usageData}
        />

        {/* 최근 구독 이벤트 이력 (D-2: subscription_history 기반) */}
        <BillingEventCard history={history} />
      </div>
    </PageShell>
  );
}
