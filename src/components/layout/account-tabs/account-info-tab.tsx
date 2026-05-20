"use client";

import { useState, useEffect } from "react";
import { useUser, useClerk, useSession } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  Monitor,
  Cpu,
  Globe,
  Loader2,
  Trash2,
  ShieldAlert,
  Smartphone,
  LogOut,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSessionInfo } from "@/features/user-profile/hooks/use-session-info";
import { useDeleteAccount } from "@/features/billing/hooks/use-billing";

/* user.getSessions()의 실제 반환 형태 — SessionWithActivitiesResource */
type SessionWithActivity = {
  id: string;
  revoke: () => Promise<unknown>;
  latestActivity?: {
    ipAddress?: string | null;
    browserName?: string | null;
    osName?: string | null;
    deviceType?: string | null;
    isMobile?: boolean;
  } | null;
};

export function AccountInfoTab() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { session: currentSession } = useSession();
  const router = useRouter();
  const { ip, os, browser, isLoading: sessionInfoLoading } = useSessionInfo();
  const deleteAccount = useDeleteAccount();

  const [sessions, setSessions] = useState<SessionWithActivity[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /* user.getSessions()는 SessionWithActivitiesResource[]를 반환 — latestActivity 포함 */
  useEffect(() => {
    if (!user) return;
    user
      .getSessions()
      .then((result) => setSessions(result as SessionWithActivity[]))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoaded(true));
  }, [user]);

  if (!user) return null;

  const email = user.emailAddresses[0]?.emailAddress ?? "";
  const createdAt = user.createdAt
    ? format(new Date(user.createdAt), "PPP", { locale: ko })
    : "-";
  const lastSignIn = user.lastSignInAt
    ? format(new Date(user.lastSignInAt), "PPP HH:mm", { locale: ko })
    : "-";

  /* ── 세션 원격 종료 ── */
  async function handleRevoke(sessionId: string) {
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;
    setRevokingId(sessionId);
    try {
      await target.revoke();
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } finally {
      setRevokingId(null);
    }
  }

  /* ── 계정 삭제 (H-06: DELETE /api/user → 구독·팀 정리 후 Clerk 삭제) ── */
  async function handleDelete() {
    if (!user) return;
    if (deleteConfirm !== "계정삭제") {
      setDeleteError('"계정삭제"를 정확히 입력하세요.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await deleteAccount.mutateAsync();
      await signOut();
      router.replace("/");
    } catch (err: unknown) {
      const message = (err as Error).message ?? "";
      if (message.includes("ADMIN_HANDOFF_REQUIRED")) {
        setDeleteError("다른 팀 관리자를 지정하거나 팀을 삭제한 후 다시 시도하세요.");
      } else {
        setDeleteError(message || "계정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
      setDeleteLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full">
      {/* ── 기본 정보 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          기본 정보
        </h3>
        <dl className="space-y-2.5">
          {(
            [
              ["이메일", email],
              ["가입일", createdAt],
              ["마지막 로그인", lastSignIn],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <dt className="w-28 text-muted-foreground shrink-0">{label}</dt>
              <dd className="text-foreground truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── 현재 접속 기기 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          현재 접속 기기
        </h3>
        {sessionInfoLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <dl className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <dt className="w-20 text-muted-foreground">IP</dt>
              <dd className="text-foreground">{ip ?? "알 수 없음"}</dd>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
              <dt className="w-20 text-muted-foreground">OS</dt>
              <dd className="text-foreground">{os}</dd>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
              <dt className="w-20 text-muted-foreground">브라우저</dt>
              <dd className="text-foreground">{browser}</dd>
            </div>
          </dl>
        )}
      </section>

      {/* ── 활성 세션 목록 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          활성 세션
        </h3>
        {!sessionsLoaded ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">세션 정보가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => {
              const activity = session.latestActivity;
              const isCurrent = session.id === currentSession?.id;
              const browserName = activity?.browserName ?? null;
              const osName = activity?.osName ?? null;
              const deviceLabel =
                browserName && osName
                  ? `${browserName} / ${osName}`
                  : browserName ?? osName ?? "기기 정보 없음";

              return (
                <li
                  key={session.id}
                  className={`flex items-start justify-between gap-3 p-3 rounded-md border ${
                    isCurrent
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {activity?.isMobile ? (
                      <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    ) : (
                      <Monitor className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {deviceLabel}
                        {isCurrent && (
                          <span className="ml-2 text-primary">(현재)</span>
                        )}
                      </p>
                      {activity?.ipAddress && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          IP: {activity.ipAddress}
                        </p>
                      )}
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(session.id)}
                      disabled={revokingId === session.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-60 shrink-0"
                      style={{ borderRadius: "4px" }}
                    >
                      {revokingId === session.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <LogOut className="h-3 w-3" />
                      )}
                      종료
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 계정 삭제 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          계정 삭제
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 p-3 rounded-md bg-red-50 border border-red-100">
            <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm text-red-600">
                계정을 삭제하면 모든 데이터가 영구 삭제되며 복구할 수 없습니다.
              </p>
              <p className="text-xs text-red-500">
                활성 구독은 현재 기간 만료 시 자동 해지됩니다.
                혼자인 팀은 즉시 삭제됩니다.
                다른 멤버가 있는 팀의 관리자라면 먼저 관리자를 이전하세요.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              확인을 위해{" "}
              <strong className="text-foreground">계정삭제</strong>를 입력하세요
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => {
                setDeleteConfirm(e.target.value);
                setDeleteError("");
              }}
              placeholder="계정삭제"
              className={`w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground outline-none focus:ring-2 focus:ring-red-300 placeholder:text-muted-foreground ${
                deleteError ? "border-red-400" : "border-border"
              }`}
            />
            {deleteError && (
              <p className="text-xs text-red-500 mt-1">{deleteError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteLoading || deleteConfirm !== "계정삭제"}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderRadius: "4px" }}
          >
            {deleteLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            계정 영구 삭제
          </button>
        </div>
      </section>
    </div>
  );
}
