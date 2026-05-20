"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

// Phase 6: plan/scheduled_plan/override_*/upgraded_* 제거 → plan_product_id 기반
export type Subscription = {
  id: string;
  organization_id: string;
  plan_product_id: string | null;
  pending_plan_product_id: string | null;
  status: string;
  next_billing_at: string | null;
  current_period_end: string | null;
  cancel_scheduled_at: string | null;
  past_due_since: string | null;
  payer_user_id: string | null;
  payer_warning: boolean;
  card_last4: string | null;
  card_company: string | null;
  created_at: string;
};

export type UsageQuota = {
  generations_used: number;
  translations_used: number;
  agent_runs_used: number;
};

export type UsageLimits = {
  generations: number;
  translations: number;
  agent_runs: number;
};

export type PlanDef = {
  code: string;
  name: string;
  price: number;
  max_members: number | null;
  generations_per_month: number;
  translations_per_month: number;
  agent_runs_per_month: number;
};

// Phase 5: DB 기반 플랜 상품 (plan_products 테이블)
export type PlanProduct = {
  id: string;
  team_type: string;
  plan_code: string;
  name: string;
  price: string;
  max_members: number | null;
  generations_per_month: number;
  translations_per_month: number;
  agent_runs_per_month: number;
};

export type PaymentItem = {
  id: string;
  payment_key: string;
  order_id: string;
  method: string | null;
  status: string;
  amount: string;
  balance_amount: string;
  approved_at: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // D-4: JOIN으로 추가된 컨텍스트 (null 가능 — leftJoin)
  order_kind: string | null;
  plan_code: string | null;
};

// Phase 5: subscription_history 이벤트 타입
export type SubscriptionHistoryItem = {
  id: string;
  subscription_id: string;
  organization_id: string;
  kind: string;
  plan_product_id: string | null;
  target_plan_product_id: string | null;
  period_start: string | null;
  period_end: string | null;
  next_billing_at: string | null;
  order_id: string | null;
  changed_by: string;
  created_at: string;
};

export type OrderCreateResult = {
  orderId: string;
  customerKey: string;
  amount: number;
  orderName: string;
  successUrl: string;
  failUrl: string;
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── 플랜 카탈로그 (공개) ────────────────────────────────────────────────────

export function usePlans() {
  return useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () =>
      apiFetch<{ plans: PlanDef[] }>("/api/billing/plans").then((r) => r.plans),
    staleTime: 60_000,
  });
}

// ─── DB 기반 플랜 상품 목록 (Phase 5) ────────────────────────────────────────
export function usePlanProducts(teamType?: "personal" | "team") {
  return useQuery({
    queryKey: ["billing", "plan-products", teamType],
    queryFn: () =>
      apiFetch<{ plan_products: PlanProduct[] }>("/api/billing/plan-products").then(
        (r) => teamType ? r.plan_products.filter((p) => p.team_type === teamType) : r.plan_products
      ),
    staleTime: 60_000 * 10,
  });
}

// ─── 현재 구독 상태 ──────────────────────────────────────────────────────────
// orgId를 queryKey에 포함해 조직 전환 시 캐시가 분리되도록 한다

export function useSubscription() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ["billing", "subscription", orgId],
    queryFn: () =>
      apiFetch<{
        subscription: Subscription | null;
        card_display: string | null;
        current_plan: string;
        is_default: boolean;
      }>("/api/billing/subscription"),
    staleTime: 30_000,
    enabled: !!orgId,
  });
}

// Phase 5: 구독 결제 이벤트 이력
export function useSubscriptionHistory() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ["billing", "subscription-history", orgId],
    queryFn: () =>
      apiFetch<{ history: SubscriptionHistoryItem[] }>("/api/billing/subscription-history").then((r) => r.history),
    staleTime: 60_000,
    enabled: !!orgId,
  });
}

// ─── 이번 달 사용량 ──────────────────────────────────────────────────────────

export function useBillingUsage() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ["billing", "usage", orgId],
    queryFn: () =>
      apiFetch<{ period_month: string; usage: UsageQuota; limits: UsageLimits }>("/api/billing/usage"),
    staleTime: 60_000,
    enabled: !!orgId,
  });
}

// ─── 주문 생성 (UC-28 §3) ────────────────────────────────────────────────────

export function useCreateOrder() {
  return useMutation({
    mutationFn: (body: { plan: "pro" | "max"; kind: "new_subscription" }) =>
      apiFetch<OrderCreateResult>("/api/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 주문 상태 전환 ──────────────────────────────────────────────────────────

export function useUpdateOrderStatus() {
  return useMutation({
    mutationFn: ({ orderId, status, reason }: { orderId: string; status: string; reason?: string }) =>
      apiFetch<{ ok: boolean; status: string }>(`/api/billing/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      }),
  });
}

// ─── activate (UC-28 빌링키 발급 + 즉시결제) ─────────────────────────────────

export function useActivateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, authKey, customerKey }: { orderId: string; authKey: string; customerKey: string }) =>
      apiFetch<{ ok: boolean; status: string; paymentKey?: string; data: unknown }>(
        `/api/billing/orders/${orderId}/activate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authKey, customerKey }),
        }
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing"] });
      void qc.invalidateQueries({ queryKey: ["organizations"] });
      void qc.refetchQueries({ queryKey: ["billing"] });
      void qc.refetchQueries({ queryKey: ["organizations"] });
    },
  });
}

// ─── 즉시 취소 (서비스 미사용 전액 환불) ────────────────────────────────────

export function useCancelImmediateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/billing/subscription/cancel-immediate", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing"] });
      void qc.invalidateQueries({ queryKey: ["organizations"] });
      void qc.refetchQueries({ queryKey: ["billing"] });
      void qc.refetchQueries({ queryKey: ["organizations"] });
      toast.success("구독이 즉시 취소되었습니다 · 결제 금액이 환불됩니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 해지 예약 (UC-31) ───────────────────────────────────────────────────────

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; current_period_end: string }>("/api/billing/subscription/cancel", {
        method: "POST",
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      const date = data.current_period_end
        ? new Date(data.current_period_end).toLocaleDateString("ko-KR")
        : "";
      toast.success(`구독 해지가 예약되었습니다 · ${date}까지 Pro 기능을 사용할 수 있습니다.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 해지 예약 취소 (UC-38) ──────────────────────────────────────────────────

export function useResumeCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/billing/subscription/cancel", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success("해지 예약이 취소되었습니다 · 구독이 정상 유지됩니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── C-11: Pro→MAX 업그레이드 ─────────────────────────────────────────────────

export function useUpgradeToMax() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; charged_amount: number }>("/api/billing/subscription/upgrade", { method: "POST" }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["billing"] });
      void qc.invalidateQueries({ queryKey: ["organizations"] });
      void qc.refetchQueries({ queryKey: ["billing"] });
      void qc.refetchQueries({ queryKey: ["organizations"] });
      const amount = data.charged_amount?.toLocaleString() ?? "";
      toast.success(`MAX 플랜으로 업그레이드되었습니다 · ₩${amount} 즉시 결제`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── C-12: MAX→Pro 다운그레이드 예약 ─────────────────────────────────────────

export function useScheduleDowngrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/billing/subscription/downgrade", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success("다음 결제일부터 Pro 플랜으로 전환됩니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── C-14: 다운그레이드 예약 취소 ────────────────────────────────────────────

export function useCancelScheduledDowngrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/billing/subscription/downgrade", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success("다운그레이드 예약이 취소되었습니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── H-03: 결제 수단 변경 주문 생성 ──────────────────────────────────────────

export function useInitPaymentMethodUpdate() {
  return useMutation({
    mutationFn: () =>
      apiFetch<OrderCreateResult>("/api/billing/subscription/payment-method/init", { method: "POST" }),
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── H-05: 팀 탈퇴 ───────────────────────────────────────────────────────────

export function useLeaveOrganization(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>(`/api/org/${orgId}/leave`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["organizations"] });
      void qc.refetchQueries({ queryKey: ["organizations"] });
      toast.success("팀을 탈퇴했습니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── H-06: 사용자 탈퇴 ───────────────────────────────────────────────────────

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/user", { method: "DELETE" }),
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 결제 이력 ───────────────────────────────────────────────────────────────

export function usePayments() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ["billing", "payments", orgId],
    queryFn: () =>
      apiFetch<{ payments: PaymentItem[]; next_cursor: null }>("/api/billing/payments").then((r) => r.payments),
    staleTime: 30_000,
    enabled: !!orgId,
  });
}

// ─── 결제 단건 ───────────────────────────────────────────────────────────────

export function usePayment(paymentKey: string) {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ["billing", "payments", orgId, paymentKey],
    queryFn: () =>
      apiFetch<{ payment: PaymentItem }>(`/api/billing/payments/${paymentKey}`).then((r) => r.payment),
    enabled: !!orgId && !!paymentKey,
  });
}

// ─── 환불 요청 (UC-32) ───────────────────────────────────────────────────────

export function useRequestRefund(paymentKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: string }) =>
      apiFetch<{ ok: boolean; refund_amount: number }>(
        `/api/billing/payments/${paymentKey}/cancel-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "payments"] });
      toast.success("환불 요청이 접수되었습니다 · 관리자 승인 후 처리됩니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
