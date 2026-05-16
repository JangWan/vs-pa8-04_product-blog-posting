---
description: Next.js 10x Developer Guideline (App Router)
globs: "src/**/*.ts,src/**/*.tsx,src/**/*.js,src/**/*.jsx"
---

# Next.js 10x Developer 가이드라인 (2026 Edition)

> 기준: 2026년 5월 / Next.js v16 / App Router / React 19
> 23년 경력 시니어 개발자로서 클린 코드와 확장 가능한 구조를 지향합니다.

---

## 0. Next.js 16 주요 변경사항 (Breaking Changes)

### `middleware.ts` → `proxy.ts` 파일 컨벤션 변경

> **에러**: `The "middleware" file convention is deprecated. Please use "proxy" instead.`  
> 참고: https://nextjs.org/docs/messages/middleware-to-proxy

Next.js 16부터 엣지 요청 처리 파일의 이름이 변경되었습니다.

| 구분 | Next.js 15 이하 | Next.js 16+ |
|------|----------------|-------------|
| 파일명 | `middleware.ts` | `proxy.ts` |
| 위치 | `src/middleware.ts` (src 디렉토리 사용 시) | `src/proxy.ts` |
| 내용 | 동일 — `clerkMiddleware`, `createRouteMatcher` 등 그대로 사용 |

```typescript
// src/proxy.ts (Next.js 16+)
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
```

> ⚠️ `middleware.ts`를 그대로 두면 경고가 아닌 **동작 오류**로 이어질 수 있습니다. 신규 프로젝트는 처음부터 `proxy.ts`를 사용하세요.

---

## 1. 핵심 준수 사항 (Must)

- **컴포넌트 원칙**: 모든 UI 컴포넌트는 기본적으로 클라이언트 컴포넌트(`"use client"`)로 유지합니다.
- **비동기 Props**: `page.tsx` / `layout.tsx`의 `params` 및 `searchParams`는 반드시 `Promise` 타입을 사용하고 `await`로 접근합니다. (Next.js 15+ 표준)
- **PageProps 타입**: Next.js 16부터 `PageProps<'/path/[slug]'>` 헬퍼 타입을 사용합니다.
- **API 라우팅**: 모든 API 요청은 `@/lib/remote/api-client`를 통해 수행하며, Hono 라우트 경로는 반드시 `/api` prefix를 포함합니다.
- **로깅**: `AppLogger`를 사용하며, `logger.log()` 대신 수준별 메서드(`info`, `error`, `warn`, `debug`)를 사용합니다.
- **스키마 검증**: API 응답 스키마의 경로 필드는 `z.string()`을 사용하여 상대 경로를 허용합니다.
- **fetch 캐시 명시**: Next.js 15+부터 `fetch()`의 기본값이 `no-store`로 변경되었습니다. 캐시가 필요한 요청은 반드시 `cache` 옵션을 명시합니다.

```typescript
// Next.js 15+ — 기본값은 no-store (캐시 없음)
fetch('/api/data')                          // no-store (기본)
fetch('/api/data', { cache: 'force-cache' }) // 명시적 캐시
fetch('/api/data', { next: { revalidate: 60 } }) // ISR: 60초
```

```typescript
// Next.js 16 — PageProps 헬퍼 타입
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const query = await props.searchParams
  return <h1>Blog Post: {slug}</h1>
}
```

---

## 2. 권장 라이브러리 (Tech Stack)

기능별로 검증된 다음 라이브러리들을 우선적으로 사용합니다.

| 카테고리 | 라이브러리 | 비고 |
|---|---|---|
| **상태 관리** | `zustand` | 글로벌 상태 |
| **서버 상태** | `@tanstack/react-query` | 서버 데이터 패칭/캐싱 |
| **폼** | `react-hook-form` + `zod` | 검증 포함 |
| **타입 분기** | `ts-pattern` | 타입 안전 패턴 매칭 |
| **날짜** | `date-fns` | 경량 날짜 유틸 |
| **유틸리티** | `es-toolkit` | lodash 대체 |
| **공통 훅** | `react-use` | 자주 쓰는 훅 모음 |
| **아이콘** | `lucide-react` | shadcn/ui 선택 시 번들 포함 (`docs/tech/shadcn.md`) |
| **UI / 스타일** | 프로젝트별 선택 | shadcn/ui+Tailwind 또는 Mantine (`docs/tech/shadcn.md`, `docs/tech/mantine.md`, `docs/tech/tailwind.md`) |
| **백엔드** | `hono` | 경량 API 라우터 |
| **DB/Auth** | 프로젝트별 선택 | Supabase 또는 Neon+Clerk 등 (`docs/tech/` 참조) |

---

## 3. Server vs Client Component 결정 기준

```
Server Component 사용 ✅          Client Component ("use client") 사용 ✅
─────────────────────────────     ──────────────────────────────────────
데이터 페칭 (DB, API)             onClick, onChange 이벤트 핸들러
민감한 정보 (API Key, 토큰)       useState, useReducer, useEffect
SEO 중요 콘텐츠                   브라우저 API (localStorage, window)
무거운 라이브러리 (서버만 실행)    커스텀 훅 (상태/사이드이펙트 포함)
정적 레이아웃 / 레이아웃 셸       애니메이션, 인터랙션
```

> **이 프로젝트 원칙**: UI 컴포넌트는 기본 `"use client"`. 서버 컴포넌트는 데이터 페칭이 명확히 필요한 경우에만 사용합니다.

---

## 4. 디렉토리 구조 (Feature-based Architecture)

관심사 분리 및 유지보수성을 위해 기능 기반 구조를 따릅니다.

```
src/
├── app/                          # Next.js App Router (비즈니스 로직 최소화)
│   ├── (auth)/                   # 라우트 그룹 — 레이아웃 분리
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── api/[[...hono]]/route.ts  # Hono 위임 진입점
│   ├── layout.tsx                # 루트 레이아웃
│   ├── loading.tsx               # 루트 로딩 UI (Suspense 자동 래핑)
│   ├── error.tsx                 # 루트 에러 바운더리
│   └── not-found.tsx             # 404 처리
├── backend/
│   ├── hono/                     # Hono 앱 본체 (app.ts, context.ts)
│   ├── middleware/               # 에러, 컨텍스트, Supabase 공통 미들웨어
│   └── http/                     # 응답 포맷 및 핸들러 유틸
├── features/[featureName]/       # 기능 단위 독립 모듈
│   ├── components/               # 기능 전용 컴포넌트
│   ├── hooks/                    # 기능 전용 훅
│   ├── backend/
│   │   ├── route.ts              # Hono 라우터
│   │   ├── service.ts            # 비즈니스 로직 / DB
│   │   └── schema.ts             # Zod 스키마
│   └── lib/                      # 클라이언트용 DTO, 유틸
├── lib/                          # 공통 유틸
├── hooks/                        # 공통 훅
└── remote/                       # API 클라이언트
```

### 특수 파일 규칙 (App Router)

| 파일 | 역할 |
|---|---|
| `page.tsx` | 라우트 UI, URL 직접 접근 가능 |
| `layout.tsx` | 중첩 레이아웃, 상태 유지 |
| `loading.tsx` | `<Suspense>` 자동 래핑 스켈레톤 |
| `error.tsx` | 에러 바운더리 (`"use client"` 필수) |
| `not-found.tsx` | `notFound()` 호출 또는 404 처리 |
| `route.ts` | API Route Handler (GET, POST 등) |
| `template.tsx` | 레이아웃과 유사하나 매 탐색 시 재마운트 |

---

## 5. 백엔드 레이어 (Hono + Next.js)

- **위임 구조**: `src/app/api/[[...hono]]/route.ts`에서 Hono 앱으로 모든 요청을 위임합니다.
- **싱글턴 패턴**: `createHonoApp`은 싱글턴으로 관리하되, **개발 환경에서는 매번 재생성**하여 HMR 시 라우터 변경사항이 반영되도록 합니다.
- **빌딩 블록 순서**:
  1. `errorBoundary()` — 에러 로깅 및 응답 정규화
  2. `withAppContext()` — 환경 변수 파싱 및 로거 주입
  3. `withSupabase()` — per-request 기반 Supabase 클라이언트 주입
  4. 기능별 라우터 등록

```typescript
// src/app/api/[[...hono]]/route.ts
import { getHonoApp } from '@/backend/hono/app'

const handler = (req: Request) => getHonoApp().fetch(req)

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH }
```

---

## 6. 데이터 페칭 & 캐싱 전략

### Next.js 15 캐싱 기본값 변경 (중요)

```
v14: fetch() → force-cache (기본 캐시)
v15: fetch() → no-store  (기본 캐시 없음) ← 현재 표준
```

### 캐싱 Directive (Next.js 15/16 신규)

```typescript
// 'use cache' — 함수/컴포넌트 수준 캐싱 (빌드 타임)
async function getBlogPosts() {
  'use cache'
  cacheTag('posts')
  cacheLife('hours') // 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks'
  return fetch('https://api.example.com/posts').then(r => r.json())
}

// 'use cache: remote' — 런타임 원격 캐시 (사용자 공유, serverless 최적)
async function getProductPrice(id: string) {
  'use cache: remote'
  cacheTag(`product-price-${id}`)
  cacheLife({ expire: 300 }) // 초 단위
  return db.products.getPrice(id)
}

// 'use cache: private' — 사용자별 개인화 캐시 (공유 안 됨)
async function getUserRecommendations() {
  'use cache: private'
  cacheLife({ expire: 60 })
  const sessionId = (await cookies()).get('session-id')?.value
  return db.recommendations.findMany({ where: { sessionId } })
}
```

### 캐시 무효화

```typescript
import { revalidatePath, revalidateTag, updateTag } from 'next/cache'

// 경로 기반 무효화
revalidatePath('/posts')
revalidatePath('/posts/[slug]', 'page')

// 태그 기반 무효화 (권장)
revalidateTag('posts')         // 기존 방식
updateTag('posts')             // Next.js 16 신규 — Server Action 내에서 사용
```

### Server Actions 패턴

```typescript
// features/posts/backend/actions.ts
'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const title = formData.get('title') as string

  // 데이터 변경
  await db.post.create({ data: { title, userId } })

  // 캐시 무효화
  revalidatePath('/posts')
}
```

```tsx
// Client Component에서 Server Action 연결
'use client'
import { createPost } from '@/features/posts/backend/actions'

export function CreatePostForm() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">작성</button>
    </form>
  )
}
```

---

## 7. 렌더링 패턴

### Suspense + Streaming

```tsx
// loading.tsx — page 전체를 Suspense로 자동 래핑
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-zinc-200" />
      <div className="h-4 w-full rounded bg-zinc-200" />
    </div>
  )
}

// 컴포넌트 수준 Suspense — 부분 스트리밍
import { Suspense } from 'react'

export default function Page() {
  return (
    <>
      <StaticContent />           {/* 즉시 렌더 */}
      <Suspense fallback={<Skeleton />}>
        <DynamicContent />        {/* 스트리밍 */}
      </Suspense>
    </>
  )
}
```

### error.tsx / not-found.tsx

```tsx
// error.tsx — 반드시 "use client"
'use client'
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <p>오류가 발생했습니다.</p>
      <button onClick={reset}>다시 시도</button>
    </div>
  )
}

// not-found.tsx
import { notFound } from 'next/navigation'
// 컴포넌트 내에서: notFound() 호출 → not-found.tsx 렌더
```

---

## 8. 성능 최적화

### Image

```tsx
import Image from 'next/image'

// 필수 props: src, alt, width+height 또는 fill
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority        // 어보브-더-폴드 이미지
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

### Font

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // 폰트 로딩 중 fallback 폰트 표시 → CLS 방지
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
```

### Metadata API

```typescript
// app/layout.tsx — 정적 메타데이터
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: '사이트명', template: '%s | 사이트명' },
  description: '사이트 설명',
  openGraph: { type: 'website', locale: 'ko_KR' },
}

// app/blog/[slug]/page.tsx — 동적 메타데이터
export async function generateMetadata(props: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await props.params
  const post = await getPost(slug)
  return { title: post.title, description: post.description }
}
```

---

## 9. 코딩 스타일 및 마인드셋 (Code Excellence)

- **Clean Logic**: **Early Returns**를 활용하고, 삼항 연산자보다 조건부 클래스 결합을 선호합니다.
- **Functional Paradigm**: 불변성 유지, 순수 함수 지향, 상속보다 합성(Composition)을 우선합니다.
- **Pragmatism**: 복잡함을 지양하고 단순함과 가독성을 최우선으로 합니다. (DRY 원칙 준수)
- **Error Handling**: 예외를 던지기보다 명시적으로 에러를 반환하는 패턴(`success`/`failure`)을 사용합니다.
- **TypeScript**: `any` 사용 금지. 타입 추론을 최대한 활용하고, 필요한 경우 `satisfies` 연산자로 타입 안전성 확보.

```typescript
// ✅ 명시적 에러 반환 패턴
type Result<T> = { success: true; data: T } | { success: false; error: string }

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.user.findUnique({ where: { id } })
    if (!user) return { success: false, error: 'User not found' }
    return { success: true, data: user }
  } catch {
    return { success: false, error: 'Database error' }
  }
}
```

---

## 10. 개발 워크플로우 (pnpm + Turbopack)

- **패키지 매니저**: 모든 패키지 관리는 `pnpm`을 사용합니다.
- **개발 서버**: Next.js 15+부터 Turbopack이 기본값 (`pnpm dev` → 자동 활성화).

```bash
pnpm dev          # Turbopack 개발 서버 (Next.js 15+ 기본)
pnpm build        # 프로덕션 빌드
pnpm start        # 프로덕션 서버 실행
pnpm lint         # ESLint 검사
pnpm type-check   # TypeScript 타입 검사 (tsc --noEmit)
```

- **변경 로그**: 코드 수정 후에는 반드시 `[Change Analysis Report]` 구조로 기록을 남깁니다.
- **커밋**: 작업 완료 후 최근 기록을 참고하여 적절한 메시지와 함께 커밋을 수행합니다.

---

## References

| 문서 | URL |
|---|---|
| Next.js 공식 문서 | https://nextjs.org/docs |
| App Router 시작 가이드 | https://nextjs.org/docs/app/getting-started |
| v15 업그레이드 가이드 | https://nextjs.org/docs/app/guides/upgrading/version-15 |
| v16 업그레이드 가이드 | https://nextjs.org/docs/app/guides/upgrading/version-16 |
| Server & Client Components | https://nextjs.org/docs/app/getting-started/server-and-client-components |
| 데이터 페칭 | https://nextjs.org/docs/app/getting-started/fetching-data |
| 데이터 변경 (Mutations) | https://nextjs.org/docs/app/getting-started/mutating-data |
| 캐싱 전략 | https://nextjs.org/docs/app/getting-started/caching |
| `use cache` directive | https://nextjs.org/docs/app/api-reference/directives/use-cache |
| `cacheLife` / `cacheTag` | https://nextjs.org/docs/app/api-reference/functions/cacheLife |
| Server Actions | https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations |
| Metadata API | https://nextjs.org/docs/app/getting-started/metadata-and-og-images |
| next/image | https://nextjs.org/docs/app/api-reference/components/image |
| next/font | https://nextjs.org/docs/app/api-reference/components/font |
| Streaming & Suspense | https://nextjs.org/docs/app/guides/streaming |
