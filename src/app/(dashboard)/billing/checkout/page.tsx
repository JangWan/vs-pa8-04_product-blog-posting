"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useUser, useAuth } from "@clerk/nextjs";
import { AlertCircle, Check, Clock, Loader2, Zap } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useCreateOrder,
  useUpdateOrderStatus,
  useInitPaymentMethodUpdate,
  useSubscription,
  usePlanProducts,
  type PlanProduct,
} from "@/features/billing/hooks/use-billing";
import { useOrganizations } from "@/features/organizations/hooks/use-organizations";

type OrderState =
  | { phase: "selecting_plan" }
  | { phase: "creating" }
  | { phase: "ready"; orderId: string; customerKey: string; amount: number; orderName: string; expiresAt: Date }
  | { phase: "error"; message: string };

function useCountdown(expiresAt: Date | null) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, expiresAt.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return { minutes, seconds, expired: remaining === 0 };
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <PageShell title="결제 진행" description="">
        <div className="max-w-md mx-auto">
          <Card><CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent></Card>
        </div>
      </PageShell>
    }>
      <CheckoutInner />
    </Suspense>
  );
}

// ── H-02: 팀 체크아웃 Pro vs MAX 플랜 선택 UI (D-3: DB 기반 플랜 조회) ──────

// 플랜별 feature 텍스트 — DB에는 없는 마케팅 문구
function buildFeatures(p: PlanProduct): string[] {
  const maxMembers = p.max_members === null ? "멤버 무제한" : `최대 ${p.max_members}명`;
  return [
    `콘텐츠 생성 ${p.generations_per_month}회/월`,
    `번역 ${p.translations_per_month}회/월`,
    `Agent ${p.agent_runs_per_month}회/월`,
    maxMembers,
  ];
}

// DB 조회 실패 시 사용할 fallback 상수
const FALLBACK_PLANS: PlanProduct[] = [
  {
    id: "fallback-pro",
    team_type: "team",
    plan_code: "pro",
    name: "Pro",
    price: "29000",
    max_members: 3,
    generations_per_month: 100,
    translations_per_month: 50,
    agent_runs_per_month: 30,
  },
  {
    id: "fallback-max",
    team_type: "team",
    plan_code: "max",
    name: "MAX",
    price: "58000",
    max_members: null,
    generations_per_month: 400,
    translations_per_month: 200,
    agent_runs_per_month: 120,
  },
];

function PlanSelector({ onSelect }: { onSelect: (plan: "pro" | "max") => void }) {
  const { data: dbPlans } = usePlanProducts("team");

  // 팀 유료 플랜만 (free 제외), DB 조회 실패 시 fallback
  const plans = (dbPlans?.filter((p) => p.plan_code !== "free") ?? FALLBACK_PLANS)
    .sort((a, b) => Number(a.price) - Number(b.price));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">팀 플랜 선택</h2>
        <p className="text-sm text-muted-foreground mt-1">팀원과 함께 사용할 플랜을 선택하세요.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {plans.map((plan) => {
          const isRecommended = plan.plan_code === "max";
          const planCode = plan.plan_code as "pro" | "max";
          const features = buildFeatures(plan);
          return (
            <Card
              key={plan.id}
              className={cn("relative cursor-pointer border-2 transition-colors hover:border-primary", isRecommended && "border-primary")}
              onClick={() => onSelect(planCode)}
            >
              {isRecommended && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px]">추천</Badge>
              )}
              <CardHeader className="pb-2 pt-5">
                <CardTitle className="text-base flex items-center gap-2">
                  {plan.name}
                  {isRecommended && <Zap className="h-4 w-4 text-primary" />}
                </CardTitle>
                <p className="text-xl font-bold">
                  ₩{Number(plan.price).toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground">/월</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-1.5 pb-5">
                {features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <Button className="w-full mt-3" variant={isRecommended ? "default" : "outline"} size="sm">
                  {plan.name} 시작하기
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center">한도는 팀원 공유 풀 · 언제든 해지 가능</p>
    </div>
  );
}

// ── 메인 체크아웃 내부 ─────────────────────────────────────────────────────────

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const mode = searchParams.get("mode"); // "update-payment-method"
  const from = searchParams.get("from") ?? "/billing";
  const { user } = useUser();
  const { orgId: activeClerkOrgId } = useAuth();

  const { data: orgs } = useOrganizations();
  const { data: subData } = useSubscription();
  const activeOrg =
    orgs?.find((o) => o.clerk_org_id === activeClerkOrgId) ?? orgs?.[0];
  const isTeam = activeOrg ? !activeOrg.is_default : false;

  // H-02: 팀이고 plan 미지정이면 플랜 선택 단계로
  const needPlanSelect = isTeam && !planParam && mode !== "update-payment-method";

  const [selectedPlan, setSelectedPlan] = useState<"pro" | "max" | null>(
    planParam === "max" ? "max" : planParam === "pro" ? "pro" : null
  );
  const effectivePlan = selectedPlan ?? (planParam as "pro" | "max" | null);

  const isUpdateMode = mode === "update-payment-method";
  const pageTitle = isUpdateMode ? "결제 수단 변경" : "구독 시작";
  const pageDesc = isUpdateMode
    ? "새 카드를 등록합니다."
    : effectivePlan === "max" ? "MAX 플랜으로 업그레이드합니다." : "Pro 플랜으로 업그레이드합니다.";

  const [orderState, setOrderState] = useState<OrderState>(
    needPlanSelect ? { phase: "selecting_plan" } : { phase: "creating" }
  );
  const [launching, setLaunching] = useState(false);
  const initiated = useRef(false);

  const createOrder = useCreateOrder();
  const initPaymentMethodUpdate = useInitPaymentMethodUpdate();
  const updateStatus = useUpdateOrderStatus();

  const expiresAt = orderState.phase === "ready" ? orderState.expiresAt : null;
  const { minutes, seconds, expired } = useCountdown(expiresAt);

  const initOrder = useCallback(async (plan: "pro" | "max") => {
    if (initiated.current) return;
    initiated.current = true;

    try {
      let result;
      if (isUpdateMode) {
        // H-03: 결제 수단 변경 모드
        result = await initPaymentMethodUpdate.mutateAsync();
      } else {
        result = await createOrder.mutateAsync({ plan, kind: "new_subscription" });
      }
      setOrderState({
        phase: "ready",
        orderId: result.orderId,
        customerKey: result.customerKey,
        amount: result.amount,
        orderName: result.orderName,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
    } catch (err) {
      setOrderState({ phase: "error", message: (err as Error).message });
    }
  }, [isUpdateMode, createOrder, initPaymentMethodUpdate]);

  useEffect(() => {
    if (orderState.phase !== "creating") return;
    const plan = effectivePlan ?? "pro";
    void initOrder(plan);
  }, [orderState.phase, effectivePlan, initOrder]);

  const handlePlanSelect = (plan: "pro" | "max") => {
    setSelectedPlan(plan);
    setOrderState({ phase: "creating" });
  };

  const handleBillingAuth = async () => {
    if (orderState.phase !== "ready") return;
    setLaunching(true);

    const { orderId, customerKey } = orderState;

    try {
      await updateStatus.mutateAsync({ orderId, status: "AUTH_READY" });

      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) throw new Error("NEXT_PUBLIC_TOSS_CLIENT_KEY is not set");

      const tossPayments = await loadTossPayments(clientKey);
      const appUrl = window.location.origin;
      const planForResult = isUpdateMode ? "" : `&plan=${effectivePlan ?? "pro"}`;
      const resultUrl = `${appUrl}/billing/checkout/result?orderId=${orderId}&from=${encodeURIComponent(from)}${planForResult}${isUpdateMode ? "&mode=update-payment-method" : ""}`;

      await tossPayments
        .payment({ customerKey })
        .requestBillingAuth({
          method: "CARD",
          successUrl: resultUrl,
          failUrl: resultUrl,
          customerEmail: user?.emailAddresses[0]?.emailAddress,
          customerName: user?.fullName ?? undefined,
        });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === "USER_CANCEL") {
        await updateStatus.mutateAsync({ orderId: orderState.orderId, status: "AUTH_CANCEL", reason: "user_cancel" }).catch(() => null);
      } else {
        await updateStatus.mutateAsync({ orderId: orderState.orderId, status: "AUTH_FAIL", reason: error.message ?? "unknown" }).catch(() => null);
      }
      setLaunching(false);
    }
  };

  const handleRetry = () => {
    initiated.current = false;
    setOrderState({ phase: "creating" });
    setLaunching(false);
  };

  // H-02: 플랜 선택 화면
  if (orderState.phase === "selecting_plan" || (needPlanSelect && !selectedPlan)) {
    return (
      <PageShell title="팀 구독" description="팀 플랜을 선택하세요.">
        <div className="max-w-2xl mx-auto">
          <PlanSelector onSelect={handlePlanSelect} />
        </div>
      </PageShell>
    );
  }

  // 결제 수단 변경 시 현재 구독 정보 표시
  const currentPeriodEnd = subData?.subscription?.current_period_end
    ? new Date(subData.subscription.current_period_end).toLocaleDateString("ko-KR")
    : null;

  return (
    <PageShell title={pageTitle} description={pageDesc}>
      <div className="max-w-md mx-auto">
        {orderState.phase === "creating" && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">주문을 생성하는 중...</p>
            </CardContent>
          </Card>
        )}

        {orderState.phase === "error" && (
          <Card className="border-red-200">
            <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <div>
                <p className="font-medium text-red-700">주문 생성에 실패했습니다</p>
                <p className="text-sm text-muted-foreground mt-1">{orderState.message}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.push("/billing")}>돌아가기</Button>
                <Button onClick={handleRetry}>다시 시도</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {orderState.phase === "ready" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="py-6 space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">{isUpdateMode ? "변경 유형" : "플랜"}</p>
                  <p className="font-semibold text-lg mt-0.5">{orderState.orderName}</p>
                </div>
                {isUpdateMode && currentPeriodEnd && (
                  <p className="text-xs text-muted-foreground bg-blue-50 rounded-md p-3">
                    결제 수단 변경 후 {currentPeriodEnd}에 자동 청구됩니다. 소급 청구는 없습니다.
                  </p>
                )}
                {!isUpdateMode && (
                  <div className="flex justify-between items-center border-t pt-4">
                    <span className="text-sm text-muted-foreground">월 결제 금액</span>
                    <span className="text-xl font-bold">₩{orderState.amount.toLocaleString()}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                  {isUpdateMode
                    ? "새 카드를 등록하면 다음 결제일부터 청구됩니다."
                    : "카드를 등록하면 첫 달 결제가 즉시 진행됩니다. 이후 매월 자동 청구됩니다."}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {expired ? (
                    <span className="text-red-500">주문이 만료되었습니다</span>
                  ) : (
                    <span>{minutes}분 {String(seconds).padStart(2, "0")}초 내 결제 필요</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => router.push("/billing")} disabled={launching}>
                취소
              </Button>
              <Button className="flex-1" disabled={launching || expired} onClick={handleBillingAuth}>
                {launching ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />카드 등록창 열기...</>
                ) : (
                  isUpdateMode ? "카드 변경" : "카드 등록 및 결제"
                )}
              </Button>
            </div>

            {expired && (
              <Button variant="outline" className="w-full" onClick={handleRetry}>
                새 주문으로 다시 시도
              </Button>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
