"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type OrgItem = {
  id: string;
  clerk_org_id: string;
  name: string;
  slug: string;
  /** Phase 6: plan 컬럼 제거 → plan_product_id FK */
  plan_product_id: string | null;
  /** 기본 팀(Personal Org) 영구 플래그 */
  is_default: boolean;
  deleted_at: string | null;
  role: "admin" | "member";
  member_count: number;
  /** 사용자의 마지막 활성 조직 여부 (users.default_organization_id 기반) */
  is_last_active: boolean;
};

export type OrgDetail = OrgItem & { role: "admin" | "member" };

export type MemberItem = {
  userId: string;
  email: string;
  role: "admin" | "member";
  joined_at: string;
};

export type PendingInvitation = {
  invitation_id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── 조직 목록 ───────────────────────────────────────────────────────────────

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: () =>
      apiFetch<{ data: OrgItem[] }>("/api/org").then((r) => r.data),
    staleTime: 30_000,
  });
}

// ─── 조직 단건 ───────────────────────────────────────────────────────────────

export function useOrganization(id: string) {
  return useQuery({
    queryKey: ["organizations", id],
    queryFn: () => apiFetch<OrgDetail>(`/api/org/${id}`),
    enabled: !!id,
  });
}

// ─── 조직 생성 (UC-23) ───────────────────────────────────────────────────────

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; slug?: string }) =>
      apiFetch<{ id: string; clerk_org_id: string; slug: string }>("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
      toast.success(`조직 '${vars.name}'이(가) 생성되었습니다.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 조직 수정 ───────────────────────────────────────────────────────────────

export function useUpdateOrganization(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; slug?: string }) =>
      apiFetch<{ id: string; name: string; slug: string }>(`/api/org/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations", id] });
      qc.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("조직 정보가 수정되었습니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 조직 삭제 soft delete (UC-26) ───────────────────────────────────────────

export function useDeleteOrganization(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: boolean }>(`/api/org/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("조직이 삭제 예정 상태로 전환되었습니다 · 30일 내 복원 가능합니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 조직 복원 (UC-27) ───────────────────────────────────────────────────────

export function useRestoreOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ restored: boolean }>(`/api/org/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("조직이 복원되었습니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── 멤버 목록 ───────────────────────────────────────────────────────────────

export function useOrgMembers(orgId: string) {
  return useQuery({
    queryKey: ["organizations", orgId, "members"],
    queryFn: () =>
      apiFetch<{ members: MemberItem[]; pending_invitations: PendingInvitation[] }>(
        `/api/org/${orgId}/members`
      ),
    enabled: !!orgId,
  });
}

// ─── 멤버 초대 (UC-24) ───────────────────────────────────────────────────────

export function useInviteMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: "admin" | "member" }) =>
      apiFetch<{ invitation_id: string }>(`/api/org/${orgId}/members/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
      toast.success(`${vars.email}로 초대 메일을 발송했습니다.`);
    },
    onError: (err: Error) => {
      if (err.message.includes("MEMBER_LIMIT_EXCEEDED")) {
        toast.error("현재 플랜의 멤버 한도에 도달했습니다. 플랜을 업그레이드하세요.");
      } else {
        toast.error(err.message);
      }
    },
  });
}

// ─── 역할 변경 (UC-25) ───────────────────────────────────────────────────────

export function useUpdateMemberRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "member" }) =>
      apiFetch<{ user_id: string; role: string }>(
        `/api/org/${orgId}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
      toast.success(`역할이 ${vars.role === "admin" ? "관리자" : "멤버"}로 변경되었습니다.`);
    },
    onError: (err: Error) => {
      if (err.message.includes("LAST_ADMIN")) {
        toast.error("마지막 관리자는 강등할 수 없습니다 · 먼저 다른 멤버를 관리자로 승격하세요.");
      } else {
        toast.error(err.message);
      }
    },
  });
}

// ─── 멤버 제거 (UC-25) ───────────────────────────────────────────────────────

export function useRemoveMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/org/${orgId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
      toast.success("멤버가 제거되었습니다.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
