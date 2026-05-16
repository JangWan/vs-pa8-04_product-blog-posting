---
description: Clerk Authentication & User Management Guideline
globs: "**/*clerk*,**/proxy.ts,**/sign-in/**,**/sign-up/**"
---

# Clerk Authentication & User Management Guideline

> **기준: 2026년 5월 / @clerk/nextjs v7+ (Core 3) / Next.js 16 App Router**
>
> ⚠️ **Core 2 (v6 이하) 코드와 완전히 다릅니다. 반드시 Core 3 문서만 참조하세요.**

---

## Core 3 핵심 변경사항

| 항목 | Core 2 (❌ 사용 금지) | Core 3 (✅ 현재) |
|------|----------------------|-----------------|
| `useSignIn()` 반환값 | `{ isLoaded, signIn, setActive }` | `{ signIn, errors, fetchStatus }` |
| `useSignUp()` 반환값 | `{ isLoaded, signUp, setActive }` | `{ signUp, errors, fetchStatus }` |
| 이메일+비번 로그인 | `signIn.create({ identifier, password })` | `signIn.password({ identifier, password })` |
| 이메일+비번 회원가입 | `signUp.create({ emailAddress, password })` | `signUp.password({ emailAddress, password })` |
| 이메일 인증 발송 | `signUp.prepareEmailAddressVerification()` | `signUp.verifications.sendEmailCode()` |
| 이메일 인증 확인 | `signUp.attemptEmailAddressVerification()` | `signUp.verifications.verifyEmailCode()` |
| 세션 활성화 | `setActive({ session: result.createdSessionId })` | `signIn.finalize({ navigate })` |
| 로딩 상태 | `isLoaded` | `fetchStatus === 'fetching'` |
| 비밀번호 재설정 | `signIn.create({ strategy: 'reset_password_email_code' })` | `signIn.resetPasswordEmailCode.sendCode()` |
| 조건부 렌더링 | `<SignedIn>`, `<SignedOut>` | `<Show when="signed-in">`, `<Show when="signed-out">` |

---

## Must (반드시 지켜야 할 규칙)

- `CLERK_SECRET_KEY`는 **절대 클라이언트에 노출 금지** — 서버(Server Component, API Route, Server Action)에서만 사용
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`는 `NEXT_PUBLIC_` 접두사 필수
- 미들웨어는 반드시 `clerkMiddleware` + `createRouteMatcher` 조합으로 작성
- `useUser()`, `useAuth()`는 `isLoaded` 상태 반드시 확인 (이 훅들은 Core 3에서도 `isLoaded` 반환)
- `useSignIn()`, `useSignUp()`은 `isLoaded` 없음 — `fetchStatus`로 로딩 판별
- `privateMetadata`는 클라이언트에 절대 전달 금지
- 커스텀 회원가입 폼에는 `<div id="clerk-captcha" />` 필수 (아래 CAPTCHA 섹션 참조)

---

## Environment Variables

```env
# .env.local

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

---

## Proxy Setup (Next.js 16+)

> ⚠️ **Next.js 16부터 `middleware.ts` → `proxy.ts`로 변경됨**  
> `middleware.ts`를 사용하면 `"middleware" file convention is deprecated` 오류 발생.  
> `src/` 디렉토리 사용 시 반드시 `src/proxy.ts`에 위치해야 함.

```typescript
// src/proxy.ts (Next.js 16+ — src/ 사용 시 src/ 안에 위치)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
```

---

## CAPTCHA (봇 방지) — 커스텀 플로우 필수

커스텀 회원가입 플로우에서는 `signUp.password()` 호출 전에 CAPTCHA 위젯이 DOM에 마운트되어야 합니다.  
`<div id="clerk-captcha" />`가 없으면 콘솔 에러 발생 + Invisible CAPTCHA 폴백으로 불안정하게 동작합니다.

```tsx
<form onSubmit={handleRegister}>
  {/* ... 입력 필드 ... */}

  {/* ✅ 반드시 폼 안 버튼 아래에 위치 */}
  <button type="submit">회원가입</button>
  <div id="clerk-captcha" />
</form>
```

> ⚠️ 로그인 폼(`sign-in`)에는 불필요 — 회원가입 폼에만 필요합니다.

---

## Client-Side Hooks

### 훅 한눈에 보기

| 훅 | 반환값 핵심 | `isLoaded` 있음? |
|---|---|---|
| `useUser()` | `isLoaded`, `isSignedIn`, `user` | ✅ |
| `useAuth()` | `isLoaded`, `userId`, `orgId`, `isSignedIn`, `getToken` | ✅ |
| `useClerk()` | `signOut`, `openSignIn`, `setActive`, `client` | — |
| `useSession()` | `isLoaded`, `isSignedIn`, `session` | ✅ |
| `useSessionList()` | `isLoaded`, `sessions`, `setActive` | ✅ |
| `useSignIn()` | `signIn`, `errors`, `fetchStatus` | ❌ (`fetchStatus` 사용) |
| `useSignUp()` | `signUp`, `errors`, `fetchStatus` | ❌ (`fetchStatus` 사용) |

---

### useSignIn() — 커스텀 로그인 (Core 3)

```tsx
'use client'
import { useSignIn, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()

  // ✅ 이미 로그인된 경우 대시보드로 이동
  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace('/dashboard')
  }, [isLoaded, isSignedIn, router])

  const isLoading = fetchStatus === 'fetching'

  async function handleLogin(email: string, password: string) {
    const { error } = await signIn.password({ identifier: email, password })

    if (error) {
      // 이미 로그인된 세션 — 대시보드로 이동
      if (error.code === 'session_exists' || error.code === 'identifier_already_signed_in') {
        router.replace('/dashboard')
        return
      }
      // 보안상 이메일/비번 오류는 통합 메시지 사용
      console.error(error.code, error.message)
      return
    }

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl('/dashboard')
          if (url.startsWith('http')) window.location.href = url
          else router.push(url)
        },
      })
    } else if (signIn.status === 'needs_second_factor') {
      // ✅ 2차 인증 필요 — 이메일 OTP 발송 후 MFA 입력 단계로 전환
      const { error: mfaErr } = await signIn.mfa.sendEmailCode()
      if (!mfaErr) setStep('mfa')
    }
  }

  // 에러 접근법
  // errors?.fields?.identifier?.message  — 이메일 필드 에러
  // errors?.fields?.password?.message    — 비밀번호 필드 에러
  // errors?.global?.[0]?.message         — 전역 에러
}
```

---

### 2차 인증(MFA) — needs_second_factor (Core 3)

> Clerk 대시보드에서 **Multi-factor authentication**을 활성화하면, 비밀번호 인증 성공 후
> `signIn.status === 'needs_second_factor'`가 반환됩니다.
> 이 케이스를 처리하지 않으면 로그인이 완료되지 않고 무한 대기 상태가 됩니다.

#### 사용 API (Core 3)

| 동작 | API |
|------|-----|
| 이메일 OTP 발송 | `signIn.mfa.sendEmailCode()` |
| 이메일 OTP 검증 | `signIn.mfa.verifyEmailCode({ code })` |
| SMS OTP 검증 | `signIn.mfa.verifyPhoneCode({ code })` |
| TOTP 앱 검증 | `signIn.mfa.verifyTOTP({ code })` |
| 백업 코드 검증 | `signIn.mfa.verifyBackupCode({ code })` |

> ⚠️ 이 프로젝트는 **이메일+비밀번호 전용**이므로 `sendEmailCode` / `verifyEmailCode`만 사용합니다.

```typescript
// 1단계: signIn.password() 이후 status 분기
if (signIn.status === 'complete') {
  await signIn.finalize({ navigate: ... })
} else if (signIn.status === 'needs_second_factor') {
  // ✅ 이메일 OTP 발송
  const { error } = await signIn.mfa.sendEmailCode()
  if (!error) setStep('mfa')  // MFA 입력 화면으로 전환
}

// 2단계: OTP 코드 검증 → 세션 완료
async function handleMfaVerify(code: string) {
  const { error } = await signIn.mfa.verifyEmailCode({ code })
  if (error) {
    setLocalErrors({ code: clerkErrorToKorean(error.code) })
    return
  }

  if (signIn.status === 'complete') {
    await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl('/dashboard')
        if (url.startsWith('http')) window.location.href = url
        else router.push(url)
      },
    })
  }
}

// 재발송 — 동일 API 재호출
async function handleResend() {
  const { error } = await signIn.mfa.sendEmailCode()
  if (error) setLocalErrors({ global: clerkErrorToKorean(error.code) })
}
```

#### Step 흐름

```
[비밀번호 입력] → signIn.password()
  ├─ status === 'complete'          → signIn.finalize() → /dashboard
  └─ status === 'needs_second_factor'
        ↓
     signIn.mfa.sendEmailCode()     → 이메일 OTP 발송
        ↓
     [OTP 입력 화면]
        ↓
     signIn.mfa.verifyEmailCode()
        ↓
     status === 'complete'          → signIn.finalize() → /dashboard
```

#### Webhook 주의사항 — `email_addresses` 방어 처리

Clerk 대시보드에서 보내는 **테스트 웹훅**은 합성(synthetic) 데이터를 사용하므로
`email_addresses` 배열이 비어 있을 수 있습니다.
웹훅 핸들러에서 이메일이 없다고 **400을 반환하면** Clerk이 재시도(retry)하며 실패로 기록합니다.

```typescript
// ✅ 올바른 처리 — 이메일 없을 때 200으로 조용히 무시
const list = Array.isArray(email_addresses) ? email_addresses : []
const email = list.find(e => e.id === primary_email_address_id)?.email_address
              ?? list[0]?.email_address

if (!email) {
  return Response.json({ ok: true, skipped: 'no_email' })  // ✅ 200
}
// ❌ return Response.json({ error: 'No email found' }, { status: 400 })
```

---

### 비밀번호 재설정 (Core 3) — 비인증 사용자

> ⚠️ `signIn.resetPasswordEmailCode.*`는 **로그인하지 않은 사용자(비밀번호 찾기)**에만 사용.  
> 이미 로그인된 사용자의 비밀번호 변경은 `user.updatePassword()` 사용 (아래 참조).

```typescript
// 필수: sendCode() 전에 반드시 signIn.create()로 계정 특정 먼저
const { error: createError } = await signIn.create({ identifier: email })

// 1단계: 재설정 코드 발송
const { error } = await signIn.resetPasswordEmailCode.sendCode()

// 2단계: 코드 검증
const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: '123456' })

// 3단계: 새 비밀번호 설정
const { error } = await signIn.resetPasswordEmailCode.submitPassword({
  password: 'newSecurePassword123',
})
```

---

### useSignUp() — 커스텀 회원가입 (Core 3)

```tsx
'use client'
import { useSignUp, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function SignUpPage() {
  const { signUp, errors, fetchStatus } = useSignUp()
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()

  // ✅ 이미 로그인된 경우 대시보드로 이동
  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace('/dashboard')
  }, [isLoaded, isSignedIn, router])

  const isLoading = fetchStatus === 'fetching'

  async function handleRegister(email: string, password: string) {
    // 1단계: 이메일+비번으로 계정 생성
    const { error } = await signUp.password({ emailAddress: email, password })
    if (error) return

    // 2단계: 이메일 인증 코드 발송
    await signUp.verifications.sendEmailCode()
    // → OTP 입력 단계로 전환
  }

  async function handleVerify(code: string) {
    // 3단계: OTP 코드 검증
    const { error } = await signUp.verifications.verifyEmailCode({ code })
    if (error) return

    if (signUp.status === 'complete') {
      await signUp.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl('/dashboard')
          if (url.startsWith('http')) window.location.href = url
          else router.push(url)
        },
      })
    }
  }

  // 이메일 인증 재발송
  async function handleResend() {
    await signUp.verifications.sendEmailCode()
  }

  return (
    <form onSubmit={handleRegister}>
      {/* ... 입력 필드 ... */}
      <button type="submit">회원가입</button>
      {/* ✅ 필수: CAPTCHA 위젯 마운트 포인트 */}
      <div id="clerk-captcha" />
    </form>
  )
}
```

---

### useUser() — 사용자 정보 & 아바타

```tsx
'use client'
import { useUser } from '@clerk/nextjs'

export function UserProfile() {
  const { isLoaded, isSignedIn, user } = useUser()

  if (!isLoaded) return <div>Loading...</div>
  if (!isSignedIn) return null

  return <p>{user.emailAddresses[0].emailAddress}</p>
}

// ✅ 아바타 이미지 존재 여부 판별 — user.hasImage 사용
// ❌ URL 문자열 검사 금지 (img.clerk.com은 커스텀 이미지도 동일 도메인 사용)
const hasCustomImage = user.hasImage  // ✅ Clerk 제공 boolean

// 아바타 업로드
await user.setProfileImage({ file })
await user.reload()  // 업로드 후 반드시 reload()로 user 객체 갱신
setPreview(null)     // 업로드 성공 후 preview 초기화 → user.imageUrl 직접 표시

// 이름 수정
await user.update({ firstName: 'John', lastName: 'Doe' })

// 계정 삭제
await user.delete()
```

---

### 비밀번호 변경 — 인증된 사용자 (Core 3)

> ✅ 이미 로그인된 사용자가 비밀번호를 변경할 때는 `user.updatePassword()` 사용.  
> ❌ `signIn.resetPasswordEmailCode.*`는 비인증 사용자 전용 — 인증된 사용자에게 사용하면 session touch만 발생.

```typescript
// 현재 비밀번호 + 새 비밀번호로 직접 변경
try {
  await user.updatePassword({
    currentPassword: 'oldPassword',
    newPassword: 'newPassword123',
  })
  // 보안상 비밀번호 변경 후 로그아웃 권장
  await signOut()
  router.replace('/')
} catch (err) {
  // user.updatePassword()는 { error } 반환이 아닌 throw 방식
  const code = (err as { errors?: { code: string }[] })?.errors?.[0]?.code
  console.error(code)
}
```

---

### 세션 목록 (활성 세션 + latestActivity)

> ✅ 세션 activity 정보(browser, OS, IP)가 필요하면 `user.getSessions()` 사용.  
> ❌ `useSessionList()`는 `SessionResource[]`를 반환하며 `latestActivity`가 없음.

```typescript
// ✅ user.getSessions() — SessionWithActivitiesResource[] 반환
const [sessions, setSessions] = useState([])

useEffect(() => {
  if (!user) return
  user.getSessions().then(setSessions).catch(() => setSessions([]))
}, [user])

// 각 세션에서 접근 가능한 activity 필드
session.latestActivity?.browserName  // "Chrome"
session.latestActivity?.osName       // "Windows"
session.latestActivity?.ipAddress    // "1.2.3.4"
session.latestActivity?.isMobile     // false
// ⚠️ city/country는 Clerk 유료 플랜 또는 IP 지오로케이션 가용성에 따라 null일 수 있음

// 세션 원격 종료
await session.revoke()

// ⚠️ SessionWithActivitiesResource는 @clerk/nextjs에서 export되지 않음 — 인라인 타입 직접 정의
type SessionWithActivity = {
  id: string
  revoke: () => Promise<unknown>
  latestActivity?: {
    ipAddress?: string | null
    browserName?: string | null
    osName?: string | null
    isMobile?: boolean
  } | null
}
```

---

### 현재 접속 기기 정보 (useSessionInfo + API Route)

현재 요청의 IP를 서버에서 읽어 클라이언트에 반환하는 패턴. UA 파싱은 클라이언트에서 수행한다.

```typescript
// src/app/api/user/session-info/route.ts
// ⚠️ proxy.ts의 public 경로에 포함하지 말 것 (인증 필요 엔드포인트)
export async function GET(req: Request) {
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  return Response.json({ ip })
}
```

```typescript
// src/features/user-profile/hooks/use-session-info.ts
import { useQuery } from '@tanstack/react-query'

function parseDeviceInfo(ua: string) {
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    /Linux/.test(ua) ? 'Linux' : '알 수 없는 OS'

  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : '알 수 없는 브라우저'

  return { os, browser }
}

export function useSessionInfo() {
  const { data, isLoading } = useQuery({
    queryKey: ['session-info'],
    queryFn: () => fetch('/api/user/session-info').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const { os, browser } = parseDeviceInfo(ua)

  return { ip: data?.ip ?? null, os, browser, isLoading }
}
```

---

### 계정 관리 UI 구현 — 핵심 패턴 요약

아바타 드롭다운 → 계정 관리 모달(shadcn Dialog) → 좌우 분할(사이드바 탭 + 콘텐츠) 구조.

```typescript
// 아바타 업로드 — preview 초기화 패턴
const objectUrl = URL.createObjectURL(file)
setPreview(objectUrl)            // 즉시 미리보기
await user.setProfileImage({ file })
await user.reload()
setPreview(null)                 // ✅ 성공 후 반드시 해제 — 없으면 구 미리보기 표시 지속

// 비밀번호 변경 — 확인 패널 → 실행 패턴
// 1. 폼 제출 → pendingPwData에 저장 (실행 안 함)
// 2. 확인 패널 표시 (경고 메시지 + 변경/취소 버튼)
// 3. 사용자 확정 → executePwChange() 실행
async function executePwChange() {
  await user.updatePassword({ currentPassword, newPassword })
  await signOut()                // 변경 후 세션 무효화 → 로그아웃 필수
  router.replace('/')
}

// 계정 삭제 — 입력 확인 패턴
// deleteConfirm === "계정삭제" 일치 시에만 버튼 활성화
await user.delete()
await signOut()
router.replace('/')
```

---

### useAuth() — 세션 / 토큰

```tsx
'use client'
import { useAuth } from '@clerk/nextjs'

export function TokenFetcher() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()

  const fetchData = async () => {
    const token = await getToken()
    await fetch('/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  if (!isLoaded || !isSignedIn) return null
  return <button onClick={fetchData}>Fetch</button>
}
```

---

### useClerk() — 로그아웃 / 세션 제어

```tsx
'use client'
import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export function SignOutButton() {
  const { signOut } = useClerk()
  const router = useRouter()

  return (
    <button onClick={async () => { await signOut(); router.replace('/') }}>
      로그아웃
    </button>
  )
}
```

---

## 에러 메시지 한글화

> Clerk 백엔드 API는 `error.message`를 항상 영어로 반환합니다.  
> `ClerkProvider localization` prop은 프리빌트 컴포넌트에만 적용 — 커스텀 플로우 훅에는 효과 없음.  
> ✅ **유일한 방법**: `error.code`를 기준으로 한글 메시지 매핑.

```typescript
// src/lib/clerk-errors.ts
const CLERK_ERROR_MAP: Record<string, string> = {
  form_identifier_not_found:        '등록되지 않은 이메일입니다.',
  form_password_incorrect:          '비밀번호가 올바르지 않습니다.',
  session_exists:                   '이미 로그인된 상태입니다.',
  identifier_already_signed_in:     '이미 로그인된 상태입니다.',
  form_identifier_exists:           '이미 사용 중인 이메일입니다.',
  form_password_length_too_short:   '비밀번호는 8자 이상이어야 합니다.',
  form_password_pwned:              '유출된 비밀번호입니다. 다른 비밀번호를 사용해주세요.',
  form_password_not_strong_enough:  '비밀번호가 너무 단순합니다.',
  form_code_incorrect:              '인증 코드가 올바르지 않습니다.',
  verification_failed:              '인증에 실패했습니다.',
  verification_expired:             '인증 코드가 만료되었습니다. 다시 받아주세요.',
  too_many_requests:                '시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
  password_incorrect:               '현재 비밀번호가 올바르지 않습니다.',
}

export function clerkErrorToKorean(code: string, fallback = '오류가 발생했습니다. 다시 시도해주세요.'): string {
  return CLERK_ERROR_MAP[code] ?? fallback
}

// 사용법
// { error } 반환 패턴 (signIn.password, signUp.verifications.* 등)
const { error } = await signIn.password({ identifier: email, password })
if (error) setMessage(clerkErrorToKorean(error.code))

// throw 패턴 (user.updatePassword, user.delete 등)
try {
  await user.updatePassword({ currentPassword, newPassword })
} catch (err) {
  const code = (err as { errors?: { code: string }[] })?.errors?.[0]?.code
  setMessage(code ? clerkErrorToKorean(code) : '오류가 발생했습니다.')
}
```

---

## Server-Side Auth

```typescript
// Server Component / Route Handler
import { auth, currentUser } from '@clerk/nextjs/server'

// userId만 필요할 때 (API 호출 없음 — 권장)
const { userId } = await auth()
if (!userId) return null

// 전체 User 객체가 필요할 때만 (Backend API 호출 소비)
const user = await currentUser()

// JWT 토큰
const token = await getToken()
```

---

## 조건부 렌더링

```tsx
import { Show } from '@clerk/nextjs'

// ❌ Core 2: <SignedIn>, <SignedOut> 사용 금지
// ✅ Core 3: <Show when="..."> 사용
<Show when="signed-out">
  <Link href="/sign-in">로그인</Link>
</Show>
<Show when="signed-in">
  <UserDropdown />
</Show>
```

---

## Clerk Webhook

```typescript
// src/app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)
  const evt = wh.verify(body, {
    'svix-id': headersList.get('svix-id')!,
    'svix-timestamp': headersList.get('svix-timestamp')!,
    'svix-signature': headersList.get('svix-signature')!,
  }) as { type: string; data: Record<string, unknown> }

  if (evt.type === 'user.created') {
    // DB에 사용자 INSERT
  }

  return Response.json({ ok: true })
}
```

---

## 자주 하는 실수 체크리스트

- [ ] Next.js 16+: `middleware.ts` → `proxy.ts`로 이름 변경 필수 (src 사용 시 `src/proxy.ts`)
- [ ] `useSignIn()` / `useSignUp()`에서 `isLoaded`, `setActive` 구조분해 금지
- [ ] 세션 활성화는 `setActive()` 아닌 `signIn.finalize()` / `signUp.finalize()`
- [ ] 이메일 인증은 `prepareEmailAddressVerification` → `verifications.sendEmailCode()`
- [ ] 비밀번호 재설정 strategy 문자열 사용 금지 → `resetPasswordEmailCode` 네임스페이스
- [ ] **커스텀 회원가입 폼에 `<div id="clerk-captcha" />` 누락 금지** (봇 방지 필수)
- [ ] 비밀번호 재설정 시 `sendCode()` 전에 `signIn.create({ identifier })` 먼저 호출
- [ ] 인증된 사용자 비밀번호 변경: `signIn.resetPasswordEmailCode.*` ❌ → `user.updatePassword()` ✅
- [ ] 아바타 존재 여부: URL 문자열 검사 ❌ → `user.hasImage` ✅
- [ ] 세션 activity 정보: `useSessionList()` ❌ → `user.getSessions()` ✅
- [ ] 에러 메시지: `error.message` 직접 표시 ❌ → `clerkErrorToKorean(error.code)` ✅
- [ ] sign-in / sign-up 페이지: 이미 로그인된 경우 대시보드 리다이렉트 처리 필수
- [ ] `signIn.password()` 후 `status === 'needs_second_factor'` 처리 필수 — 미처리 시 로그인 무한 대기
- [ ] MFA 이메일 OTP: `signIn.mfa.sendEmailCode()` → `signIn.mfa.verifyEmailCode({ code })` 순서
- [ ] Webhook: 이메일 없는 테스트 이벤트에 400 반환 금지 → `{ ok: true, skipped: 'no_email' }`로 200 반환
- [ ] Clerk quickstart 실행 시 자동 생성되는 샘플 파일 즉시 삭제
- [ ] `@clerk/ui`, `next-themes`는 커스텀 UI 구현 시 불필요 — 설치하지 말 것

---

## References

| 문서 | URL |
|------|-----|
| 공식 문서 홈 | https://clerk.com/docs |
| 커스텀 플로우 개요 (Core 3) | https://clerk.com/docs/guides/development/custom-flows/overview |
| 이메일+비번 커스텀 로그인 | https://clerk.com/docs/guides/development/custom-flows/authentication/sign-in-or-up |
| **MFA 커스텀 플로우 (Core 3)** | https://clerk.com/docs/guides/development/custom-flows/authentication/multi-factor-authentication |
| **봇 방지 / CAPTCHA (커스텀 플로우)** | https://clerk.com/docs/guides/development/custom-flows/authentication/bot-sign-up-protection |
| 비밀번호 변경 (인증된 사용자) | https://clerk.com/docs/guides/development/custom-flows/account-updates/change-password |
| 비밀번호 재설정 (비인증 사용자) | https://clerk.com/docs/guides/development/custom-flows/account-updates/forgot-password |
| 에러 핸들링 (Core 3) | https://clerk.com/docs/nextjs/guides/development/custom-flows/error-handling |
| Core 3 업그레이드 가이드 | https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3 |
| ClerkError 타입 | https://clerk.com/docs/reference/types/clerk-error |
| useSignIn() 레퍼런스 | https://clerk.com/docs/references/react/use-sign-in |
| useSignUp() 레퍼런스 | https://clerk.com/docs/references/react/use-sign-up |
| useUser() | https://clerk.com/docs/hooks/use-user |
| useAuth() | https://clerk.com/docs/hooks/use-auth |
| useClerk() | https://clerk.com/docs/hooks/use-clerk |
| useSessionList() | https://clerk.com/docs/hooks/use-session-list |
| SessionWithActivities | https://clerk.com/docs/references/javascript/session-with-activities |
| Show 컴포넌트 | https://clerk.com/docs/components/control/show |
| auth() 서버 헬퍼 | https://clerk.com/docs/references/nextjs/auth |
| clerkMiddleware | https://clerk.com/docs/references/nextjs/clerk-middleware |
| Webhook 설정 | https://clerk.com/docs/webhooks/overview |
| 환경변수 전체 목록 | https://clerk.com/docs/deployments/clerk-environment-variables |
| Neon + Clerk 연동 | https://clerk.com/docs/integrations/databases/neon |
