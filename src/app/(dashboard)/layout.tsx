import { Sidebar } from "@/components/layout/sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 데스크톱 사이드바 (md 이상) */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* 메인 영역 */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* 모바일 헤더 (md 미만) */}
        <MobileHeader />

        {/* 페이지 콘텐츠 — 공통 좌우 여백 및 상하 패딩 (모든 페이지 통일) */}
        <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 sm:px-6 lg:px-10 py-8">
          {children}
        </main>
      </div>

      <Toaster position="bottom-right" richColors />
    </div>
  );
}
