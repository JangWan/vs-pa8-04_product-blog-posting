# TRD — IndiePost AI
> 기술 명세서 (Technical Requirements Document)  
> 작성일: 2026-05-15 | 버전: v1.0 | 참조: PRD.md

---

## 1. 프로젝트 개요

### 핵심 기술 접근 방식
PRD의 타겟 플랫폼(Web)과 저장 방식(Database)을 기준으로, 서버리스 최적화된 풀스택 Next.js 아키텍처를 채택한다. AI 콘텐츠 생성은 Google Gemini API(무료 티어)를 통해 구현하며, 1개월 이내 MVP 출시를 목표로 최소 인프라로 시작한다.

### 주요 기술 결정 사항 요약

| 구분      | 선택                                     | 근거                                                        |
| ------- | -------------------------------------- | --------------------------------------------------------- |
| 프레임워크   | Next.js v16 + Hono                     | PRD 타겟 플랫폼: Web                                           |
| UI 컴포넌트 | shadcn/ui + Tailwind v4                | 커스텀 Notion 스타일 디자인 + 반응형 필수                               |
| 데이터베이스  | Neon Serverless Postgres + Drizzle ORM | PRD 저장 방식: Database + 서버리스 환경                             |
| 인증      | Clerk v6+                              | 이메일+비밀번호 인증 + Webhook 기반 users 동기화 + 향후 조직 관리(Phase 3) 확장 |
| AI API  | Google Gemini API (`gemini-3.1-flash`) | 핵심 기능: 콘텐츠 자동 생성 + 무료 티어                                  |
| 배포      | Vercel                                 | Next.js 최적화 + Neon 공식 통합 + 저예산                            |

---

## 2. 시스템 아키텍처

### 전체 시스템 구성도

```
[브라우저 클라이언트]
        │
        │ HTTPS (반응형 Web)
        ▼
[Vercel Edge Network / CDN]
        │
        ▼
[Next.js v16 App Router]
   ├── /app/(public)/          # 랜딩·로그인 (공개)
   ├── /app/(dashboard)/       # 대시보드 (인증 필요)
   │    ├── /generate           # 콘텐츠 생성 페이지
   │    ├── /guidelines         # AI 지침 관리 페이지
   │    └── /history            # 생성 이력 페이지
   └── /app/api/[[...hono]]/   # Hono API 라우터
        ├── POST /api/generate/stream    # AI 콘텐츠 스트리밍 생성
        ├── GET  /api/guidelines         # 지침 목록 조회
        ├── POST /api/guidelines         # 지침 생성
        ├── GET  /api/guidelines/:id     # 지침 단건 조회 (수정 폼 초기 데이터)
        ├── GET  /api/history            # 생성 이력 조회
        ├── PUT  /api/history/:id        # 생성 이력 수동 저장 (에디터 편집본)
        └── POST /api/webhooks/clerk     # Clerk Webhook (user.created 이벤트 수신)
        │
        ▼
[외부 서비스]
   ├── Clerk           → 인증·세션 관리
   ├── Neon Postgres   → 사용자·지침·이력 데이터 저장
   └── Gemini API      → AI 콘텐츠 생성 (서버에서만 호출)
```

### 주요 컴포넌트 역할

| 컴포넌트 | 역할 |
|---------|------|
| Next.js App Router | 라우팅, SSR, 정적 생성, 미들웨어 |
| Hono (API 레이어) | REST API 라우터, 요청 검증, 응답 정규화 |
| Clerk Middleware | 인증 보호 경로 제어, JWT 검증 |
| Neon + Drizzle | 데이터 CRUD, 스키마 마이그레이션 |
| Gemini API | 시스템 프롬프트 + 사용자 주제 → 블로그 초안 생성 |

### 기술 스택 선택 이유

| 기술 | 선택 이유 (PRD 기준) |
|------|---------------------|
| Next.js v16 | PRD 타겟 플랫폼이 Web → Nextjs.md 기준 |
| shadcn/ui | 반응형 필수 + Notion 스타일 커스텀 → 커스터마이징 자유도 최고 |
| Neon Postgres | PRD 저장 방식이 Database + Vercel 서버리스 환경 최적화 |
| Clerk | MVP: 이메일+비밀번호 인증. Webhook(`user.created`)으로 users 테이블 자동 동기화. 향후 조직 관리(Phase 3) 확장 대비 |
| Gemini API | PRD 핵심 기능 AI 콘텐츠 생성 + 무료 티어로 저예산 MVP 적합 |
| Vercel | Neon 공식 통합 + 무료 플랜으로 1개월 내 MVP 출시 가능 |

---

## 3. 기술 명세

### 3-1. 프론트엔드

| 항목 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js v16 App Router | Turbopack 개발 서버 |
| 언어 | TypeScript | `any` 사용 금지 |
| UI 컴포넌트 | shadcn/ui | 기능적 핵심 컴포넌트 |
| 스타일 | Tailwind CSS v4 | shadcn/ui 자동 포함 |
| 아이콘 | Lucide React | shadcn/ui 번들 포함 |
| 상태 관리 | Zustand | 글로벌 상태 (생성 중 스트리밍 등) |
| 서버 상태 | TanStack Query | API 데이터 페칭·캐싱 |
| 폼 검증 | react-hook-form + zod | 지침 입력폼 |
| 에디터 | MDX Editor (`@mdxeditor/editor`) | 생성된 초안 WYSIWYG 편집 + 실시간 미리보기 |

**컴포넌트 원칙**
- 모든 UI 컴포넌트 기본 `"use client"`
- 서버 컴포넌트는 데이터 페칭이 명확한 경우에만 사용
- `page.tsx` / `layout.tsx`의 `params`, `searchParams`는 반드시 `await` (Next.js 15+)

### 3-2. 백엔드

| 항목 | 기술 | 비고 |
|------|------|------|
| API 라우터 | Hono | `src/app/api/[[...hono]]/route.ts` 위임 |
| 런타임 | Node.js (Vercel Serverless) | Edge Runtime 미사용 |
| 스키마 검증 | Zod | API 요청·응답 검증 |
| ORM | Drizzle ORM | Neon Serverless 드라이버 연동 |
| AI SDK | @google/genai | 서버 전용, 클라이언트 노출 금지 |

**디렉토리 구조**
```
src/
├── app/
│   ├── (public)/             # 랜딩, 로그인, 회원가입
│   ├── (dashboard)/          # 인증 필요 페이지
│   └── api/[[...hono]]/      # Hono 위임 진입점
├── backend/
│   ├── hono/                 # Hono 앱 본체
│   └── middleware/           # 에러, 컨텍스트
├── features/
│   ├── generate/             # 콘텐츠 생성
│   ├── guidelines/           # AI 지침 관리
│   └── history/              # 생성 이력
├── lib/
│   └── gemini.ts             # Gemini API 싱글턴 (서버 전용)
└── db/
    ├── schema.ts             # Drizzle 스키마 정의
    └── migrations/           # SQL 마이그레이션 파일
```

### 3-3. 데이터베이스 설계 방향

**주요 테이블**

| 테이블 | 역할 | 주요 컬럼 |
|--------|------|----------|
| `users` | 사용자 정보 (Clerk 연동) | `clerk_user_id`, `email`, `plan` |
| `guidelines` | AI 지침(지시서) | `user_id`, `title`, `content`, `is_default` |
| `contents` | 생성된 콘텐츠 이력 | `user_id`, `guideline_id`, `topic`, `keywords`(JSON), `direction`, `body`, `seo_meta`(JSON) |

**`seo_meta` JSON 스키마**
```typescript
// contents.seo_meta — Gemini가 생성, JSONB 컬럼으로 저장
{
  title: string        // SEO 최적화 제목 (60자 이내)
  description: string  // 메타 설명 (160자 이내)
  slug: string         // URL slug (소문자 하이픈 구분)
  keywords: string[]   // 추출된 핵심 키워드 목록
}
```

**마이그레이션 규칙** (`docs/tech/neon.md` 기준)
- 파일명 prefix: `0001_create_users.sql`, `0002_create_guidelines.sql`
- 멱등성 보장: `CREATE TABLE IF NOT EXISTS`
- 모든 테이블 `updated_at` + 자동 업데이트 트리거
- 식별자 전체 `snake_case`
- RLS 비활성화: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`
- 연결 문자열: 서버리스 환경에서 `-pooler` suffix 필수

### 3-4. API 설계

| 메서드 | 엔드포인트 | 설명 | 인증 |
|--------|-----------|------|------|
| `POST` | `/api/generate/stream` | AI 콘텐츠 스트리밍 생성 | 필수 |
| `GET` | `/api/guidelines` | 지침 목록 조회 | 필수 |
| `POST` | `/api/guidelines` | 지침 생성 | 필수 |
| `GET` | `/api/guidelines/:id` | 지침 단건 조회 (수정 폼 초기 데이터) | 필수 |
| `PUT` | `/api/guidelines/:id` | 지침 수정 또는 기본 지침 설정 | 필수 |
| `DELETE` | `/api/guidelines/:id` | 지침 삭제 | 필수 |
| `GET` | `/api/history` | 생성 이력 목록 | 필수 |
| `GET` | `/api/history/:id` | 이력 상세 조회 | 필수 |
| `PUT` | `/api/history/:id` | 에디터 편집본 수동 저장 | 필수 |
| `POST` | `/api/webhooks/clerk` | Clerk Webhook 수신 (`user.created`) | 없음 (Clerk 서명 검증) |

**AI 생성 요청/응답 스키마**
```typescript
// POST /api/generate/stream
Request: {
  topic: string          // 블로그 주제 (필수, 300자 이내)
  keywords?: string[]    // SEO 타겟 키워드 (선택, 최대 5개)
  direction?: string     // 글 방향 (선택, 200자 이내)
  guidelineId?: string   // 적용할 지침 ID (미지정 시 기본 지침)
}
// 스트리밍 청크: 마크다운 텍스트 순차 전달
// 마지막 청크: [DONE]{"id":"<contents.id>","seo_meta":{...}} 형식
// 클라이언트는 [DONE] prefix 감지 시 JSON 파싱 후 /generate/[id] 리다이렉트
Response: ReadableStream

// PUT /api/history/:id  — 에디터 수동 저장
Request: { body: string }   // 편집된 마크다운 전문
Response: { updated_at: string }

// GET /api/history — 이력 목록 조회
// 쿼리 파라미터: ?limit=N (생략 시 커서 기반 페이지네이션 기본 20개)
// ?cursor=<last_id> (Phase 2 무한스크롤용, 첫 요청은 생략)
// 대시보드에서는 ?limit=5 로 고정 호출
Response: {
  data: Array<{
    id: string
    topic: string                   // 생성 시 입력한 주제
    created_at: string              // ISO 8601
    updated_at: string
    guideline_title: string | null  // guidelines JOIN. 삭제된 지침은 null → 클라이언트에서 "삭제된 지침" 표시
  }>
  next_cursor: string | null        // 다음 페이지 커서 (마지막 페이지는 null)
}

// GET /api/history/:id — 이력 상세
Response: {
  id: string
  topic: string
  keywords: string[]
  direction: string | null
  body: string                      // 마크다운 전문
  seo_meta: { title: string; description: string; slug: string; keywords: string[] }
  guideline_title: string | null
  created_at: string
  updated_at: string
}
```

### 3-5. 인증 및 권한 관리

**Clerk v6+ 기준** (`docs/tech/clerk.md` 기준)
- 미들웨어: `clerkMiddleware` + `createRouteMatcher`
- 인증 방식: 이메일 + 비밀번호 (MVP 범위, 소셜 로그인 미지원)
- 공개 경로: `/`, `/sign-in`, `/sign-up`, `/api/webhooks/clerk`
- 보호 경로: `/dashboard/**`, `/api/**` (webhooks 제외)
- 서버: `auth()`로 `userId` 확인; 전체 User 객체 필요 시만 `currentUser()`
- 클라이언트: `<Show when="signed-in">` / `<Show when="signed-out">`
- `CLERK_SECRET_KEY` 절대 클라이언트 노출 금지

**Clerk Webhook — users 테이블 동기화**
- 이벤트: `user.created`
- 엔드포인트: `POST /api/webhooks/clerk` (공개 경로, Clerk 서명 검증 필수)
- 처리: Clerk `svix` 라이브러리로 서명 검증 → `users` 테이블 INSERT (`clerk_user_id`, `email`, `plan='free'`)
- 환경변수: `CLERK_WEBHOOK_SECRET` (Clerk 대시보드 Webhook 시크릿)

---

## 4. 인프라 요구사항

### 호스팅 및 배포

| 항목 | 선택 | 이유 |
|------|------|------|
| 호스팅 | Vercel (무료 플랜) | Next.js 공식 플랫폼, Neon 공식 통합, 저예산 MVP |
| DB | Neon Serverless Postgres | Vercel 통합, 컴퓨트 자동 중단으로 비용 최소화 |
| CDN | Vercel Edge Network | Vercel 무료 플랜 포함 |

### 환경변수 목록

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=          # Clerk 대시보드 Webhook 시크릿 (svix 서명 검증용)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Neon
DATABASE_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require

# Gemini
GOOGLE_GENAI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash
```

---

## 5. 보안 요구사항

> 데이터 민감도: **높음** (향후 결제 데이터 포함 예정, Phase 3)

| 항목 | 요구사항 |
|------|---------|
| API 키 관리 | `GOOGLE_GENAI_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL` 서버 전용 — 클라이언트 노출 절대 금지 |
| 통신 암호화 | HTTPS 강제 (Vercel 기본 제공), DB 연결 `sslmode=require` |
| 인증 검증 | 모든 API 엔드포인트 Clerk JWT 검증 필수 |
| 입력 검증 | Hono 레이어에서 Zod 스키마 검증 — SQL Injection, XSS 방지 |
| AI 데이터 | 무료 티어에서 사용자 콘텐츠 Google 전송 — 개인정보 포함 금지 정책 약관 명시 |
| Phase 3 대비 | 결제 데이터 연동 시 PCI-DSS 준수 결제 전문 서비스(토스페이먼츠 등) 사용 — 카드 정보 직접 저장 절대 금지 |

---

## 6. 성능 요구사항

| 항목 | 목표 |
|------|------|
| 페이지 초기 로딩 | 3초 이내 (LCP 기준) |
| AI 첫 번째 청크 도착 | 2초 이내 (스트리밍 체감 속도) |
| API 응답 (AI 제외) | 500ms 이내 |
| 반응형 중단점 | 모바일(375px) / 태블릿(768px) / 데스크톱(1280px) |

**캐싱 전략**
- 지침 목록: TanStack Query `staleTime: 5분` (자주 변경되지 않음)
- 생성 이력: `staleTime: 1분`
- AI 생성 콘텐츠: 캐시 없음 (매 요청마다 fresh 생성)

---

## 7. 외부 연동

| 서비스 | 용도 | 장애 대응 |
|--------|------|----------|
| Google Gemini API | AI 콘텐츠 생성 | 429(Rate Limit) → 사용자 안내 토스트 + 재시도 버튼 |
| Clerk | 인증·사용자 관리 | 서비스 다운 시 로그인 불가 안내 페이지 |
| Neon Postgres | 데이터 저장 | 연결 실패 시 재시도 3회 후 500 에러 반환 |

**Gemini API Rate Limit 대응**
- 무료 티어 한도 초과 시 `429 RESOURCE_EXHAUSTED` 오류 반환
- 클라이언트에 "AI 서비스가 잠시 혼잡합니다. 1분 후 다시 시도해주세요." 토스트 노출

---

## 8. 개발 및 배포

### 개발 환경

```bash
pnpm dev          # Turbopack 개발 서버
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
pnpm type-check   # tsc --noEmit
```

### CI/CD 파이프라인 (Vercel 자동화)

```
[GitHub Push] → [Vercel 자동 빌드]
  ├── PR 시: Preview 배포 + Neon PR 브랜치 자동 생성
  └── main 병합: Production 배포 + Neon Production 마이그레이션
```

### 테스트 전략 (MVP 최소 범위)

| 유형 | 도구 | 대상 |
|------|------|------|
| 타입 검사 | TypeScript | 전체 코드 |
| 단위 테스트 | Vitest | 비즈니스 로직 (지침 조합, SEO 프롬프트 빌드) |
| E2E (추후) | Playwright | 핵심 플로우 (회원가입 → 지침 등록 → 콘텐츠 생성) |

---

## 9. TRD 검토 체크리스트

- [x] 아키텍처 구성도가 텍스트로 표현되어 있는가?
- [x] 기술 선택 이유가 PRD의 타겟 플랫폼·저장 방식 기준으로 명시되어 있는가?
- [x] DB 스키마 설계 방향이 포함되어 있는가?
- [x] API 구조 및 인증 방식이 정의되어 있는가?
- [x] 보안 요구사항이 데이터 민감도(높음) 수준에 맞게 명시되어 있는가?
- [x] 예산·일정 제약(1개월, 저예산)이 기술 선택에 반영되어 있는가?
