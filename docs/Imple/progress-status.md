# 구현 진행 상태 — IndiePost AI

> 마지막 업데이트: 2026-05-15
> 참조: docs/usecase/usecase-common.md §0 (전체 UC 목록)

---

## 0. 환경 설정 (사전 준비)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| ENV-01 | Next.js v16 + pnpm 초기화 | ✅ 완료 | |
| ENV-02 | shadcn/ui 초기화 (Nova 프리셋) | ✅ 완료 | components.json 생성 |
| ENV-03 | 핵심 의존성 설치 (부분) | ⚠️ 수정 필요 | ENV-03a 참조 |
| ENV-03a | 패키지 수정 (사용자 실행 필요) | ❌ 미완료 | 아래 명령어 참조 |
| ENV-04 | package.json scripts 수정 | ✅ 완료 | type-check, test 추가 |
| ENV-05 | globals.css Notion 디자인 토큰 | ✅ 완료 | |
| ENV-06 | layout.tsx Inter 폰트 + 메타데이터 | ✅ 완료 | |
| ENV-07 | 디렉토리 구조 생성 | ✅ 완료 | backend/, features/, db/ |
| ENV-08 | .env.local 설정 | ❌ 미완료 | 사용자 직접 설정 필요 |
| ENV-09 | Neon DB 프로젝트 생성 | ❌ 미완료 | UC-02 이전 사용자 설정 |
| ENV-10 | Clerk 프로젝트 생성 + 환경변수 | ❌ 미완료 | UC-02 이전 사용자 설정 |
| ENV-11 | Clerk Webhook 설정 | ❌ 미완료 | UC-02 구현 완료 후 설정 |
| ENV-12 | drizzle.config.ts 생성 | ✅ 완료 | |
| ENV-13 | DB 스키마 정의 (schema.ts) | ✅ 완료 | users, guidelines, contents |
| ENV-14 | 마이그레이션 실행 (사용자 실행) | ❌ 미완료 | ENV-09, ENV-10 완료 후 |

> **ENV-03a 패키지 수정 명령어** (사용자 실행 필요):
> ```bash
> pnpm remove @google/generative-ai @clerk/types postgres
> pnpm add @google/genai @neondatabase/serverless
> ```

---

## 1. UC-01 — 랜딩 페이지 (`/`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 01-01 | PublicLayout (PublicHeader + Footer) | ✅ 완료 | 각 컴포넌트 구현 |
| 01-02 | Hero 섹션 (TypingAnimation + CTA) | ✅ 완료 | 인라인 TypingAnimation 구현 |
| 01-03 | 문제 제기 섹션 (3-column 카드) | ✅ 완료 | |
| 01-04 | 기능 소개 섹션 (id="features") | ✅ 완료 | 교대 레이아웃 |
| 01-05 | 유사 서비스 비교 테이블 | ✅ 완료 | |
| 01-06 | 하단 CTA 섹션 (Magic UI Ripple) | ✅ 완료 | 인라인 Ripple 구현 |
| 01-07 | generateMetadata SEO 메타태그 | ✅ 완료 | |
| 01-08 | Framer Motion 페이지 전환 | ❌ 미완료 | UC-02 이후 적용 |
| 01-09 | 로그인 상태 분기 처리 | ✅ 완료 | Clerk Show 컴포넌트 |

---

## 2. UC-02~05 — 인증 (`/sign-in`, `/sign-up`)

| #     | 항목                                      | 상태   | 비고                                 |
| ----- | --------------------------------------- | ---- | ---------------------------------- |
| 02-01 | Clerk 미들웨어 (middleware.ts)              | ✅ 완료 | createRouteMatcher로 공개/보호 경로 분리    |
| 02-02 | ClerkProvider 적용 (layout.tsx)           | ✅ 완료 | 이전 세션에서 완료                         |
| 02-03 | AuthLayout 컴포넌트                         | ✅ 완료 | (public)/layout.tsx 로 구현           |
| 02-04 | 회원가입 페이지 (/sign-up)                     | ✅ 완료 | useSignUp 커스텀 UI (이메일+비번+확인+OTP)   |
| 02-05 | 로그인 페이지 (/sign-in)                      | ✅ 완료 | useSignIn 커스텀 UI (이메일+비번+비번찾기 3단계) |
| 02-06 | 비밀번호 찾기 (로그인 폼 단계 전환)                   | ✅ 완료 | 동일 페이지 내 step 전환                   |
| 02-07 | Clerk Webhook 핸들러 (/api/webhooks/clerk) | ✅ 완료 | svix 서명 검증                         |
| 02-08 | users 테이블 INSERT (Webhook → DB)         | ✅ 완료 | user.created 이벤트 → DB INSERT       |

---

## 3. UC-06 — 대시보드 (`/dashboard`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 03-01 | DashboardLayout (Sidebar + MobileHeader + Sheet) | ❌ 미완료 | |
| 03-02 | Sidebar 컴포넌트 (네비게이션 + UserButton) | ❌ 미완료 | |
| 03-03 | 대시보드 홈 페이지 | ❌ 미완료 | |
| 03-04 | 최근 생성 5개 카드 (GET /api/history?limit=5) | ❌ 미완료 | |
| 03-05 | 지침 현황 표시 | ❌ 미완료 | |
| 03-06 | Empty State (지침 0개) | ❌ 미완료 | |
| 03-07 | 스켈레톤 로딩 | ❌ 미완료 | |

---

## 4. UC-07~09 — 콘텐츠 생성 (`/generate`, `/generate/[id]`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 04-01 | Hono 앱 진입점 (/api/[[...hono]]/route.ts) | ❌ 미완료 | |
| 04-02 | Gemini API 싱글턴 (lib/gemini.ts) | ❌ 미완료 | @google/genai |
| 04-03 | POST /api/generate/stream — AI 스트리밍 | ❌ 미완료 | ReadableStream |
| 04-04 | 콘텐츠 생성 폼 페이지 (/generate) | ❌ 미완료 | |
| 04-05 | 스트리밍 실시간 텍스트 표시 | ❌ 미완료 | Zustand 상태 |
| 04-06 | [DONE] 청크 파싱 + /generate/[id] 리다이렉트 | ❌ 미완료 | |
| 04-07 | 생성 결과 에디터 (/generate/[id]) | ❌ 미완료 | @mdxeditor/editor |
| 04-08 | 저장·복사·마크다운 다운로드 | ❌ 미완료 | |
| 04-09 | PUT /api/history/:id — 에디터 수동 저장 | ❌ 미완료 | |
| 04-10 | GET /api/history/:id — 이력 단건 조회 | ❌ 미완료 | |
| 04-11 | Gemini Rate Limit 429 처리 | ❌ 미완료 | 토스트 안내 |

---

## 5. UC-10~14 — 지침 관리 (`/guidelines`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 05-01 | GET /api/guidelines — 지침 목록 | ❌ 미완료 | |
| 05-02 | POST /api/guidelines — 지침 생성 | ❌ 미완료 | |
| 05-03 | GET /api/guidelines/:id — 단건 조회 | ❌ 미완료 | |
| 05-04 | PUT /api/guidelines/:id — 수정/기본 설정 | ❌ 미완료 | |
| 05-05 | DELETE /api/guidelines/:id — 삭제 | ❌ 미완료 | |
| 05-06 | 지침 목록 페이지 (/guidelines) | ❌ 미완료 | |
| 05-07 | 지침 생성 페이지 (/guidelines/new) | ❌ 미완료 | |
| 05-08 | 지침 수정 페이지 (/guidelines/[id]) | ❌ 미완료 | |
| 05-09 | 삭제 확인 AlertDialog | ❌ 미완료 | |
| 05-10 | 기본 지침 설정 토글 | ❌ 미완료 | BR-11 단일 기본 지침 |

---

## 현재 진행 단계

```
[완료] ENV 설정 수정 (ENV-04~07, ENV-12, ENV-13 완료)
[완료] UC-01 랜딩 페이지 (01-01~07, 01-09 완료 | 01-08 Framer Motion 미완료)
[완료] UC-02~05 인증 (02-01~08 전체 완료)
[다음] UC-06 대시보드 (ENV-09, ENV-10, ENV-14 설정 완료 후 진행)
```

### 사용자 액션 필요 항목 (다음 단계 진행 전)

1. **패키지 수정** (ENV-03a):
   ```bash
   pnpm remove @google/generative-ai @clerk/types postgres
   pnpm add @google/genai @neondatabase/serverless
   ```

2. **Neon DB 생성** (ENV-09): https://neon.tech → 프로젝트 생성 → DATABASE_URL 복사

3. **Clerk 프로젝트 생성** (ENV-10): https://clerk.com → 앱 생성 → API Keys 복사

4. **.env.local 생성** (ENV-08): 아래 내용으로 파일 생성
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   CLERK_WEBHOOK_SECRET=whsec_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   DATABASE_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
   GOOGLE_GENAI_API_KEY=AIzaSy...
   GEMINI_MODEL=gemini-3.1-flash
   ```
