import Link from "next/link";
import { PenLine } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* 로고 */}
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PenLine className="h-4 w-4 text-primary" />
            <span>IndiePost AI</span>
          </div>

          {/* 저작권 + 링크 */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>© 2026 IndiePost AI</span>
            <Link
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
              개인정보처리방침
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
