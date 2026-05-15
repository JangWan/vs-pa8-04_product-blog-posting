# 개발 환경 설정 가이드

> IndiePost AI 프로젝트 초기 설정 및 로컬 개발 환경 구축 문서
> 작성일: 2026-05-15

---

## 1. 사전 요구사항

- **Node.js**: v18.17 이상 (권장: v20 LTS)
- **pnpm**: v8 이상 (npm 대신 pnpm 사용)
- **Git**: 버전 관리용
- **환경변수 파일**: `.env.local` 구성 필수

---

## 2. 프로젝트 초기화

### Step 1: Next.js 프로젝트 생성

```bash
pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias '@/*' --no-git --skip-install
```

**각 옵션 설명:**

| 플래그 | 목적 |
|--------|------|
| `--typescript` | TypeScript 활성화 (TRD 기준) |
| `--tailwind` | Tailwind CSS v4 자동 설정 |
| `--eslint` | ESLint 구성 |
| `--app` | App Router 사용 (기본값) |
| `--src-dir` | `src/` 디렉토리 생성 (TRD 구조 §3-2 준수) |
| `--import-alias '@/*'` | 절대 경로 임포트 (`@/features/generate` 등) |
| `--no-git` | .git 초기화 스킵 (이미 repo인 경우) |
| `--skip-install` | 의존성 설치 스킵 |

### Step 2: 핵심 의존성 설치

```bash
# 패키지 설치
pnpm install

# shadcn/ui 초기화 (Next.js 전용 템플릿, 2026 CLI v4 기준)
pnpm dlx shadcn@latest init -t next
```

> **설치 중 선택 가이드**
>
> | 프롬프트 | 선택값 | 설명 |
> |---------|-------|------|
> | Select a component library | **Radix** | shadcn/ui 기본 기반 컴포넌트 라이브러리 |
> | Which preset would you like to use? | **Nova** | 현대적인 둥근 모서리·고채도 색상 프리셋 (기본 권장) |
>
> 다른 프리셋 참고:
> - `Default` — 표준 shadcn 스타일
> - `Sera` — 타이포그래피 중심, 세리프 헤딩 + 직각 모서리 (인쇄 디자인 스타일)
>
> 비주얼 빌더로 프리셋을 커스터마이징하려면: `pnpm dlx shadcn@latest init --preset [CODE] --template next`

### Step 3: 추가 라이브러리 설치

```bash
pnpm add hono zod zustand @tanstack/react-query @google/genai @clerk/nextjs framer-motion @mdxeditor/editor @hookform/resolvers react-hook-form drizzle-orm @neondatabase/serverless
```

> **변경 사항 (2026-05)**
> - `@google/generative-ai` → `@google/genai` (SDK 패키지명 변경)
> - `@clerk/types` 제거 — `@clerk/nextjs`에 타입 포함됨
> - `drizzle-orm`, `@neondatabase/serverless` 추가 (이전 가이드 누락)

### Step 4: 개발 전용 의존성 설치

```bash
pnpm add -D vitest @testing-library/react drizzle-kit
```

### Step 5: 디자인 시스템 초기 설정 (globals.css)

shadcn/ui 초기화 완료 후 `src/app/globals.css`를 Notion 스타일 테마로 교체합니다.

#### 5-1. 색상 토큰 및 테두리 설정

```css
/* src/app/globals.css */
@theme {
  /* 배경 및 텍스트: Notion Warm Neutral */
  --background: #ffffff;
  --foreground: rgba(0, 0, 0, 0.95);

  /* Primary CTA: Sage Green */
  --primary: #99d1aa;
  --primary-foreground: #ffffff;

  /* 테두리: Whisper Border */
  --border: rgba(0, 0, 0, 0.1);

  /* 카드 그림자: Multi-layer Soft Shadow */
  --shadow-card: 0 4px 18px rgba(0, 0, 0, 0.04), 0 2.025px 7.8px rgba(0, 0, 0, 0.02);
}
```

#### 5-2. 타이포그래피 설정

```css
:root {
  font-family: "Inter", "Pretendard", system-ui, sans-serif;
}

/* 히어로 헤드라인 전용 자간 압축 */
.display-hero {
  letter-spacing: -2.125px;
  line-height: 1.0;
}
```

> **폰트 참고**: 영문/숫자는 `Inter` (variable), 한글은 `Pretendard` 권장

---

## 3. 데이터베이스 설정

### Neon Serverless Postgres 연동

#### 3-1. Neon 프로젝트 생성

1. [neon.tech](https://neon.tech) 가입 및 로그인
2. "New Project" 클릭
3. 리전 선택 (권장: `us-east-1` — Vercel과 동일)
4. 데이터베이스명: `indiepost_ai`
5. 생성 완료 → 연결 문자열 복사

#### 3-2. 환경변수 설정

`.env.local` 파일 생성:

```env
# Neon Serverless Postgres (pooler 엔드포인트 필수)
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/indiepost_ai?sslmode=require
```

**주의**: 반드시 `-pooler` suffix 포함 (TRD §3-3 참조)

#### 3-3. Drizzle ORM 초기 설정

> **사용 버전 (2026-05 기준)**
> - `drizzle-orm`: ^0.41.0
> - `drizzle-kit`: ^0.31.0
> - `@neondatabase/serverless`: ^0.10.0

`drizzle.config.ts` 생성:

```typescript
import type { Config } from "drizzle-kit";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",           // drizzle-kit v0.22+ — `driver` 옵션 제거됨
  dbCredentials: {
    url: DATABASE_URL,
  },
} satisfies Config;
```

#### 3-4. 초기 스키마 정의

`src/db/schema.ts`:

```typescript
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  json,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

// users 테이블 (Clerk 연동)
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  clerk_user_id: text("clerk_user_id").unique().notNull(),
  email: text("email").notNull(),
  plan: text("plan").notNull().default("free"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// guidelines 테이블 (AI 지침)
export const guidelines = pgTable("guidelines", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  is_default: boolean("is_default").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// contents 테이블 (생성된 콘텐츠)
export const contents = pgTable("contents", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  guideline_id: text("guideline_id").references(() => guidelines.id, {
    onDelete: "set null",
  }),
  topic: text("topic").notNull(),
  keywords: json("keywords").notNull().default([]),
  direction: text("direction"),
  body: text("body").notNull(),
  seo_meta: json("seo_meta").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type Guideline = typeof guidelines.$inferSelect;
export type Content = typeof contents.$inferSelect;
```

#### 3-5. 마이그레이션 생성 및 실행

```bash
# 마이그레이션 파일 생성 (drizzle-kit v0.22+)
pnpm drizzle-kit generate

# 마이그레이션 실행
pnpm drizzle-kit migrate
```

생성된 파일: `src/db/migrations/0000_*.sql`

---

## 4. 인증 설정 (Clerk)

### 4-1. Clerk 프로젝트 생성

1. [clerk.com](https://clerk.com) 가입
2. "Create Application" 클릭
3. 이메일 + 비밀번호 인증 선택
4. API Keys 복사

### 4-2. 환경변수 추가

`.env.local` 업데이트:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### 4-3. 미들웨어 설정

`src/middleware.ts`:

```typescript
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

### 4-4. Webhook 설정

Clerk 대시보드 → Webhooks → "Create Endpoint"
- URL: `https://your-domain.com/api/webhooks/clerk`
- Events: `user.created`
- Secret: 복사하여 `CLERK_WEBHOOK_SECRET` 환경변수에 저장

---

## 5. AI API 설정 (Google Gemini)

### 5-1. Google Cloud 프로젝트 생성

1. [Google AI Studio](https://aistudio.google.com) 접속
2. "Create API Key" 클릭
3. API Key 복사

### 5-2. 환경변수 추가

`.env.local` 업데이트:

```env
# Google Gemini API
GOOGLE_GENAI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-3.1-flash
```

---

## 6. 디렉토리 구조 생성

```bash
mkdir -p src/backend/hono
mkdir -p src/backend/middleware
mkdir -p src/features/{generate,guidelines,history}
mkdir -p src/db/migrations
```

---

## 7. 개발 서버 실행

### 첫 실행

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000` 접속 확인

### 타입 검사

```bash
pnpm type-check
```

### Lint 확인

```bash
pnpm lint
```

### 테스트 실행

```bash
pnpm test
```

---

## 8. 배포 준비 (Vercel)

### 8-1. Vercel 프로젝트 생성

1. [vercel.com](https://vercel.com) 로그인
2. "New Project" → GitHub repo 연동
3. Framework: Next.js (자동 감지)
4. Deploy

### 8-2. 환경변수 설정

Vercel 프로젝트 Settings → Environment Variables
- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `GOOGLE_GENAI_API_KEY`
- `GEMINI_MODEL`

### 8-3. Neon 연동 (선택)

Vercel 대시보드에서 "Integrations" → "Neon" → "Add" 클릭
자동으로 `DATABASE_URL` 환경변수 설정됨

---

## 9. 문제 해결

### `DATABASE_URL` 연결 실패

```
Error: connect ECONNREFUSED
```

**원인**: `-pooler` suffix 누락 또는 SSL mode 미설정

**해결**:
```env
DATABASE_URL=postgresql://...@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
```

### Clerk Webhook 서명 검증 오류

```
Error: SVIX_WEBHOOK_SECRET not found
```

**해결**: 환경변수 이름 확인
```env
CLERK_WEBHOOK_SECRET=whsec_xxxxx  # O
SVIX_WEBHOOK_SECRET=...           # X
```

### Gemini API Rate Limit (429)

무료 티어 한도 초과 시 "1분 후 다시 시도해주세요" 토스트 표시

---

## 10. 참고 문서

- [CLAUDE.md](../CLAUDE.md) — 개발 규칙 및 아키텍처
- [TRD.md](./TRD.md) — 기술 명세서
- [IA.md](./IA.md) — 정보 구조도
- [PRD.md](./PRD.md) — 제품 요구사항
- [docs/design/notion.md](../design/notion.md) — Notion 스타일 브랜드 SSOT
- [docs/design/design_guide-common.md](../design/design_guide-common.md) — 공통 디자인 시스템 (색상 토큰, 모션, 접근성)
- [docs/design/design_guide-web.md](../design/design_guide-web.md) — 웹 전용 레이아웃 및 반응형 가이드
- [docs/tech/shadcn.md](../tech/shadcn.md) — shadcn/ui + Lucide React 사용 가이드
