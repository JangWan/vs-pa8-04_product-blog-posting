"use client";

import { useState, useEffect } from "react";
import { useSignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PenLine, Loader2, Eye, EyeOff, Mail, Check } from "lucide-react";
import { clerkErrorToKorean } from "@/lib/clerk-errors";

type Step = "login" | "forgot" | "code-entry" | "reset-done";

type FormErrors = {
  email?: string;
  password?: string;
  resetEmail?: string;
  code?: string;
  newPassword?: string;
  confirmPassword?: string;
  global?: string;
};

function InputField({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  rightElement,
  autoComplete,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  rightElement?: React.ReactNode;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={[
            "w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground",
            "placeholder:text-muted-foreground transition-colors outline-none",
            "focus:ring-2 focus:ring-primary/30 focus:border-primary",
            error ? "border-red-400" : "border-border",
            rightElement ? "pr-10" : "",
          ].join(" ")}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {rightElement}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  /* 이미 로그인된 경우 대시보드로 리다이렉트 */
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [localErrors, setLocalErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isLoading = fetchStatus === "fetching" || submitting;
  const clerkGlobalError = errors?.global?.[0]?.message;
  const displayGlobalError = localErrors.global ?? clerkGlobalError;

  /* ── 로그인 ── */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    const errs: FormErrors = {};
    if (!email) errs.email = "이메일을 입력해주세요.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "올바른 이메일 형식을 입력해주세요.";
    if (!password) errs.password = "비밀번호를 입력해주세요.";
    if (Object.keys(errs).length > 0) {
      setLocalErrors(errs);
      return;
    }
    setLocalErrors({});

    const { error } = await signIn.password({ identifier: email, password });

    if (error) {
      if (
        error.code === "session_exists" ||
        error.code === "identifier_already_signed_in"
      ) {
        router.replace("/dashboard");
        return;
      }
      /* form_password_incorrect / form_identifier_not_found → 보안상 통합 메시지 */
      if (
        error.code === "form_password_incorrect" ||
        error.code === "form_identifier_not_found"
      ) {
        setLocalErrors({ global: "이메일 또는 비밀번호가 올바르지 않습니다." });
      } else {
        setLocalErrors({ global: clerkErrorToKorean(error.code) });
      }
      return;
    }

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/dashboard");
          if (url.startsWith("http")) {
            window.location.href = url;
          } else {
            router.push(url);
          }
        },
      });
    }
  }

  /* ── 비밀번호 재설정: 이메일 입력 → 코드 발송 ── */
  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();

    const errs: FormErrors = {};
    if (!resetEmail) errs.resetEmail = "이메일을 입력해주세요.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail))
      errs.resetEmail = "올바른 이메일 형식을 입력해주세요.";
    if (Object.keys(errs).length > 0) {
      setLocalErrors(errs);
      return;
    }
    setLocalErrors({});
    setSubmitting(true);

    try {
      /* 1단계: 해당 계정으로 sign-in 시도 시작 */
      const { error: createError } = await signIn.create({
        identifier: resetEmail,
      });
      if (createError) {
        /* 보안상 계정 존재 여부 미노출 — 항상 코드 발송 화면으로 이동 */
        setStep("code-entry");
        return;
      }

      /* 2단계: 재설정 코드 발송 */
      const { error: sendError } =
        await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        setLocalErrors({ global: clerkErrorToKorean(sendError.code) });
        return;
      }

      setStep("code-entry");
    } catch {
      /* 보안상 계정 존재 여부 미노출 */
      setStep("code-entry");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── 비밀번호 재설정: 코드 검증 → 새 비밀번호 설정 ── */
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();

    const errs: FormErrors = {};
    if (!code.trim()) errs.code = "인증 코드를 입력해주세요.";
    if (!newPassword) errs.newPassword = "새 비밀번호를 입력해주세요.";
    else if (newPassword.length < 8)
      errs.newPassword = "비밀번호는 8자 이상이어야 합니다.";
    if (!confirmPassword) errs.confirmPassword = "비밀번호 확인을 입력해주세요.";
    else if (newPassword !== confirmPassword)
      errs.confirmPassword = "비밀번호가 일치하지 않습니다.";
    if (Object.keys(errs).length > 0) {
      setLocalErrors(errs);
      return;
    }
    setLocalErrors({});
    setSubmitting(true);

    try {
      /* 3단계: 코드 검증 */
      const { error: verifyError } =
        await signIn.resetPasswordEmailCode.verifyCode({
          code: code.trim(),
        });
      if (verifyError) {
        setLocalErrors({ code: clerkErrorToKorean(verifyError.code) });
        return;
      }

      /* 4단계: 새 비밀번호 설정 */
      const { error: submitError } =
        await signIn.resetPasswordEmailCode.submitPassword({
          password: newPassword,
        });
      if (submitError) {
        setLocalErrors({ global: clerkErrorToKorean(submitError.code) });
        return;
      }

      setStep("reset-done");
    } catch {
      setLocalErrors({ global: "오류가 발생했습니다. 다시 시도해주세요." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full space-y-5">
      {/* 로고 */}
      <div className="flex justify-center">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity"
        >
          <PenLine className="h-5 w-5 text-primary" />
          <span>IndiePost AI</span>
        </Link>
      </div>

      <div className="bg-background border border-border rounded-lg shadow-notion-card p-8">
        {/* ── 로그인 ── */}
        {step === "login" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">로그인</h1>
              <p className="text-sm text-muted-foreground mt-1">
                이메일과 비밀번호로 로그인하세요
              </p>
            </div>

            {displayGlobalError && (
              <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600">
                {displayGlobalError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <InputField
                label="이메일"
                id="email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="name@example.com"
                error={
                  localErrors.email ?? errors?.fields?.identifier?.message
                }
                autoComplete="email"
              />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    비밀번호
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setStep("forgot");
                      setLocalErrors({});
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    autoComplete="current-password"
                    className={[
                      "w-full px-3 py-2 pr-10 text-sm border rounded-md bg-background text-foreground",
                      "placeholder:text-muted-foreground transition-colors outline-none",
                      "focus:ring-2 focus:ring-primary/30 focus:border-primary",
                      localErrors.password ? "border-red-400" : "border-border",
                    ].join(" ")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {localErrors.password && (
                  <p className="text-xs text-red-500">{localErrors.password}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 mt-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "로그인"
                )}
              </button>
            </form>
          </>
        )}

        {/* ── 비밀번호 재설정: 이메일 입력 ── */}
        {step === "forgot" && (
          <>
            <button
              type="button"
              onClick={() => {
                setStep("login");
                setLocalErrors({});
              }}
              className="mb-4 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              ← 로그인으로 돌아가기
            </button>

            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">
                비밀번호 재설정
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                가입한 이메일로 인증 코드를 보내드립니다
              </p>
            </div>

            {localErrors.global && (
              <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600">
                {localErrors.global}
              </div>
            )}

            <form onSubmit={handleSendCode} className="space-y-4" noValidate>
              <InputField
                label="이메일"
                id="resetEmail"
                type="email"
                value={resetEmail}
                onChange={setResetEmail}
                placeholder="name@example.com"
                error={localErrors.resetEmail}
                autoComplete="email"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "재설정 이메일 발송"
                )}
              </button>
            </form>
          </>
        )}

        {/* ── 비밀번호 재설정: 코드 + 새 비밀번호 입력 ── */}
        {step === "code-entry" && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground">
                  코드 확인
                </h1>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{resetEmail}</span>
                으로 발송된 인증 코드를 입력하고 새 비밀번호를 설정하세요
              </p>
            </div>

            {localErrors.global && (
              <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600">
                {localErrors.global}
              </div>
            )}

            <form
              onSubmit={handleResetPassword}
              className="space-y-4"
              noValidate
            >
              <InputField
                label="인증 코드"
                id="code"
                type="text"
                value={code}
                onChange={setCode}
                placeholder="이메일에서 확인한 6자리 코드"
                error={localErrors.code}
                autoComplete="one-time-code"
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-foreground"
                >
                  새 비밀번호
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNewPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8자 이상"
                    autoComplete="new-password"
                    className={[
                      "w-full px-3 py-2 pr-10 text-sm border rounded-md bg-background text-foreground",
                      "placeholder:text-muted-foreground transition-colors outline-none",
                      "focus:ring-2 focus:ring-primary/30 focus:border-primary",
                      localErrors.newPassword
                        ? "border-red-400"
                        : "border-border",
                    ].join(" ")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPw ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {localErrors.newPassword && (
                  <p className="text-xs text-red-500">
                    {localErrors.newPassword}
                  </p>
                )}
              </div>

              <InputField
                label="새 비밀번호 확인"
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                error={localErrors.confirmPassword}
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "비밀번호 변경"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("forgot");
                  setCode("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setLocalErrors({});
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                코드를 받지 못하셨나요? 다시 발송
              </button>
            </form>
          </>
        )}

        {/* ── 재설정 완료 ── */}
        {step === "reset-done" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              비밀번호가 변경되었습니다
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              새 비밀번호로 로그인해주세요
            </p>
            <button
              type="button"
              onClick={() => {
                setStep("login");
                setCode("");
                setNewPassword("");
                setConfirmPassword("");
                setResetEmail("");
                setLocalErrors({});
              }}
              className="w-full py-2 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-md transition-colors"
            >
              로그인하러 가기
            </button>
          </div>
        )}
      </div>

      {step === "login" && (
        <p className="text-center text-sm text-muted-foreground">
          계정이 없으신가요?{" "}
          <Link
            href="/sign-up"
            className="text-foreground font-medium hover:underline"
          >
            회원가입
          </Link>
        </p>
      )}
    </div>
  );
}
