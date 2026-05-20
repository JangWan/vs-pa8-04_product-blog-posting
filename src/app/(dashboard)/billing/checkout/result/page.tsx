"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUpdateOrderStatus, useActivateOrder } from "@/features/billing/hooks/use-billing";

type ResultPhase = "confirming" | "success" | "fail";

export default function CheckoutResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">결제 결과를 확인하는 중...</p>
          </div>
        </div>
      </div>
    }>
      <CheckoutResultInner />
    </Suspense>
  );
}

function CheckoutResultInner() {
  const searchParams = useSearchParams();

  // 자동결제(빌링) 방식: authKey + customerKey + orderId
  // orderId는 successUrl/failUrl에 미리 심어뒀음
  const authKey = searchParams.get("authKey") ?? "";
  const customerKey = searchParams.get("customerKey") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  // 결제 완료 후 돌아갈 페이지
  const from = searchParams.get("from") ?? "/billing";
  // 결제한 플랜 (성공/실패 메시지 및 재시도 링크에 사용)
  const plan = searchParams.get("plan") ?? "pro";
  const planLabel = plan === "max" ? "MAX" : "Pro";
  const mode = searchParams.get("mode") ?? "";
  const isUpdateMode = mode === "update-payment-method";

  // failUrl로 리다이렉트된 경우 쿼리 파라미터 확인
  const errorCode = searchParams.get("code") ?? "";
  const errorMessage = searchParams.get("message") ?? "";

  const [phase, setPhase] = useState<ResultPhase>("confirming");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const updateStatus = useUpdateOrderStatus();
  const activateOrder = useActivateOrder();
  const activatedRef = useRef(false);

  useEffect(() => {
    // 중복 호출 방지 (BR-35: useRef 가드)
    if (activatedRef.current) return;
    activatedRef.current = true;

    // failUrl로 도착한 경우 (authKey 없음 또는 errorCode 있음)
    if (!authKey || !orderId || errorCode) {
      const msg = errorCode === "PAY_PROCESS_CANCELED"
        ? "사용자가 카드 등록을 취소했습니다."
        : errorMessage || "카드 등록에 실패했습니다.";
      setErrorMsg(msg);
      setPhase("fail");

      if (orderId) {
        updateStatus.mutateAsync({
          orderId,
          status: "AUTH_FAIL",
          reason: errorCode || "fail_redirect",
        }).catch(() => null);
      }
      return;
    }

    // 정상 successUrl 도착: 빌링키 발급 + 즉시 1회차 결제
    void (async () => {
      try {
        const result = await activateOrder.mutateAsync({ orderId, authKey, customerKey });

        if (result.ok && result.status === "PAY_SUCCESS") {
          // 영수증 URL 추출
          const data = result.data as Record<string, unknown> | null;
          const receipt = data?.receipt as { url?: string } | undefined;
          setReceiptUrl(receipt?.url ?? null);
          setPhase("success");
        } else {
          setErrorMsg("결제 승인에 실패했습니다.");
          setPhase("fail");
        }
      } catch (err) {
        setErrorMsg((err as Error).message ?? "결제 처리 중 오류가 발생했습니다.");
        setPhase("fail");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {phase === "confirming" && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">결제를 처리하는 중입니다...</p>
              <p className="text-xs text-muted-foreground">잠시만 기다려 주세요. 창을 닫지 마세요.</p>
            </CardContent>
          </Card>
        )}

        {phase === "success" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-green-200 bg-green-50/30">
              <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                >
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                </motion.div>
                <div>
                  <h1 className="text-xl font-bold text-green-800">
                    {isUpdateMode ? "결제 수단이 변경되었습니다!" : `${planLabel} 플랜이 활성화되었습니다!`}
                  </h1>
                  <p className="text-sm text-green-700 mt-2">
                    {isUpdateMode
                      ? "다음 결제일부터 새 카드로 청구됩니다."
                      : `모든 ${planLabel} 기능을 바로 사용할 수 있습니다.`}
                  </p>
                </div>

                <div className="flex flex-col gap-2 w-full mt-2">
                  {receiptUrl && !isUpdateMode && (
                    <Button variant="outline" asChild>
                      <a href={receiptUrl} target="_blank" rel="noreferrer">
                        영수증 확인
                      </a>
                    </Button>
                  )}
                  <Link href={from}>
                    <Button className="w-full">확인</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {phase === "fail" && (
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
              <XCircle className="h-14 w-14 text-red-400" />
              <div>
                <h1 className="text-xl font-bold text-red-700">결제에 실패했습니다</h1>
                {errorMsg && (
                  <p className="text-sm text-red-600 mt-2">{errorMsg}</p>
                )}
              </div>
              <div className="flex gap-2 w-full">
                <Link href={from} className="flex-1">
                  <Button variant="outline" className="w-full">돌아가기</Button>
                </Link>
                <Link
                  href={isUpdateMode
                    ? `/billing/checkout?mode=update-payment-method&from=${encodeURIComponent(from)}`
                    : `/billing/checkout?plan=${plan}&from=${encodeURIComponent(from)}`}
                  className="flex-1"
                >
                  <Button className="w-full">다시 시도</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
