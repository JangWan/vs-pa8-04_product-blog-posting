"use client";

import { useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useOrgMembers,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/features/organizations/hooks/use-organizations";
import type { OrgDetail } from "@/features/organizations/hooks/use-organizations";

type Props = { org: OrgDetail };

export function MembersTab({ org }: Props) {
  const { data: memberData, isLoading } = useOrgMembers(org.id);
  const invite = useInviteMember(org.id);
  const updateRole = useUpdateMemberRole(org.id);
  const removeMember = useRemoveMember(org.id);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  const isPersonal = org.is_default;
  // Phase 6: plan_product_id 유무로 유료 여부 판단 (서버에서 validateInviteCapacity로 상한 검증)
  const hasActivePlan = !!org.plan_product_id;
  const currentCount = memberData?.members.length ?? 0;
  const atLimit = !hasActivePlan && currentCount >= 1;
  const maxMembersLabel = hasActivePlan ? "무제한" : "1";

  const handleInvite = async () => {
    await invite.mutateAsync({ email: inviteEmail, role: inviteRole });
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("member");
  };

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  // 기본 팀(개인 워크스페이스)은 멤버 관리 기능 없음
  if (isPersonal) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        기본 팀은 멤버 관리 기능이 없습니다.
        <br />
        기본 팀은 본인만 사용하는 개인 워크스페이스입니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 — 멤버 수 + 초대 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {currentCount}/{maxMembersLabel}명
        </p>

        {!isPersonal ? (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={atLimit}
                title={atLimit ? "플랜 업그레이드가 필요합니다" : undefined}
              >
                <UserPlus className="h-4 w-4" />
                멤버 초대
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>멤버 초대</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">이메일</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>역할</Label>
                  <RadioGroup
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as "admin" | "member")}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="member" id="role-member" />
                      <Label htmlFor="role-member" className="font-normal cursor-pointer">멤버</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="admin" id="role-admin" />
                      <Label htmlFor="role-admin" className="font-normal cursor-pointer">관리자</Label>
                    </div>
                  </RadioGroup>
                </div>
                <p className="text-xs text-muted-foreground">
                  현재 {currentCount}/{maxMembersLabel}명 가입 중
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>취소</Button>
                <Button onClick={handleInvite} disabled={!inviteEmail || invite.isPending}>
                  {invite.isPending ? "발송 중..." : "초대 발송"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button size="sm" disabled title="Personal Org는 멤버 초대가 불가능합니다.">
            <UserPlus className="h-4 w-4 mr-1.5" />
            멤버 초대
          </Button>
        )}
      </div>

      {/* 멤버 테이블 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이메일</TableHead>
              <TableHead>역할</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberData?.members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell className="text-sm">{member.email}</TableCell>
                <TableCell>
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      updateRole.mutate({ userId: member.userId, role: role as "admin" | "member" })
                    }
                    disabled={isPersonal}
                  >
                    <SelectTrigger className="w-28 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">관리자</SelectItem>
                      <SelectItem value="member">멤버</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {!isPersonal && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>멤버를 제거하시겠습니까?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {member.email}을(를) 조직에서 제거합니다.
                            해당 멤버는 즉시 접근 권한을 잃습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeMember.mutate(member.userId)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            제거
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 보류 중 초대 */}
      {(memberData?.pending_invitations?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">보류 중 초대</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이메일</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>만료일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberData?.pending_invitations.map((inv) => (
                  <TableRow key={inv.invitation_id}>
                    <TableCell className="text-sm">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {inv.role === "admin" ? "관리자" : "멤버"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
