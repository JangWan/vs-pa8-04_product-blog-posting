"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { PenLine } from "lucide-react";
import { UserDropdown } from "@/components/layout/user-dropdown";

export function PublicHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-header">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* 로고 */}
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity"
            >
              <PenLine className="h-5 w-5 text-primary" />
              <span>IndiePost AI</span>
            </Link>
          </Show>
          <Show when="signed-out">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity"
            >
              <PenLine className="h-5 w-5 text-primary" />
              <span>IndiePost AI</span>
            </Link>
          </Show>

          {/* 네비게이션 */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              기능
            </Link>
          </nav>

          {/* CTA 버튼 */}
          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <div className="flex items-center">
                <Link href="/sign-in">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-sm font-medium"
                  >
                    로그인
                  </Button>
                </Link>
                <span className="text-border select-none">|</span>
                <Link href="/sign-up">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-sm font-medium"
                  >
                    회원가입
                  </Button>
                </Link>
              </div>
            </Show>
            <UserDropdown />
            <Show when="signed-in">
              <Link href="/dashboard">
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
                  style={{ borderRadius: "4px" }}
                >
                  대시보드
                </Button>
              </Link>
            </Show>
          </div>
        </div>
      </div>
    </header>
  );
}
