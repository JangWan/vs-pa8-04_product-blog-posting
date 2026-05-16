"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PenLine, Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { clerkErrorToKorean } from "@/lib/clerk-errors";

type Step = "register" | "verify";

type FormErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
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

export default function SignUpPage() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();

  const [step, setStep] = useState<Step>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [localErrors, setLocalErrors] = useState<FormErrors>({});

  const isLoading = fetchStatus === "fetching";

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!email) errs.email = "이메일을 입력해주세요.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "올바른 이메일 형식을 입력해주세요.";
    if (!password) errs.password = "비밀번호를 입력해주세요.";
    else if (password.length < 8)
      errs.password = "비밀번호는 8자 이상이어야 합니다.";
    if (!confirmPassword) errs.confirmPassword = "비밀번호 확인을 입력해주세요.";
    else if (password !== confirmPassword)
      errs.confirmPassword = "비밀번호가 일치하지 않습니다.";
    return errs;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setLocalErrors(errs);
      return;
    }
    setLocalErrors({});

    const { error } = await signUp.password({ emailAddress: email, password });

    if (error) {
      if (error.code === "form_identifier_exists") {
        setLocalErrors({ email: "이미 사용 중인 이메일입니다. 로그인해주세요." });
      } else {
        setLocalErrors({ global: clerkErrorToKorean(error.code) });
      }
      return;
    }

    const { error: sendErr } = await signUp.verifications.sendEmailCode();
    if (sendErr) {
      setLocalErrors({ global: clerkErrorToKorean(sendErr.code) });
      return;
    }

    setStep("verify");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();

    if (!code || code.trim().length !== 6) {
      setLocalErrors({ code: "6자리 인증 코드를 입력해주세요." });
      return;
    }
    setLocalErrors({});

    const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });

    if (error) {
      setLocalErrors({ code: clerkErrorToKorean(error.code) });
      return;
    }

    if (signUp.status === "complete") {
      await signUp.finalize({
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

  async function handleResend() {
    if (isLoading) return;
    setLocalErrors({});

    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      setLocalErrors({ code: clerkErrorToKorean(error.code) });
    } else {
      setLocalErrors({ code: "새 코드를 발송했습니다." });
    }
  }

  const globalError = localErrors.global ?? errors?.global?.[0]?.message;

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
        {/* ── 1단계: 이메일 + 비밀번호 입력 ── */}
        {step === "register" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">회원가입</h1>
              <p className="text-sm text-muted-foreground mt-1">
                IndiePost AI를 무료로 시작하세요
              </p>
            </div>

            {globalError && (
              <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600">
                {globalError}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <InputField
                label="이메일"
                id="email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="name@example.com"
                error={localErrors.email ?? errors?.fields?.emailAddress?.message}
                autoComplete="email"
              />

              <InputField
                label="비밀번호"
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="8자 이상 입력하세요"
                error={localErrors.password ?? errors?.fields?.password?.message}
                autoComplete="new-password"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <InputField
                label="비밀번호 확인"
                id="confirmPassword"
                type={showConfirmPw ? "text" : "password"}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="비밀번호를 다시 입력하세요"
                error={localErrors.confirmPassword}
                autoComplete="new-password"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((v) => !v)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 mt-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "회원가입"}
              </button>
              {/* Clerk 봇 방지 CAPTCHA 위젯 마운트 포인트 — 커스텀 플로우 필수 */}
              <div id="clerk-captcha" />
            </form>
          </>
        )}

        {/* ── 2단계: OTP 인증 ── */}
        {step === "verify" && (
          <>
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">이메일 인증</h1>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{email}</span>
                <br />
                으로 발송된 6자리 코드를 입력하세요
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="code" className="block text-sm font-medium text-foreground">
                  인증 코드
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  className={[
                    "w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground",
                    "text-center tracking-widest placeholder:text-muted-foreground transition-colors outline-none",
                    "focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    localErrors.code && !localErrors.code.includes("발송")
                      ? "border-red-400"
                      : "border-border",
                  ].join(" ")}
                />
                {localErrors.code && (
                  <p className={`text-xs ${localErrors.code.includes("발송") ? "text-primary" : "text-red-500"}`}>
                    {localErrors.code}
                  </p>
                )}
                {errors?.fields?.code && !localErrors.code && (
                  <p className="text-xs text-red-500">{errors.fields.code.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "인증 완료"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
              >
                코드를 받지 못하셨나요? 재발송
              </button>
            </form>
          </>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        이미 계정이 있으신가요?{" "}
        <Link href="/sign-in" className="text-foreground font-medium hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
