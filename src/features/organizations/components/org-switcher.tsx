"use client";

import { useRouter } from "next/navigation";
import { useClerk, useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, Plus, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useOrganizations } from "../hooks/use-organizations";

type Props = {
  onNavClick?: () => void;
};

export function OrgSwitcher({ onNavClick }: Props) {
  const router = useRouter();
  const { setActive } = useClerk();
  const { orgId: activeClerkOrgId } = useAuth();
  const { data: orgs, isLoading } = useOrganizations();
  const qc = useQueryClient();

  // 현재 활성 조직
  const activeOrg = orgs?.find((o) => o.clerk_org_id === activeClerkOrgId)
    ?? orgs?.find((o) => o.is_last_active)
    ?? orgs?.[0];

  // 조직 전환 — billing 쿼리 즉시 무효화하여 사이드바 구독 정보 갱신
  const handleSwitch = async (clerkOrgId: string) => {
    await setActive({ organization: clerkOrgId });
    void qc.invalidateQueries({ queryKey: ["billing"] });
    onNavClick?.();
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="px-2 py-1.5">
        <div className="h-8 rounded-md bg-sidebar-accent animate-pulse" />
      </div>
    );
  }

  if (!activeOrg) return null;

  const isPersonal = activeOrg.is_default;
  const isSoftDeleted = !!activeOrg.deleted_at;

  const caption = isSoftDeleted
    ? null
    : isPersonal
    ? "이곳에서 작성한 지침·콘텐츠는 본인만 볼 수 있습니다"
    : "조직 내 모든 멤버가 지침·콘텐츠를 공유합니다";

  return (
    <div className="px-2 pb-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground truncate">
                  {activeOrg.name}
                </span>
                {isPersonal && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                    기본
                  </Badge>
                )}
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60">
          {orgs?.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => handleSwitch(org.clerk_org_id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate text-sm">{org.name}</span>
              {org.is_default && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                  기본
                </Badge>
              )}
              {org.clerk_org_id === activeClerkOrgId && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              onNavClick?.();
              router.push("/org/new");
            }}
            className="cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            <span className="text-sm">새 조직 만들기</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              onNavClick?.();
              router.push("/org");
            }}
            className="cursor-pointer"
          >
            <span className="text-sm text-muted-foreground">조직 목록 보기</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {caption && (
        <p className="text-[10px] text-muted-foreground px-2 pb-1 leading-tight">
          {caption}
        </p>
      )}
    </div>
  );
}
