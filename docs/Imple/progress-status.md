# 구현 진행 상태 — IndiePost AI

> 마지막 업데이트: 2026-05-17
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
| 05-06 | 지침 목록 페이지 (/guidelines) | ✅ 완료 | stagger 등장 카드 + 헤더 "+" 버튼 + Empty State |
| 05-07 | 지침 생성 페이지 (/guidelines/new) | ✅ 완료 | breadcrumb + GuidelineForm 공통 컴포넌트 |
| 05-08 | 지침 수정 페이지 (/guidelines/[id]) | ✅ 완료 | useGuideline prefill + 404/403 인라인 처리 |
| 05-09 | 삭제 확인 AlertDialog | ✅ 완료 | 본문 메시지 BR-12 반영 (이력 "삭제된 지침" 표시 안내) |
| 05-10 | 기본 지침 설정 토글 | ✅ 완료 | Star 아이콘 토글 · 이미 기본 시 인라인 토스트 (UC §4-1) |
| 05-11 | API content 길이 정렬 (max 2000자) | ✅ 완료 | UC §8 명세에 맞춰 Zod 스키마 max(5000) → max(2000) |

---

## 6. UC-15~19 — 콘텐츠 이력 관리 (Phase 2)

### 6-A. DB·백엔드 (완료)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 06-01 | DB 스키마 — `content_versions` 테이블 + `contents.source_lang` 컬럼 | ✅ 완료 | drizzle schema 정의 |
| 06-02 | 마이그레이션 실행 | ⏳ 사용자 액션 | `pnpm drizzle-kit generate` + `pnpm drizzle-kit migrate` |
| 06-03 | PUT /api/history/:id — BR-18 자동 스냅샷 | ✅ 완료 | 본문 변경 시 직전 본문 INSERT |
| 06-04 | DELETE /api/history/:id (UC-15 §4-1) | ✅ 완료 | CASCADE로 `content_versions` 자동 삭제 (BR-24) |
| 06-05 | GET /api/history — 커서 페이지네이션 (`?cursor=<last_id>`) | ✅ 완료 | `next_cursor` 응답 |
| 06-06 | GET /api/history/:id — `source_lang` 응답 포함 | ✅ 완료 | UC-15 헤더 Badge용 |
| 06-07 | GET /api/contents/:id/versions — 목록 (char_diff/is_current/cursor) | ✅ 완료 | CTE + LAG window function |
| 06-08 | POST /api/contents/:id/versions — UC-17 수동 스냅샷 | ✅ 완료 | BR-20 100KB · 중복 본문 409 |
| 06-09 | GET /api/contents/:id/versions/:no — 단건 | ✅ 완료 | 미리보기 Drawer용 |
| 06-10 | POST /api/contents/:id/versions/:no/restore — UC-18 복원 | ✅ 완료 | BR-19 안전 스냅샷 → UPDATE |
| 06-11 | GET /api/contents/:id/versions/diff?from=&to= — UC-19 | ✅ 완료 | 두 버전 본문 그대로 반환 |
| 06-12 | 소유권 검증 미들웨어 (requireContentOwner) | ✅ 완료 | BR-04: 타인 콘텐츠 404 응답 |

### 6-B. 프론트엔드 (완료)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 06-13 | 의존성 설치 (react-diff-viewer-continued · @tanstack/react-virtual · react-markdown) | ✅ 완료 | |
| 06-14 | /history 목록 (무한스크롤 · Empty State) | ✅ 완료 | useInfiniteQuery + IntersectionObserver |
| 06-15 | /history/[id] 이력 상세 (UC-15, 탭·액션 5개·삭제) | ✅ 완료 | 번역 탭은 UC-20 미구현으로 placeholder toast |
| 06-16 | /history/[id]/versions (UC-16·17·18) | ✅ 완료 | Sheet Drawer · floating bar · AlertDialog |
| 06-17 | /history/[id]/versions/compare (UC-19) | ✅ 완료 | react-diff-viewer-continued ssr:false |
| 06-18 | 사이드바 `/history` 메뉴 활성화 | ✅ 완료 | disabled 플래그 제거 |
| 06-19 | 공통 MarkdownView 컴포넌트 | ✅ 완료 | 이력 상세·버전 미리보기 공유 |
| 06-20 | TanStack Query 훅 분리 (history·versions) | ✅ 완료 | useInfinite/detail/mutations |

---

## 현재 진행 단계

```
[완료] ENV 설정 (전체)
[완료] UC-01 랜딩 페이지 (전체)
[완료] UC-02~05 인증 (전체)
[완료] UC-06 대시보드 (전체)
[완료] UC-07~09 콘텐츠 생성 (전체 — API + 폼 + 에디터)
[완료] UC-10~14 지침 관리 (API + UI)
[완료] UC-15~19 백엔드 (DB schema · 6개 API · 자동 스냅샷)
[완료] UC-15~19 프론트엔드 (/history, /history/[id], /versions, /compare)
[대기] 사용자 마이그레이션 실행 (drizzle-kit generate + migrate)
[다음] UC-20~22 다국어 번역 (Phase 2)
```

---

## UC-10~14 구현 요약 (2026-05-17)

**파일 추가/수정**
- `src/features/guidelines/hooks/use-guidelines.ts` — `useGuideline`(단건), `useCreateGuideline`, `useUpdateGuideline`, `useDeleteGuideline`, `useSetDefaultGuideline` mutations 추가. queryClient 무효화로 목록·단건 캐시 자동 갱신.
- `src/features/guidelines/components/guideline-form.tsx` — 생성·수정 공통 폼. 제목 100자/내용 2000자 카운터, 클라이언트 유효성 (UC §5-1·5-2), 취소 → /guidelines 라우팅.
- `src/app/(dashboard)/guidelines/page.tsx` — Framer Motion stagger 카드 목록, 기본 Badge(Sage Green), 수정/삭제/기본설정 버튼, AlertDialog 삭제 확인, Empty State (BookOpen), 헤더 "+" CTA, 스켈레톤 3개.
- `src/app/(dashboard)/guidelines/new/page.tsx` — breadcrumb + GuidelineForm 호출. 성공 시 "지침이 저장되었습니다." 토스트 → /guidelines.
- `src/app/(dashboard)/guidelines/[id]/page.tsx` — `use(params)` 패턴 (Next.js 16), `useGuideline` prefill, 404/403 인라인 처리, 동일 토스트/리다이렉트.
- `src/features/guidelines/backend/route.ts` — Zod `content.max(5000)` → `max(2000)` (UC §8 명세 정렬).

**핵심 UX 결정**
- 카드 우측 액션은 모바일에서 아이콘만 표시 (`hidden sm:inline`로 라벨 토글).
- 기본 지침 카드의 "기본으로 설정" 버튼은 disabled + Star 채움 아이콘 + "기본 지침" 텍스트로 상태 시각화.
- 이미 기본인 카드를 다시 누르면 API 호출 없이 `toast.info` 인라인 안내 (UC §4-1).
- 삭제 AlertDialog 본문은 BR-12 명시 ("이력에서 '삭제된 지침'으로 표시").
- 수정 페이지 breadcrumb는 prefill된 제목을 truncate 표시.

**검증**
- `pnpm type-check` 통과
- `pnpm build` 통과 (10개 정적 페이지 prerender 성공)
- `pnpm lint` — guidelines 관련 신규 코드 0 위반 (기존 generate 페이지 `react-hooks/set-state-in-effect` 2건은 별도 이슈)
