---
description: Clerk Authentication & User Management Guideline
globs: "**/*clerk*,**/middleware.ts,**/sign-in/**,**/sign-up/**"
---

# Clerk Authentication & User Management Guideline

> 기준: 2026년 5월 / Clerk v6+ / Next.js App Router

## Must

- `CLERK_SECRET_KEY`는 **절대 클라이언트에 노출 금지** — 서버(Server Component, API Route, Server Action)에서만 사용
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`는 `NEXT_PUBLIC_` 접두사 필수 (클라이언트에서 Clerk 초기화에 필요)
- 미들웨어는 반드시 `clerkMiddleware` + `createRouteMatcher` 조합으로 작성
- 클라이언트 컴포넌트에서 `useUser()`, `useAuth()` 사용 시 `isLoaded` 상태 반드시 확인
- `currentUser()`는 Backend API를 호출하므로 꼭 필요한 경우에만 사용 (rate limit 소비)
- 서버사이드에서 `userId` 확인만 필요하면 `currentUser()` 대신 `auth()` 사용
- `auth().protect()`는 미인증 시 자동으로 로그인 페이지로 리다이렉트
- `privateMetadata`는 클라이언트에 절대 전달 금지 (서버에서만 접근)

## Should

- 미들웨어에서 보호 경로를 명시적으로 선언 (`createRouteMatcher` 사용)
- `publicMetadata`로 사용자 역할(role)을 관리하고 `privateMetadata`는 민감 정보에 사용
- `<SignIn>`, `<SignUp>` 컴포넌트는 전용 페이지(`app/sign-in/[[...sign-in]]`)에 배치
- `appearance` prop으로 Tailwind 클래스를 통해 브랜드 스타일 적용
- Clerk 기본 하단 전환 링크(footer)는 `!hidden` 으로 숨기고 커스텀 UI로 대체
- 온보딩 플로우가 있으면 `sessionClaims.metadata.onboardingComplete`로 분기

## Environment Variables

```env
# .env.local — Next.js 기준

# 필수 (클라이언트 공개)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx

# 필수 (서버 전용 — NEXT_PUBLIC_ 절대 금지)
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx

# 라우트 경로 설정
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# 로그인/가입 후 폴백 리다이렉트 (redirect param 없을 때)
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# 온보딩 플로우가 있는 경우 (항상 강제 리다이렉트)
# NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/onboarding
```

## Middleware Setup

```typescript
// middleware.ts (프로젝트 루트)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)', // Clerk webhook은 인증 없이 수신
])

const isAdminRoute = createRouteMatcher(['/admin(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // 공개 경로가 아니면 인증 필수
  if (!isPublicRoute(req)) {
    await auth.protect()
  }

  // 관리자 경로는 역할/권한 추가 검증
  if (isAdminRoute(req)) {
    await auth.protect((has) =>
      has({ role: 'org:admin' }) || has({ permission: 'org:admin:access' })
    )
  }
})

export const config = {
  matcher: [
    // Next.js 내부 파일 및 정적 파일 제외
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // API / tRPC 항상 실행
    '/(api|trpc)(.*)',
    // Clerk 프론트엔드 API 항상 실행
    '/__clerk/(.*)',
  ],
}
```

## Page Routes

```
app/
├── sign-in/
│   └── [[...sign-in]]/
│       └── page.tsx     ← <SignIn> 컴포넌트 배치
└── sign-up/
    └── [[...sign-up]]/
        └── page.tsx     ← <SignUp> 컴포넌트 배치
```

## Appearance Customization

Tailwind 프로젝트에서 `appearance` prop으로 브랜드 스타일을 적용합니다.
`elements` 값에 Tailwind 클래스를 직접 입력 (`cl-` prefix 없이 사용).
`!hidden`으로 기본 Clerk UI 요소를 강제로 숨길 수 있습니다.

```typescript
// lib/clerk-appearance.ts — 전역 공유 appearance 객체
export const clerkAppearance = {
  variables: {
    colorPrimary: "#18181b",   // zinc-900
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "mx-auto w-full",
    card: "shadow-none border-none bg-white",
    headerTitle: "text-zinc-950 font-semibold text-xl",
    headerSubtitle: "text-zinc-500 text-sm mt-2",
    formFieldInput:
      "border-zinc-200 focus:border-zinc-400 focus:ring-zinc-400",
    buttonPrimary: "bg-zinc-900 hover:bg-zinc-800 text-white shadow-none",
    dividerLine: "bg-zinc-200",
    dividerText: "text-zinc-400",

    // Clerk 기본 하단 전환 링크 완전히 숨김
    // ("Don't have an account?", "Sign up" 링크, "Secured by Clerk" 문구)
    footerAction: "!hidden",      // 링크 컨테이너 숨김
    footerActionText: "!hidden",  // 전환 텍스트 숨김
    footerActionLink: "!hidden",  // 전환 링크 숨김
    footer: "!hidden",            // "Secured by Clerk" 문구 숨김
  },
} satisfies Parameters<typeof import('@clerk/nextjs').SignIn>[0]['appearance']
```

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'
import { clerkAppearance } from '@/lib/clerk-appearance'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn appearance={clerkAppearance} />
      {/* 커스텀 전환 링크 */}
      <p className="mt-4 text-sm text-zinc-500">
        계정이 없으신가요?{' '}
        <a href="/sign-up" className="text-zinc-900 font-medium hover:underline">
          회원가입
        </a>
      </p>
    </div>
  )
}
```

## Server-Side Auth

```typescript
// Server Component
import { auth, currentUser } from '@clerk/nextjs/server'

export default async function DashboardPage() {
  // userId 확인만 필요할 때 — API 호출 없음
  const { userId, orgId, sessionClaims, getToken } = await auth()
  if (!userId) return null

  // 전체 User 객체가 필요할 때만 currentUser() 사용
  const user = await currentUser()

  // JWT 토큰 (외부 API 인증용)
  const token = await getToken()
  // JWT Template 사용 시
  const supabaseToken = await getToken({ template: 'supabase' })

  return <div>Hello, {user?.firstName}</div>
}

// Route Handler
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { userId, isAuthenticated } = await auth()

  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ userId })
}
```

## Client-Side Hooks

모든 클라이언트 훅은 `'use client'` 컴포넌트에서만 사용합니다. `isLoaded`가 `false`인 초기 상태를 반드시 처리해야 합니다.

### 훅 한눈에 보기

| 훅 | 반환값 핵심 | 주 용도 |
|---|---|---|
| `useUser()` | `isLoaded`, `isSignedIn`, `user` | 사용자 프로필 읽기/수정 |
| `useAuth()` | `userId`, `orgId`, `isSignedIn`, `getToken` | 세션 토큰·조직 ID 접근 |
| `useClerk()` | `clerk`, `signOut`, `openSignIn`, `setActive` | 프로그래매틱 인증 제어 |
| `useSession()` | `isLoaded`, `isSignedIn`, `session` | 현재 세션 객체 접근 |
| `useSessionList()` | `isLoaded`, `sessions`, `setActive` | 멀티세션 목록 관리 |
| `useOrganization()` | `organization`, `memberships`, `isLoaded` | 현재 조직 정보 |
| `useOrganizationList()` | `userMemberships`, `setActive`, `createOrganization` | 전체 조직 목록 |
| `useSignIn()` | `signIn`, `errors`, `fetchStatus` | 커스텀 로그인 플로우 |
| `useSignUp()` | `signUp`, `errors`, `fetchStatus` | 커스텀 회원가입 플로우 |

---

### useUser() — 사용자 정보

```tsx
'use client'
import { useUser } from '@clerk/nextjs'

export function UserProfile() {
  const { isLoaded, isSignedIn, user } = useUser()

  if (!isLoaded) return <div>Loading...</div>  // 반드시 isLoaded 확인
  if (!isSignedIn) return null

  return (
    <div>
      <p>Hello, {user.firstName}!</p>
      <p>Email: {user.emailAddresses[0].emailAddress}</p>
      <p>Role: {user.publicMetadata.role as string}</p>
    </div>
  )
}

// 사용자 정보 업데이트
const updateUser = async () => {
  await user.update({ firstName: 'John', lastName: 'Doe' })
  await user.reload() // 메타데이터 변경 후 강제 갱신
}
```

---

### useAuth() — 세션 / 토큰 / 조직

```tsx
'use client'
import { useAuth } from '@clerk/nextjs'

export function TokenFetcher() {
  const { isLoaded, isSignedIn, userId, orgId, orgRole, getToken } = useAuth()

  const fetchProtectedData = async () => {
    const token = await getToken()                        // 기본 세션 토큰
    const supabaseToken = await getToken({ template: 'supabase' }) // JWT Template

    await fetch('/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  if (!isLoaded || !isSignedIn) return null
  return (
    <div>
      <p>User: {userId}</p>
      <p>Org: {orgId} / Role: {orgRole}</p>
      <button onClick={fetchProtectedData}>Fetch Protected</button>
    </div>
  )
}
```

---

### useClerk() — 프로그래매틱 인증 제어

```tsx
'use client'
import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export function AuthControls() {
  const { signOut, openSignIn, openSignUp, setActive, client } = useClerk()
  const router = useRouter()

  return (
    <div>
      {/* 모달로 로그인창 열기 */}
      <button onClick={() => openSignIn({})}>로그인</button>
      <button onClick={() => openSignUp({})}>회원가입</button>

      {/* 전체 세션 로그아웃 후 홈으로 이동 */}
      <button onClick={() => signOut(() => router.push('/'))}>로그아웃</button>

      {/* 특정 세션만 로그아웃 (멀티세션) */}
      <button onClick={() => signOut(client.activeSessions[0].id)}>
        이 세션만 로그아웃
      </button>
    </div>
  )
}
```

---

### useSession() / useSessionList() — 세션 관리

```tsx
'use client'
import { useSession, useSessionList } from '@clerk/nextjs'

// 현재 세션 단건
export function SessionInfo() {
  const { isLoaded, session } = useSession()
  if (!isLoaded || !session) return null
  return <p>Session ID: {session.id} / Expires: {session.expireAt.toLocaleDateString()}</p>
}

// 멀티세션 목록 (여러 계정 전환)
export function SessionSwitcher() {
  const { isLoaded, sessions, setActive } = useSessionList()
  if (!isLoaded) return null

  return (
    <ul>
      {sessions.map((s) => (
        <li key={s.id}>
          {s.user?.emailAddresses[0].emailAddress}
          <button onClick={() => setActive({ session: s.id })}>전환</button>
        </li>
      ))}
    </ul>
  )
}
```

---

### useOrganization() — 현재 조직

```tsx
'use client'
import { useOrganization } from '@clerk/nextjs'

export function OrgDashboard() {
  const { isLoaded, organization, memberships } = useOrganization({
    memberships: { pageSize: 10, infinite: true }, // 필요한 경우에만 명시적 요청
  })

  if (!isLoaded) return <div>Loading...</div>
  if (!organization) return <div>조직을 선택해주세요.</div>

  return (
    <div>
      <h1>{organization.name}</h1>
      <p>Members: {memberships?.count}</p>
      <ul>
        {memberships?.data?.map((mem) => (
          <li key={mem.id}>
            {mem.publicUserData?.identifier} — {mem.role}
          </li>
        ))}
      </ul>
      {memberships?.hasNextPage && (
        <button onClick={memberships.fetchNext}>더 보기</button>
      )}
    </div>
  )
}
```

---

### useOrganizationList() — 조직 목록 전환

```tsx
'use client'
import { useOrganizationList } from '@clerk/nextjs'

export function OrgSwitcher() {
  const { isLoaded, userMemberships, setActive, createOrganization } =
    useOrganizationList({ userMemberships: { infinite: true } })

  if (!isLoaded) return null

  return (
    <ul>
      {userMemberships.data?.map((mem) => (
        <li key={mem.id}>
          {mem.organization.name}
          <button onClick={() => setActive({ organization: mem.organization.id })}>
            선택
          </button>
        </li>
      ))}
    </ul>
  )
}
```

---

### useSignIn() / useSignUp() — 커스텀 인증 플로우

프리빌트 컴포넌트(`<SignIn>`, `<SignUp>`) 대신 완전히 커스텀 UI가 필요할 때 사용합니다.

```tsx
'use client'
import { useSignIn } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export function CustomSignInForm() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    // 1단계: 이메일 코드 전송
    await signIn.create({ identifier: formData.get('email') as string })

    const emailFactor = signIn.supportedFirstFactors?.find(
      (f) => f.strategy === 'email_code'
    )
    if (emailFactor) {
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: (emailFactor as any).emailAddressId,
      })
    }
  }

  const handleVerify = async (code: string) => {
    const result = await signIn.attemptFirstFactor({
      strategy: 'email_code',
      code,
    })
    if (result.status === 'complete') router.push('/dashboard')
  }

  return (
    <form onSubmit={handleSubmit}>
      {errors?.fields?.emailAddress && (
        <p className="text-red-500">{errors.fields.emailAddress.message}</p>
      )}
      <input name="email" type="email" required />
      <button type="submit" disabled={fetchStatus === 'fetching'}>
        인증 코드 전송
      </button>
    </form>
  )
}
```

## 조건부 렌더링 컴포넌트

`<SignedIn>` / `<SignedOut>` 대신 Clerk v6+에서는 `<Show>` 컴포넌트를 사용합니다.

```tsx
'use client'
import { Show, UserButton, SignInButton } from '@clerk/nextjs'

export function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <Logo />
      <div className="flex items-center gap-4">
        {/* 로그인 상태에 따라 조건부 렌더 */}
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="btn-primary">로그인</button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          {/* 프로필 드롭다운 (아바타 + 설정 + 로그아웃) */}
          <UserButton afterSignOutUrl="/" />
        </Show>
      </div>
    </header>
  )
}
```

## Clerk Elements (헤드리스 커스텀 플로우)

`<SignIn>` / `<SignUp>` 프리빌트 컴포넌트 대신 완전한 커스텀 UI가 필요할 때 사용합니다.
`@clerk/elements/sign-in`, `@clerk/elements/sign-up`, `@clerk/elements/common`으로 구성됩니다.

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
'use client'

import * as Clerk from '@clerk/elements/common'
import * as SignIn from '@clerk/elements/sign-in'

export default function SignInPage() {
  return (
    <SignIn.Root>
      {/* start: 이메일/소셜 입력 단계 */}
      <SignIn.Step name="start" className="space-y-4 rounded-2xl bg-white p-8 shadow-sm">
        {/* 소셜 로그인 */}
        <Clerk.Connection name="google" className="btn-social">
          <Clerk.Icon />
          Google로 로그인
        </Clerk.Connection>

        {/* 이메일 입력 */}
        <Clerk.Field name="identifier">
          <Clerk.Label className="text-sm font-medium">이메일</Clerk.Label>
          <Clerk.Input type="email" required className="input" />
          <Clerk.FieldError className="text-sm text-red-500" />
        </Clerk.Field>

        <Clerk.GlobalError className="text-sm text-red-500" />
        <SignIn.Action submit className="btn-primary w-full">계속</SignIn.Action>
      </SignIn.Step>

      {/* verifications: 코드 검증 단계 */}
      <SignIn.Step name="verifications">
        <SignIn.Strategy name="email_code">
          <Clerk.Field name="code">
            <Clerk.Label className="text-sm font-medium">인증 코드</Clerk.Label>
            <Clerk.Input type="otp" className="input" />
            <Clerk.FieldError className="text-sm text-red-500" />
          </Clerk.Field>
          <SignIn.Action submit className="btn-primary w-full">인증</SignIn.Action>
          <SignIn.Action resend className="text-sm text-zinc-500">
            코드 재전송
          </SignIn.Action>
        </SignIn.Strategy>
      </SignIn.Step>

      {/* 비밀번호 재설정 단계 */}
      <SignIn.Step name="forgot-password" />
      <SignIn.Step name="reset-password" />
    </SignIn.Root>
  )
}
```

> **선택 기준**: `appearance` prop 커스터마이징으로 충분하면 `<SignIn>` 프리빌트 사용. 레이아웃/애니메이션까지 완전히 제어해야 하면 Clerk Elements 사용.

## User Metadata

| 타입 | 접근 | 용도 |
|---|---|---|
| `publicMetadata` | 서버 + 클라이언트 | 사용자 역할(role), 플랜 구분 |
| `privateMetadata` | **서버 전용** | 결제 정보, 내부 식별자 등 민감 데이터 |
| `unsafeMetadata` | 클라이언트 읽기/쓰기 | 비민감 UI 설정 (사용 최소화) |

```typescript
// Server Action — publicMetadata 업데이트 (clerkClient 사용)
import { clerkClient } from '@clerk/nextjs/server'

export async function setUserRole(userId: string, role: string) {
  const client = await clerkClient()
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role },
  })
}
```

## Recommended Patterns

- **온보딩 리다이렉트**: `sessionClaims?.metadata?.onboardingComplete` 가 false면 `/onboarding`으로 리다이렉트
- **역할 기반 접근**: `auth.protect({ role: 'org:admin' })` 또는 `has({ permission: '...' })`
- **Webhook 수신**: `/api/webhooks/clerk` 경로를 미들웨어 public 경로에 추가 + `svix` 서명 검증
- **`<ClerkProvider>`**: `app/layout.tsx` 최상단에 배치, `appearance` prop으로 전역 스타일 적용
- `appearance`를 공유 상수(`lib/clerk-appearance.ts`)로 분리해 `<SignIn>`, `<SignUp>`, `<ClerkProvider>` 모두 동일하게 적용

## Security Best Practices

- `CLERK_SECRET_KEY`는 서버에서만 사용, 로그 출력 금지
- Webhook 수신 엔드포인트는 반드시 `svix` 서명 검증 (`@clerk/nextjs`의 `verifyWebhook` 또는 `svix` 패키지)
- `privateMetadata`는 API Route / Server Action에서만 접근
- 미들웨어 `matcher`에서 `_next`, 정적 파일, `__clerk` 경로를 올바르게 설정
- 세션 토큰(`getToken()`) 만료 처리 — 클라이언트에서 주기적으로 갱신

---

## References

| 문서 | URL |
|---|---|
| 공식 문서 홈 | https://clerk.com/docs |
| Next.js 퀵스타트 | https://clerk.com/docs/quickstarts/nextjs |
| clerkMiddleware | https://clerk.com/docs/references/nextjs/clerk-middleware |
| 환경변수 전체 목록 | https://clerk.com/docs/deployments/clerk-environment-variables |
| Appearance 커스터마이징 | https://clerk.com/docs/customization/overview |
| Appearance variables | https://clerk.com/docs/customization/variables |
| Appearance elements | https://clerk.com/docs/customization/elements |
| Clerk Elements (헤드리스) | https://clerk.com/docs/customization/elements/overview |
| Clerk Elements 예시 | https://clerk.com/docs/customization/elements/examples/sign-in |
| useUser() | https://clerk.com/docs/hooks/use-user |
| useAuth() | https://clerk.com/docs/hooks/use-auth |
| useClerk() | https://clerk.com/docs/hooks/use-clerk |
| useSession() | https://clerk.com/docs/hooks/use-session |
| useSessionList() | https://clerk.com/docs/hooks/use-session-list |
| useOrganization() | https://clerk.com/docs/hooks/use-organization |
| useOrganizationList() | https://clerk.com/docs/hooks/use-organization-list |
| useSignIn() | https://clerk.com/docs/hooks/use-sign-in |
| useSignUp() | https://clerk.com/docs/hooks/use-sign-up |
| Show 컴포넌트 | https://clerk.com/docs/components/control/show |
| UserButton 컴포넌트 | https://clerk.com/docs/components/user/user-button |
| auth() 서버 헬퍼 | https://clerk.com/docs/references/nextjs/auth |
| currentUser() | https://clerk.com/docs/references/nextjs/current-user |
| Metadata 가이드 | https://clerk.com/docs/users/metadata |
| Webhook 설정 | https://clerk.com/docs/webhooks/overview |
| 커스텀 인증 플로우 | https://clerk.com/docs/guides/development/custom-flows/authentication |
| Neon + Clerk 연동 | https://clerk.com/docs/integrations/databases/neon |
