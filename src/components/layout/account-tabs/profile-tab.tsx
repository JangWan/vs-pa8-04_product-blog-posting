"use client";

import { useRef, useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { clerkErrorToKorean } from "@/lib/clerk-errors";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, Loader2, Check, AlertTriangle } from "lucide-react";

const profileSchema = z.object({
  firstName: z.string().min(1, "이름을 입력하세요"),
  lastName: z.string().min(1, "성을 입력하세요"),
});

type ProfileForm = z.infer<typeof profileSchema>;

const pwSchema = z
  .object({
    currentPassword: z.string().min(1, "현재 비밀번호를 입력하세요"),
    newPassword: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력하세요"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "새 비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });

type PwForm = z.infer<typeof pwSchema>;

export function ProfileTab() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [pwError, setPwError] = useState("");
  const [pendingPwData, setPendingPwData] = useState<PwForm | null>(null);
  const [pwChanging, setPwChanging] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting, errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
    },
  });

  const {
    register: registerPw,
    handleSubmit: handleSubmitPw,
    reset: resetPw,
    formState: { isSubmitting: isPwSubmitting, errors: pwErrors },
  } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  });

  if (!user) return null;

  /* user.hasImage: Clerk 제공 boolean — 커스텀 업로드 이미지 여부 */
  const initial =
    (
      (user.firstName?.[0] ?? "") +
      (user.lastName?.[0] ?? "")
    ).toUpperCase() ||
    user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ||
    "U";

  const currentImage = preview ?? (user.hasImage ? user.imageUrl : null);

  /* ── 아바타 업로드 ── */
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("이미지 크기는 2MB 이하여야 합니다.");
      return;
    }
    if (!user) return;
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setAvatarLoading(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
      /* 업로드 성공 후 preview 해제 — 이후 user.imageUrl을 직접 표시 */
      setPreview(null);
    } catch {
      alert("업로드에 실패했습니다. 다시 시도해주세요.");
      setPreview(null);
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ── 이름 저장 ── */
  async function onSubmitProfile(data: ProfileForm) {
    if (!user) return;
    setProfileError("");
    try {
      await user.update({ firstName: data.firstName, lastName: data.lastName });
      reset(data);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {
      setProfileError("저장에 실패했습니다. 다시 시도해주세요.");
    }
  }

  /* ── 비밀번호 변경: 폼 제출 시 확인 단계로 이동 ── */
  function onSubmitPassword(data: PwForm) {
    setPwError("");
    setPendingPwData(data);
  }

  /* ── 비밀번호 변경 확정: user.updatePassword() → 로그아웃 → 메인 이동 ── */
  async function executePwChange() {
    if (!user || !pendingPwData) return;
    setPwChanging(true);
    setPwError("");
    try {
      await user.updatePassword({
        currentPassword: pendingPwData.currentPassword,
        newPassword: pendingPwData.newPassword,
      });
      await signOut();
      router.replace("/");
    } catch (err: unknown) {
      /* user.updatePassword()는 ClerkAPIResponseError를 throw — errors[0].code로 변환 */
      const code = (err as { errors?: { code: string }[] })?.errors?.[0]?.code;
      setPwError(code ? clerkErrorToKorean(code) : "비밀번호 변경에 실패했습니다.");
      setPendingPwData(null);
    } finally {
      setPwChanging(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground outline-none focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground";

  const btnPrimary =
    "flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  const btnOutline =
    "flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded hover:bg-secondary transition-colors disabled:opacity-60";

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full">
      {/* ── 프로필 이미지 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          프로필 이미지
        </h3>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {currentImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentImage}
                alt="프로필"
                className="h-16 w-16 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <span className="text-xl font-semibold text-primary">
                  {initial}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarLoading}
              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-60"
              aria-label="프로필 이미지 변경"
            >
              {avatarLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <Camera className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP · 최대 2MB
          </p>
        </div>
      </section>

      {/* ── 이름/성 수정 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          이름 수정
        </h3>
        <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                성
              </label>
              <input {...register("lastName")} className={inputClass} />
              {errors.lastName && (
                <p className="text-xs text-destructive mt-1">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                이름
              </label>
              <input {...register("firstName")} className={inputClass} />
              {errors.firstName && (
                <p className="text-xs text-destructive mt-1">
                  {errors.firstName.message}
                </p>
              )}
            </div>
          </div>
          {profileError && (
            <p className="text-xs text-destructive">{profileError}</p>
          )}
          <button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className={btnPrimary}
            style={{ borderRadius: "4px" }}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : profileSaved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {profileSaved ? "저장됨" : "저장"}
          </button>
        </form>
      </section>

      {/* ── 비밀번호 변경 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          비밀번호 변경
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다.
        </p>
        <form onSubmit={handleSubmitPw(onSubmitPassword)} className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              현재 비밀번호
            </label>
            <input
              type="password"
              {...registerPw("currentPassword")}
              className={inputClass}
            />
            {pwErrors.currentPassword && (
              <p className="text-xs text-destructive mt-1">
                {pwErrors.currentPassword.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              새 비밀번호
            </label>
            <input
              type="password"
              {...registerPw("newPassword")}
              placeholder="8자 이상"
              className={inputClass}
            />
            {pwErrors.newPassword && (
              <p className="text-xs text-destructive mt-1">
                {pwErrors.newPassword.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              새 비밀번호 확인
            </label>
            <input
              type="password"
              {...registerPw("confirmPassword")}
              className={inputClass}
            />
            {pwErrors.confirmPassword && (
              <p className="text-xs text-destructive mt-1">
                {pwErrors.confirmPassword.message}
              </p>
            )}
          </div>
          {pwError && <p className="text-xs text-destructive">{pwError}</p>}
          <button
            type="submit"
            disabled={isPwSubmitting}
            className={btnPrimary}
            style={{ borderRadius: "4px" }}
          >
            비밀번호 변경
          </button>
        </form>

        {/* ── 변경 확인 패널 ── */}
        {pendingPwData && (
          <div className="mt-4 p-4 rounded-md border border-amber-200 bg-amber-50 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800">
                  비밀번호를 변경하시겠습니까?
                </p>
                <p className="text-xs text-amber-700">
                  변경 후 현재 세션에서 자동으로 로그아웃됩니다. 새 비밀번호로
                  다시 로그인해주세요.
                </p>
              </div>
            </div>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={executePwChange}
                disabled={pwChanging}
                className={btnPrimary}
                style={{ borderRadius: "4px" }}
              >
                {pwChanging && <Loader2 className="h-4 w-4 animate-spin" />}
                변경
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPwData(null);
                  setPwError("");
                }}
                disabled={pwChanging}
                className={btnOutline}
                style={{ borderRadius: "4px" }}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
