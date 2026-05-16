"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserRound, Info } from "lucide-react";
import { ProfileTab } from "@/components/layout/account-tabs/profile-tab";
import { AccountInfoTab } from "@/components/layout/account-tabs/account-info-tab";

type Tab = "profile" | "account";

const TABS: { id: Tab; label: string; Icon: typeof UserRound }[] = [
  { id: "profile", label: "프로필 수정", Icon: UserRound },
  { id: "account", label: "계정 정보", Icon: Info },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AccountManagementModal({ open, onClose }: Props) {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  if (!user) return null;

  const displayName =
    user.fullName ||
    user.firstName ||
    user.emailAddresses[0]?.emailAddress ||
    "사용자";
  const initial = displayName[0]?.toUpperCase() ?? "U";
  const hasCustomImage =
    user.imageUrl &&
    !user.imageUrl.includes("gravatar") &&
    !user.imageUrl.includes("img.clerk");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        {/* 스크린리더용 숨김 타이틀 */}
        <DialogTitle className="sr-only">계정 관리</DialogTitle>

        <div className="flex h-[520px]">
          {/* ── 좌측 사이드바 ── */}
          <aside className="w-52 bg-secondary border-r border-border flex flex-col shrink-0">
            {/* 사용자 요약 */}
            <div className="px-4 py-5 border-b border-border">
              {hasCustomImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.imageUrl}
                  alt={displayName}
                  className="h-10 w-10 rounded-full object-cover border border-border mb-2"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mb-2">
                  <span className="text-sm font-semibold text-primary">
                    {initial}
                  </span>
                </div>
              )}
              <p className="text-sm font-medium text-foreground truncate">
                {displayName}
              </p>
            </div>

            {/* 탭 메뉴 */}
            <nav className="p-2 flex-1">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors text-left ${
                    activeTab === id
                      ? "bg-background shadow-sm text-foreground font-medium"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  }`}
                  style={{ borderRadius: "6px" }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          {/* ── 우측 콘텐츠 ── */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {activeTab === "profile" ? <ProfileTab /> : <AccountInfoTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
