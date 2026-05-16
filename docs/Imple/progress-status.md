# 구현 진행 상태 — IndiePost AI

> 마지막 업데이트: 2026-05-16
> 참조: docs/usecase/usecase-common.md §0 (전체 UC 목록)

---

## 0. 환경 설정 (사전 준비)

| #       | 항목                          | 상태   | 비고                          |
| ------- | --------------------------- | ---- | --------------------------- |
| ENV-01  | Next.js v16 + pnpm 초기화      | ✅ 완료 |                             |
| ENV-02  | shadcn/ui 초기화 (Nova 프리셋)    | ✅ 완료 | components.json 생성          |
| ENV-03  | 핵심 의존성 설치                   | ✅ 완료 |                             |
| ENV-04  | package.json scripts 수정     | ✅ 완료 | type-check, test 추가         |
| ENV-05  | globals.css Notion 디자인 토큰   | ✅ 완료 |                             |
| ENV-06  | layout.tsx Inter 폰트 + 메타데이터 | ✅ 완료 |                             |
| ENV-07  | 디렉토리 구조 생성                  | ✅ 완료 | backend/, features/, db/    |
| ENV-08  | .env.local 설정               | ✅ 완료 | 사용자 직접 설정                   |
| ENV-09  | Neon DB 프로젝트 생성             | ✅ 완료 | 사용자 설정 완료                   |
| ENV-10  | Clerk 프로젝트 생성 + 환경변수        | ✅ 완료 | 사용자 설정 완료                   |
| ENV-11  | Clerk Webhook 설정            | ✅ 완료 |                             |
| ENV-12  | drizzle.config.ts 생성        | ✅ 완료 |                             |
| ENV-13  | DB 스키마 정의 (schema.ts)       | ✅ 완료 | users, guidelines, contents |
| ENV-14  | 마이그레이션 실행                   | ✅ 완료 |                             |

---

## 1. UC-01 — 랜딩 페이지 (`/`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 01-01 | PublicLayout (PublicHeader + Footer) | ✅ 완료 | |
| 01-02 | Hero 섹션 (TypingAnimation + CTA) | ✅ 완료 | |
| 01-03 | 문제 제기 섹션 (3-column 카드) | ✅ 완료 | |
| 01-04 | 기능 소개 섹션 (id="features") | ✅ 완료 | |
| 01-05 | 유사 서비스 비교 테이블 | ✅ 완료 | |
| 01-06 | 하단 CTA 섹션 (Magic UI Ripple) | ✅ 완료 | |
| 01-07 | generateMetadata SEO 메타태그 | ✅ 완료 | |
| 01-08 | Framer Motion 페이지 전환 | ✅ 완료 | 각 페이지에 motion.div 적용 |
| 01-09 | 로그인 상태 분기 처리 | ✅ 완료 | Clerk Show 컴포넌트 |

---

## 2. UC-02~05 — 인증 (`/sign-in`, `/sign-up`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 02-01 | Clerk 미들웨어 (proxy.ts) | ✅ 완료 | createRouteMatcher로 공개/보호 경로 분리 |
| 02-02 | ClerkProvider 적용 (layout.tsx) | ✅ 완료 | |
| 02-03 | AuthLayout 컴포넌트 | ✅ 완료 | (public)/layout.tsx |
| 02-04 | 회원가입 페이지 (/sign-up) | ✅ 완료 | 이메일+비번+확인+OTP |
| 02-05 | 로그인 페이지 (/sign-in) | ✅ 완료 | 이메일+비번+비번찾기 3단계 |
| 02-06 | 비밀번호 찾기 (로그인 폼 단계 전환) | ✅ 완료 | |
| 02-07 | Clerk Webhook 핸들러 (/api/webhooks/clerk) | ✅ 완료 | svix 서명 검증 |
| 02-08 | users 테이블 INSERT (Webhook → DB) | ✅ 완료 | user.created 이벤트 → DB INSERT |

---

## 3. UC-06 — 대시보드 (`/dashboard`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 03-01 | DashboardLayout (Sidebar + MobileHeader + Sheet) | ✅ 완료 | Toaster 통합 |
| 03-02 | Sidebar 컴포넌트 (네비게이션 + SidebarUserButton) | ✅ 완료 | 활성 Sage Green 좌측 보더 |
| 03-03 | 대시보드 홈 페이지 | ✅ 완료 | 빠른 시작 CTA + 최근 생성 + 지침 현황 |
| 03-04 | 최근 생성 5개 카드 (GET /api/history?limit=5) | ✅ 완료 | TanStack Query · stagger 애니메이션 |
| 03-05 | 지침 현황 표시 | ✅ 완료 | 지침 수 + 기본 지침 제목 |
| 03-06 | Empty State (지침 0개 신규 사용자) | ✅ 완료 | 강조 배너 + "지침 등록하기" CTA |
| 03-07 | 스켈레톤 로딩 | ✅ 완료 | ContentCardSkeleton · GuidelinesSkeleton |
| 03-08 | GET /api/history (목록 + 단건) | ✅ 완료 | Clerk auth → Drizzle |
| 03-09 | GET/POST/PUT/DELETE /api/guidelines (전체 CRUD) | ✅ 완료 | Zod 검증 · is_default 단일 보장 |

---

## 4. UC-07~09 — 콘텐츠 생성 (`/generate`, `/generate/[id]`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 04-01 | Gemini API 싱글턴 (lib/gemini.ts) | ✅ 완료 | @google/genai |
| 04-02 | buildSystemInstruction + extractSeoMeta | ✅ 완료 | features/generate/backend/service.ts |
| 04-03 | POST /api/generate/stream — AI 스트리밍 | ✅ 완료 | hono/streaming · AbortController |
| 04-04 | 콘텐츠 생성 폼 페이지 (/generate) | ✅ 완료 | 주제·키워드·방향·지침 드롭다운 |
| 04-05 | 키워드 태그 입력 (Space/Enter/Backspace) | ✅ 완료 | 최대 5개 제한 |
| 04-06 | 스트리밍 실시간 텍스트 표시 (useGenerateStream) | ✅ 완료 | [DONE]/[ERROR] 청크 파싱 |
| 04-07 | 생성 완료 → /generate/[id] 리다이렉트 | ✅ 완료 | toast.success 후 router.push |
| 04-08 | 생성 취소 (AbortController) | ✅ 완료 | 취소 버튼 AnimatePresence |
| 04-09 | 생성 결과 에디터 (/generate/[id]) | ✅ 완료 | @mdxeditor/editor dynamic import (ssr:false) |
| 04-10 | 저장 (PUT /api/history/:id) | ✅ 완료 | dirty 상태 추적 |
| 04-11 | 전체 복사 (clipboard API) | ✅ 완료 | |
| 04-12 | 마크다운 다운로드 | ✅ 완료 | YYYY-MM-DD-slug.md |
| 04-13 | 이탈 경고 (beforeunload + AlertDialog) | ✅ 완료 | Next.js 내부 라우팅 모두 처리 |
| 04-14 | Gemini Rate Limit 429 처리 | ✅ 완료 | [ERROR] 청크 → 재시도 버튼 토스트 |
| 04-15 | GET /api/history/:id — 이력 단건 조회 | ✅ 완료 | 소유권 403 검증 포함 |

---

## 5. UC-10~14 — 지침 관리 (`/guidelines`)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 05-01 | GET /api/guidelines — 지침 목록 | ✅ 완료 | UC-07~09에서 API 구현 |
| 05-02 | POST /api/guidelines — 지침 생성 | ✅ 완료 | |
| 05-03 | GET /api/guidelines/:id — 단건 조회 | ✅ 완료 | |
| 05-04 | PUT /api/guidelines/:id — 수정/기본 설정 | ✅ 완료 | |
| 05-05 | DELETE /api/guidelines/:id — 삭제 | ✅ 완료 | |
| 05-06 | 지침 목록 페이지 (/guidelines) | ❌ 미완료 | 플레이스홀더 |
| 05-07 | 지침 생성 페이지 (/guidelines/new) | ❌ 미완료 | 플레이스홀더 |
| 05-08 | 지침 수정 페이지 (/guidelines/[id]) | ❌ 미완료 | 플레이스홀더 |
| 05-09 | 삭제 확인 AlertDialog | ❌ 미완료 | |
| 05-10 | 기본 지침 설정 토글 | ❌ 미완료 | BR-11 단일 기본 지침 |

---

## 현재 진행 단계

```
[완료] ENV 설정 (전체)
[완료] UC-01 랜딩 페이지 (전체)
[완료] UC-02~05 인증 (전체)
[완료] UC-06 대시보드 (전체)
[완료] UC-07~09 콘텐츠 생성 (전체 — API + 폼 + 에디터)
[완료] UC-10~14 API (GET/POST/PUT/DELETE /api/guidelines)
[다음] UC-10~14 지침 관리 UI (/guidelines, /guidelines/new, /guidelines/[id])
```
