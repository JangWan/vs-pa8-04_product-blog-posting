"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Pencil,
  BookOpen,
  History,
  PenLine,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountManagementModal } from "@/components/layout/account-modal";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  badge?: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/generate", icon: Pencil, label: "콘텐츠 생성" },
  { href: "/guidelines", icon: BookOpen, label: "AI 지침 관리" },
  { href: "/history", icon: History, label: "생성 이력", disabled: true, badge: "예정" },
];

function SidebarUserButton() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  if (!isLoaded) return <Skeleton className="h-10 w-full rounded-md" />;
  if (!user) return null;

  const displayName =
    user.fullName ||
    user.firstName ||
    user.emailAddresses[0]?.emailAddress ||
    "사용자";
  const email = user.emailAddresses[0]?.emailAddress ?? "";
  const initial =
    (
      (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")
    ).toUpperCase() ||
    email[0]?.toUpperCase() ||
    "U";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-sidebar-accent transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Avatar className="h-7 w-7 shrink-0">
              {user.hasImage && (
                <AvatarImage src={user.imageUrl} alt={displayName} />
              )}
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-52">
          <DropdownMenuItem
            onClick={() => setModalOpen(true)}
            className="cursor-pointer"
          >
            <Settings className="h-4 w-4 mr-2 text-muted-foreground" />
            계정 관리
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await signOut();
              router.replace("/");
            }}
            className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-50"
          >
            <LogOut className="h-4 w-4 mr-2" />
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AccountManagementModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

export function Sidebar({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col h-full w-64 bg-sidebar border-r border-sidebar-border">
      {/* 로고 */}
      <div className="h-14 px-4 flex items-center border-b border-sidebar-border shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity"
          onClick={onNavClick}
        >
          <PenLine className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">IndiePost AI</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label, disabled, badge }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={disabled ? "#" : href}
              aria-disabled={disabled}
              onClick={(e) => {
                if (disabled) e.preventDefault();
                else onNavClick?.();
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors relative",
                isActive
                  ? /* 활성: Sage Green 좌측 2px 보더 + Warm White 배경 */
                    "bg-sidebar-accent text-foreground font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-primary before:rounded-full"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60",
                disabled && "opacity-40 cursor-not-allowed pointer-events-none"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="text-xs text-muted-foreground">{badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 사용자 버튼 */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <SidebarUserButton />
      </div>
    </aside>
  );
}
