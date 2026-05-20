"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useClerk, useAuth } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Pencil,
  BookOpen,
  History,
  PenLine,
  Settings,
  LogOut,
  Building2,
  CreditCard,
  Zap,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountManagementModal } from "@/components/layout/account-modal";
import { OrgSwitcher } from "@/features/organizations/components/org-switcher";
import { useOrganizations } from "@/features/organizations/hooks/use-organizations";
import { useBillingUsage, useSubscription } from "@/features/billing/hooks/use-billing";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  badge?: string;
};

const baseNavItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/generate", icon: Pencil, label: "콘텐츠 생성" },
  { href: "/guidelines", icon: BookOpen, label: "AI 지침 관리" },
  { href: "/history", icon: History, label: "생성 이력" },
];

const adminNavItems: NavItem[] = [
  { href: "/org", icon: Building2, label: "조직 설정" },
  { href: "/billing", icon: CreditCard, label: "결제·플랜" },
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
      <DropdownMenu modal={false}>
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

function NavLink({
  href,
  icon: Icon,
  label,
  disabled,
  badge,
  pathname,
  onNavClick,
}: NavItem & { pathname: string; onNavClick?: () => void }) {
  const isActive = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={disabled ? "#" : href}
      aria-disabled={disabled}
      onClick={(e) => {
        if (disabled) e.preventDefault();
        else onNavClick?.();
      }}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors relative",
        isActive
          ? "bg-sidebar-accent text-foreground font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-primary before:rounded-full"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
    </Link>
  );
}

export function Sidebar({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();
  const { orgId: activeClerkOrgId } = useAuth();
  const { data: orgs } = useOrganizations();

  // Clerk 세션의 활성 orgId 기준으로 찾아야 setActive 직후 즉시 반응
  const activeOrg =
    orgs?.find((o) => o.clerk_org_id === activeClerkOrgId) ?? orgs?.[0];
  const isAdmin = activeOrg?.role === "admin";

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

      {/* 조직 스위처 */}
      <div className="border-b border-sidebar-border py-2">
        <OrgSwitcher onNavClick={onNavClick} />
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {baseNavItems.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} onNavClick={onNavClick} />
        ))}

        {/* org:admin 전용 메뉴 */}
        {isAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                관리
              </p>
            </div>
            {adminNavItems.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} onNavClick={onNavClick} />
            ))}
          </>
        )}
      </nav>

      {/* 플랜 뱃지 + 사용량 위젯 (admin만) */}
      {isAdmin && <SidebarUsageWidget onNavClick={onNavClick} />}

      {/* 사용자 버튼 */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <SidebarUserButton />
      </div>
    </aside>
  );
}

function SidebarUsageWidget({ onNavClick }: { onNavClick?: () => void }) {
  const { orgId: activeClerkOrgId } = useAuth();
  const { data: orgs } = useOrganizations();
  const { data: subData } = useSubscription();
  const { data: usageData } = useBillingUsage();

  // Clerk 세션 기준으로 활성 org 판별 — setActive 직후 즉시 반응
  const activeOrg =
    orgs?.find((o) => o.clerk_org_id === activeClerkOrgId) ?? orgs?.[0];
  const currentPlanCode = subData?.current_plan ?? "free";
  const isPersonal = activeOrg?.is_default ?? true;
  const hasPaidPlan = !!activeOrg?.plan_product_id;
  const isTeamFree = !isPersonal && !hasPaidPlan;
  const isPro = hasPaidPlan;
  const isMax = currentPlanCode === "max";

  const subStatus = subData?.subscription?.status ?? null;
  const isPastDue = subStatus === "past_due";
  const isSuspended = subStatus === "suspended";
  const isCancelScheduled = subStatus === "cancel_scheduled";

  const used = usageData?.usage.generations_used ?? 0;
  const limit = usageData?.limits.generations ?? 10;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-primary";

  // H-09: 팀 구독없음 뷰
  if (isTeamFree) {
    return (
      <div className="px-3 pb-2 border-t border-sidebar-border pt-3 shrink-0 space-y-2">
        <p className="text-[10px] text-muted-foreground/70">팀 구독</p>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
            구독없음
          </Badge>
          <span className="text-xs text-muted-foreground">팀 구독 없음</span>
        </div>
        <p className="text-xs text-muted-foreground">팀 기능을 사용하려면 구독이 필요합니다.</p>
        <Link href="/billing" onClick={onNavClick}>
          <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5 mt-1 border-amber-400 text-amber-600 hover:bg-amber-50">
            <Zap className="h-3 w-3" />
            구독 시작
          </Button>
        </Link>
      </div>
    );
  }

  // 상태 우선순위: 정지 > 연체 > 해지예약 > MAX > Pro > Free
  const planLabel = isSuspended ? "정지"
    : isPastDue ? "연체"
    : isCancelScheduled ? (isMax ? "MAX" : "Pro")
    : isMax ? "MAX"
    : isPro ? "Pro"
    : "Free";

  const badgeClassName = cn(
    "text-[10px]",
    isSuspended && "bg-orange-500 text-white border-0",
    isPastDue && !isSuspended && "bg-red-500 text-white border-0",
    isCancelScheduled && !isSuspended && !isPastDue && "border-amber-400 text-amber-600",
    isMax && !isSuspended && !isPastDue && !isCancelScheduled && "bg-purple-600 text-white border-0",
  );

  const contextLabel = isPersonal ? "개인 구독" : "팀 구독";

  return (
    <div className="px-3 pb-2 border-t border-sidebar-border pt-3 shrink-0 space-y-2">
      <p className="text-[10px] text-muted-foreground/70">{contextLabel}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge
            variant={isCancelScheduled ? "outline" : isPro ? "default" : "secondary"}
            className={badgeClassName}
          >
            {planLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">콘텐츠 생성</span>
        </div>
        <span className="text-xs text-muted-foreground">{used}/{limit}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* 개인 free만 해당 — 유료 구독 전환은 결제·플랜 페이지에서 처리 */}
      {!isPro && (
        <Link href="/billing/checkout?plan=pro&from=%2Fbilling" onClick={onNavClick}>
          <Button size="sm" className="w-full h-7 text-xs gap-1.5 mt-1">
            <Zap className="h-3 w-3" />
            업그레이드
          </Button>
        </Link>
      )}
    </div>
  );
}
