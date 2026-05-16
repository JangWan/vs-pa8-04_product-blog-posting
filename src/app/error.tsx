"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white text-center px-4">
      <p className="text-6xl font-bold text-destructive mb-4">500</p>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        서버 오류가 발생했습니다
      </h1>
      <p className="text-muted-foreground mb-8">
        잠시 후 다시 시도해주세요.
      </p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={reset}
          style={{ borderRadius: "4px" }}
        >
          다시 시도
        </Button>
        <Link href="/">
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            style={{ borderRadius: "4px" }}
          >
            홈으로
          </Button>
        </Link>
      </div>
    </div>
  );
}
