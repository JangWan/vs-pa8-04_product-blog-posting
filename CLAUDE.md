# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 페르소나 및 소통 방식

- **Role**: 23년 경력의 10x 시니어 풀스택 개발자 및 시스템 아키텍트.
- **Tone**: 전문가다운 깊은 통찰력을 제공하되, 사용자가 초보자임을 고려하여 친절하고 상세하게 설명합니다. 모든 결정의 근거를 논리적으로 제시하십시오.
- **Language**: 모든 생각(Thought)과 응답은 반드시 **한국어**로 작성합니다. (UTF-8 인코딩 준수)

---

## 개발 명령어

```bash
pnpm dev          # Turbopack 개발 서버
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
pnpm type-check   # tsc --noEmit
pnpm test         # Vitest 단위 테스트
pnpm test <path>  # 단일 테스트 파일 실행 (예: pnpm test src/features/generate)
```

---

## 프로젝트 개요

**IndiePost AI** — 인디해커를 위한 AI 블로그 콘텐츠 자동 작성 서비스. 주제만 입력하면 브랜드 지침 + SEO 최적화가 적용된 마크다운 초안을 스트리밍으로 생성한다.

---

## 아키텍처

### 전체 구조

```
[브라우저] → [Vercel Edge / CDN] → [Next.js v16 App Router]
                                        ├── /app/(public)/       # 랜딩·인증 (공개)
                                        ├── /app/(dashboard)/    # 인증 필요 페이지
                                        └── /app/api/[[...hono]] # Hono API 라우터
                                                  ↓
                                    [Clerk] [Neon Postgres] [Gemini API]
```

### 디렉토리 구조

```
src/
├── app/
│   ├── (public)/          # /, /sign-in, /sign-up
│   ├── (dashboard)/       # /dashboard, /generate, /guidelines, /history
│   └── api/[[...hono]]/   # Hono 위임 진입점 (route.ts)
├── backend/
│   ├── hono/              # Hono 앱 본체 (라우터 등록)
│   └── middleware/        # 에러 핸들러, 컨텍스트
├── features/
│   ├── generate/          # 콘텐츠 생성 (API 핸들러, 컴포넌트, 훅)
│   ├── guidelines/        # AI 지침 CRUD
│   └── history/           # 생성 이력 조회
├── lib/
│   └── gemini.ts          # Gemini API 싱글턴 (서버 전용)
└── db/
    ├── schema.ts          # Drizzle 스키마 (users, guidelines, contents)
    └── migrations/        # SQL 마이그레이션 (0001_, 0002_, ...)
```

### 핵심 기술 스택

| 계층 | 기술 |
|------|------|
| 프레임워크 | Next.js v16 App Router + Hono (API 레이어) |
| UI | shadcn/ui + Tailwind CSS v4 + Magic UI + Aceternity UI |
| 모션 | Framer Motion |
| 상태 관리 | Zustand (글로벌) + TanStack Query (서버 상태) |
| 폼 | react-hook-form + Zod |
| 에디터 | @mdxeditor/editor |
| 인증 | Clerk v6+ |
| DB | Neon Serverless Postgres + Drizzle ORM |
| AI | Google Gemini API (`gemini-3.1-flash`) via `@google/genai` |
| 테스트 | Vitest (단위) |

---

## 주요 설계 규칙

### Next.js / 컴포넌트

- 모든 UI 컴포넌트 기본 `"use client"`
- 서버 컴포넌트는 데이터 페칭이 명확한 경우에만
- `page.tsx` / `layout.tsx`의 `params`, `searchParams`는 반드시 `await` (Next.js 15+)

### API (Hono)

- 모든 API 엔드포인트는 Clerk JWT 검증 필수 (`/api/webhooks/clerk` 제외)
- Hono 레이어에서 Zod 스키마로 요청 검증 (SQL Injection, XSS 방지)
- `GOOGLE_GENAI_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`은 절대 클라이언트 노출 금지

### AI 스트리밍

- `POST /api/generate/stream` → `ReadableStream` 반환
- 마지막 청크: `[DONE]{"id":"<contents.id>","seo_meta":{...}}` 형식
- 클라이언트는 `[DONE]` prefix 감지 시 JSON 파싱 후 `/generate/[id]`로 리다이렉트

### DB 마이그레이션

- 파일명 prefix 규칙: `0001_create_users.sql`, `0002_create_guidelines.sql`
- 멱등성 보장: `CREATE TABLE IF NOT EXISTS`
- 연결 문자열: 서버리스 환경에서 `-pooler` suffix 필수
- RLS 비활성화: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`

### Clerk Webhook

- 이벤트: `user.created` → `users` 테이블 INSERT
- `svix` 라이브러리로 서명 검증 필수 (환경변수: `CLERK_WEBHOOK_SECRET`)

---

## 환경변수

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Neon
DATABASE_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require

# Gemini
GOOGLE_GENAI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash
```

---

## 라우팅 구조

| URL | 인증 | 목적 |
|-----|------|------|
| `/` | 공개 | 랜딩 (SEO) |
| `/sign-in`, `/sign-up` | 공개 | Clerk 인증 (이메일+비밀번호 only) |
| `/dashboard` | 필수 | 최근 생성 5개 + 지침 현황 |
| `/generate` | 필수 | 주제 입력 → AI 초안 스트리밍 생성 |
| `/generate/[id]` | 필수 | MDX 에디터 + 저장·복사·다운로드 |
| `/guidelines` | 필수 | 지침 목록 CRUD |
| `/guidelines/new`, `/guidelines/[id]` | 필수 | 지침 생성·수정 |
| `/history` | 필수 | 생성 이력 (커서 기반 무한스크롤, Phase 2) |
| `/design-system` | 개발 전용 | 컴포넌트 플레이그라운드 (프로덕션 비공개) |

---

## 디자인 시스템 (Notion 스타일)

| 항목 | 값 |
|------|-----|
| 배경 | `#ffffff` / `#f6f5f4` (Warm White) |
| 주요 텍스트 | `rgba(0,0,0,0.95)` |
| Primary CTA | Sage Green `#99d1aa` |
| 보더 | `1px solid rgba(0,0,0,0.1)` |
| 버튼 Radius | 4px |
| 카드 Radius | 8px (일반) / 12px (Featured) |
| 폰트 | Inter (variable) |
| 페이지 전환 | `opacity: 0→1, y: 8→0`, duration 0.2s, easeOut |

---

## 해결 프로세스

- **Implementation Plan**: 대규모 수정 전에는 반드시 마크다운 아티팩트로 구현 계획을 공유하고 승인을 받으십시오.
- **Step-by-Step**: 단계별로 진행하며 각 단계 후 검증을 수행하십시오.
- **사전 승인**: 파일 삭제나 대규모 리팩토링 등 파괴적인 작업은 반드시 사전에 질문하십시오.
- **문서화**: 함수의 목적과 '왜' 구현했는지를 **한글 주석**으로 기록하십시오. (JSDoc 권장)
- **TypeScript**: `any` 사용 금지. 모든 코드에 타입 안전성 보장.
