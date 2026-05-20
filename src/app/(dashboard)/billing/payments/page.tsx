"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CreditCard, ChevronRight } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayments } from "@/features/billing/hooks/use-billing";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PAY_SUCCESS: { label: "결제 완료", variant: "default" },
  PAY_WAITING: { label: "입금 대기", variant: "secondary" },
  PAY_FAIL: { label: "결제 실패", variant: "destructive" },
  PAY_EXPIRED: { label: "만료", variant: "outline" },
  PAY_CANCELED: { label: "전액 취소", variant: "outline" },
  PAY_CANCELED_PARTIAL: { label: "부분 취소", variant: "secondary" },
};

const ORDER_KIND_LABELS: Record<string, string> = {
  new_subscription:      "신규 구독",
  recurring:             "정기 갱신",
  plan_change:           "플랜 변경",
  payment_method_update: "결제 수단 변경",
  plan_upgrade:          "플랜 업그레이드",
};

const PLAN_CODE_LABELS: Record<string, string> = {
  free: "Free",
  pro:  "Pro",
  max:  "MAX",
};

function formatAmount(amount: string) {
  return `₩${Number(amount).toLocaleString()}`;
}

function buildOrderLabel(orderKind: string | null, planCode: string | null): string {
  const kindLabel = orderKind ? (ORDER_KIND_LABELS[orderKind] ?? orderKind) : "결제";
  const planLabel = planCode ? ` · ${PLAN_CODE_LABELS[planCode] ?? planCode} 플랜` : "";
  return `${kindLabel}${planLabel}`;
}

export default function PaymentsPage() {
  const { data: payments, isLoading } = usePayments();

  if (isLoading) {
    return (
      <PageShell title="결제 이력" description="결제 내역을 확인합니다.">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="결제 이력"
      description="결제 내역을 확인합니다."
      actions={
        <Link href="/billing">
          <Button variant="outline" size="sm">구독 관리</Button>
        </Link>
      }
    >
      {(!payments || payments.length === 0) ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">결제 내역이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {payments.map((payment) => {
            const statusInfo = STATUS_LABELS[payment.status] ?? { label: payment.status, variant: "outline" as const };
            const method = payment.method ?? "카드";
            const orderLabel = buildOrderLabel(payment.order_kind ?? null, payment.plan_code ?? null);

            return (
              <Link key={payment.id} href={`/billing/payments/${payment.payment_key}`}>
                <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={statusInfo.variant} className="text-[10px] shrink-0">
                            {statusInfo.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">{orderLabel}</span>
                          <span className="text-xs text-muted-foreground/60 truncate">{method}</span>
                        </div>
                        <p className="text-sm font-semibold mt-1 tabular-nums">{formatAmount(payment.amount)}</p>
                        {payment.approved_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(payment.approved_at), "yyyy년 M월 d일 HH:mm", { locale: ko })}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
