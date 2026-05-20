"use client";

import { use, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { usePayment, useRequestRefund } from "@/features/billing/hooks/use-billing";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PAY_SUCCESS: { label: "결제 완료", variant: "default" },
  PAY_WAITING: { label: "입금 대기", variant: "secondary" },
  PAY_FAIL: { label: "결제 실패", variant: "destructive" },
  PAY_EXPIRED: { label: "만료", variant: "outline" },
  PAY_CANCELED: { label: "전액 취소", variant: "outline" },
  PAY_CANCELED_PARTIAL: { label: "부분 취소", variant: "secondary" },
};

export default function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentKey: string }>;
}) {
  const { paymentKey } = use(params);
  const { data: payment, isLoading } = usePayment(paymentKey);
  const requestRefund = useRequestRefund(paymentKey);

  const [reason, setReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <PageShell title="결제 상세" description="">
        <div className="space-y-4 max-w-lg">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </PageShell>
    );
  }

  if (!payment) {
    return (
      <PageShell title="결제 상세" description="">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            결제 정보를 찾을 수 없습니다.
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const statusInfo = STATUS_LABELS[payment.status] ?? { label: payment.status, variant: "outline" as const };
  const rawData = payment.raw_data as Record<string, unknown>;
  const receiptUrl = (rawData.receipt as { url?: string } | undefined)?.url;
  const method = payment.method ?? "카드";
  const canRefund = payment.status === "PAY_SUCCESS";

  return (
    <PageShell
      title="결제 상세"
      description=""
      actions={
        <Link href="/billing/payments">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </Button>
        </Link>
      }
    >
      <div className="space-y-4 max-w-lg">
        {/* 결제 정보 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">결제 정보</h2>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">결제 금액</span>
              <span className="font-semibold text-base">₩{Number(payment.amount).toLocaleString()}</span>
            </div>
            {payment.balance_amount !== payment.amount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">잔여 금액</span>
                <span>₩{Number(payment.balance_amount).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">결제 수단</span>
              <span>{method}</span>
            </div>
            {payment.approved_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">승인 일시</span>
                <span>{format(new Date(payment.approved_at), "yyyy년 M월 d일 HH:mm", { locale: ko })}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">결제키</span>
              <span className="font-mono text-xs truncate max-w-[200px]">{payment.payment_key}</span>
            </div>

            {receiptUrl && (
              <div className="pt-2 border-t">
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-primary text-sm hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  영수증 보기
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 환불 요청 카드 (UC-32) — PAY_SUCCESS만 표시 */}
        {canRefund && (
          <Card>
            <CardHeader className="pb-2">
              <h2 className="text-base font-semibold">환불 요청</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                환불은 관리자 승인 후 처리되며, 영업일 기준 3~5일 소요됩니다. 수수료 10%가 공제됩니다.
              </p>
              <div>
                <label className="text-sm font-medium" htmlFor="refund-reason">
                  환불 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="refund-reason"
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="환불 사유를 입력해 주세요."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={!reason.trim()}
                    onClick={() => setDialogOpen(true)}
                  >
                    환불 요청
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>환불 요청을 제출하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      관리자 승인 후 처리되며, 영업일 기준 3~5일 소요됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        requestRefund.mutate({ reason });
                        setDialogOpen(false);
                        setReason("");
                      }}
                    >
                      요청 제출
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
