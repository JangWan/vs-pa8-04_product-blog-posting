import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white text-center px-4">
      <p className="text-6xl font-bold text-primary mb-4">404</p>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="text-muted-foreground mb-8">
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </p>
      <Link href="/">
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          style={{ borderRadius: "4px" }}
        >
          홈으로 돌아가기
        </Button>
      </Link>
    </div>
  );
}
