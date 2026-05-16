"use client";

import { useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Settings, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountManagementModal } from "@/components/layout/account-modal";

export function UserDropdown() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  if (!isLoaded || !user) return null;

  const displayName =
    user.fullName ||
    user.firstName ||
    user.emailAddresses[0]?.emailAddress ||
    "사용자";
  const email = user.emailAddresses[0]?.emailAddress ?? "";
  const initial =
    (
      (user.firstName?.[0] ?? "") +
      (user.lastName?.[0] ?? "")
    ).toUpperCase() ||
    email[0]?.toUpperCase() ||
    "U";
  /* user.hasImage: Clerk 제공 boolean — 커스텀 업로드 이미지 여부 */

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full ring-2 ring-transparent hover:ring-primary/30 transition-all outline-none focus-visible:ring-primary/50"
            aria-label="사용자 메뉴"
          >
            <Avatar className="h-8 w-8">
              {user.hasImage && (
                <AvatarImage src={user.imageUrl} alt={displayName} />
              )}
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {initial}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium text-foreground truncate">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setModalOpen(true)}
            className="cursor-pointer"
          >
            <Settings className="h-4 w-4 mr-2 text-muted-foreground" />
            계정 관리
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleSignOut}
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
