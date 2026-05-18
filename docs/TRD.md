# TRD — IndiePost AI

> 기술 명세서 (Technical Requirements Document)  
> 작성일: 2026-05-15 | 버전: v1.4 (2026-05-18 QStash·BR-02 정합화) | 참조: [PRD.md](PRD.md) · [SRS.md](SRS.md) · [BR-구독결제.md](BR-구독결제.md)
>
> **변경 이력**
>
> - v1.0 (2026-05-15) 최초 작성 — MVP(F1·F2·F3)
> - v1.1 (2026-05-17) Phase 2 기능 확장 — 콘텐츠 이력 관리(버전 스냅샷·복원·비교) + 다국어 번역(한↔영)
> - v1.2 (2026-05-17) Phase 3 기능 확장 — 조직(팀) 관리 + 구독 결제(토스페이먼츠) + AI Agent 자동화(Vercel Cron)
> - v1.3 (2026-05-17) **Phase 3 최종 확정 (SRS.md 반영)**
>   - **지침 스코프 조직 공용 전환** (BR-34, SRS Option A 채택) — `guidelines.organization_id` 전환·기존 데이터 personal_org로 백필
>   - **결제 스키마 재설계** — toss-quickstart 11개 내부 상태 + 빌링키 정기결제 하이브리드. `orders`·`order_items`·`order_status_history`·`payments`·`payment_logs`·`payment_cancel_requests`·`payment_cancels`·`payment_error_codes` 8개 테이블 + `subscriptions`(빌링키 보관) + `users.payment_customer_key`
>   - **AI Agent Tool Calling 아키텍처** — Gemini Function Calling API + `agent_tools`(도구 레지스트리) + `agent_tool_calls`(호출 이력). Topic Picker / Content Writer / Platform Publisher 3개 표준 도구
>   - **조직 30일 grace 정책** (BR-31) — `organizations.deleted_at` soft delete + 매일 cron 완전 삭제
>   - **Personal Org 자동 생성** — `user.created` Webhook이 이메일 기반 `{email}'s Workspace` 조직 자동 생성 + `default_organization_id` 설정
>   - **발행 연동은 스키마/인터페이스만 정의 (Phase 3.5 분리)** — `agent_tools` 레지스트리에 `platform_publisher` 타입 정의·`platform_credentials` 테이블 스키마만 정의, 실제 Hashnode/Medium API 호출은 Phase 3.5에서 구현
> - v1.4.1 (2026-05-18) **운영 안정성 패치 4건**
>   - **(패치1)** QStash 무료 한도 초과 위험 제거 — `agents/tick`·`expire-orders` 둘 다 **15분 통일** (운영도 동일). 일 192/500 메시지로 한도 38% 사용. 향후 트래픽 폭증 시 유료 전환과 함께 5분 재조정
>   - **(패치2)** Personal Org 중복 생성 방지 — 부분 unique index(`WHERE is_personal=true`) + PostgreSQL advisory lock + Clerk `idempotency_key` 3중 방어 명세. 회원가입 직후 사용자 페이지 진입과 Webhook 처리가 동시 발생해도 1건만 생성
>   - **(패치3)** Function Calling 마스킹 이원화 — LLM에 전달되는 functionResponse는 **원본 유지** (Agent 추론 정확성 보장) / `agent_tool_calls.result`에 저장될 때만 PII·시크릿 마스킹 적용 (UI 노출용)
>   - **(패치4)** 해지 예약 취소 결제일 직전 경합 방지 — UC-38 DELETE 핸들러에 `SELECT FOR UPDATE` 락 + `next_billing_at = MAX(current_period_end+1d, now()+1h)` 보정. billing/tick cron과 직렬화
> - v1.4 (2026-05-18) **QStash 도입 + BR-02 정합화**
>   - **스케줄러 교체** — Vercel Cron(Hobby 1개 제한) → **Upstash QStash** (외부 메시지 큐). 인증: `CRON_SECRET` Bearer → **QStash JWT 서명 검증**(`@upstash/qstash` Receiver, `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY`). 인디해커 무료 플랜 친화적 아키텍처 — 일 500 메시지 무료 한도 내 운영
>   - **Team 플랜 제거** — Free/Pro 2종으로 단순화 (BR-구독결제.md SSOT). 플랜 카탈로그·subscriptions.plan ENUM·미들웨어 모두 조정
>   - **해지 예약 정책** — `subscriptions.cancel_scheduled_at` 컬럼 추가, BR-38·39 신규. UC-31 재작성 + UC-38 신규. 빌링키 파기 cron 추가
>   - **cron 운영 가시화** — `cron_runs` 테이블 신규, `/api/system/crons/**` 3개 엔드포인트, SystemAdmin 전용 `/system/crons` 페이지
>   - **cron 빈도 환경별 분리** — 개발(agents/tick 10분·expire-orders 15분) / 운영(둘 다 5분). 환경변수 `QSTASH_*_CRON`으로 분리. 무료 한도 안착
>   - **정기결제 cron 명·시각 변경** — `/api/cron/billing/recurring` (09:00) → `/api/cron/billing/tick` (02:00 KST, BR-02)
>   - **webhook_events 멱등성에 QStash 추가** — `provider`에 `'qstash'` 추가, `Upstash-Message-Id`를 `event_id`로 저장

---

## 1. 프로젝트 개요

### 핵심 기술 접근 방식

PRD의 타겟 플랫폼(Web)과 저장 방식(Database)을 기준으로, 서버리스 최적화된 풀스택 Next.js 아키텍처를 채택한다. AI 콘텐츠 생성은 Google Gemini API(무료 티어)를 통해 구현하며, 1개월 이내 MVP 출시를 목표로 최소 인프라로 시작한다.

### 주요 기술 결정 사항 요약

| 구분         | 선택                                   | 근거                                                                            |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------- |
| 프레임워크   | Next.js v16 + Hono                     | PRD 타겟 플랫폼: Web                                                            |
| UI 컴포넌트  | shadcn/ui + Tailwind v4                | 커스텀 Notion 스타일 디자인 + 반응형 필수                                       |
| 데이터베이스 | Neon Serverless Postgres + Drizzle ORM | PRD 저장 방식: Database + 서버리스 환경                                         |
| 인증         | Clerk v6+                              | 이메일+비밀번호 인증 + Webhook 기반 users 동기화 + 향후 조직 관리(Phase 3) 확장 |
| AI API       | Google Gemini API (`gemini-3.1-flash`) | 핵심 기능: 콘텐츠 자동 생성 + 무료 티어                                         |
| 배포         | Vercel                                 | Next.js 최적화 + Neon 공식 통합 + 저예산                                        |

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
   ├── /app/(public)/          # 공개 페이지 그룹 — 페이지 구성은 IA.md §1 사이트맵 SSOT
   ├── /app/(dashboard)/       # 인증 필요 페이지 그룹 — 페이지 구성은 IA.md §1 SSOT
   └── /app/api/[[...hono]]/   # Hono API 위임 진입점
        ├── POST /api/generate/stream    # AI 콘텐츠 스트리밍 생성
        ├── GET  /api/guidelines         # 지침 목록 조회
        ├── POST /api/guidelines         # 지침 생성
        ├── GET  /api/guidelines/:id     # 지침 단건 조회 (수정 폼 초기 데이터)
        ├── GET  /api/history            # 생성 이력 조회
        ├── PUT  /api/history/:id        # 생성 이력 수동 저장 (에디터 편집본)
        │
        │   # ── Phase 2: 콘텐츠 이력 관리 ─────────────────────────────
        ├── GET    /api/contents/:id/versions                        # 버전 목록
        ├── POST   /api/contents/:id/versions                        # 현재 본문 → 새 버전 스냅샷
        ├── GET    /api/contents/:id/versions/:no                    # 버전 단건 조회
        ├── POST   /api/contents/:id/versions/:no/restore            # 해당 버전으로 복원
        ├── GET    /api/contents/:id/versions/diff?from=A&to=B       # 두 버전 차이 비교
        │
        │   # ── Phase 2: 다국어 자동 번역 (한↔영) ─────────────────────
        ├── GET    /api/contents/:id/translations                    # 번역 목록 (언어별 상태)
        ├── POST   /api/contents/:id/translations/stream             # 번역 스트리밍 생성 (target: ko|en)
        ├── GET    /api/contents/:id/translations/:lang              # 특정 언어 번역 본문 조회
        ├── DELETE /api/contents/:id/translations/:lang              # 특정 언어 번역 삭제
        │
        │   # ── Phase 3: 조직(팀) 관리 ──────────────────────────────
        ├── GET    /api/org                                # 내가 속한 조직 목록
        ├── POST   /api/org                                # 조직 생성
        ├── GET    /api/org/:id                            # 조직 단건 조회
        ├── PATCH  /api/org/:id                            # 조직 설정 수정 (org:admin)
        ├── DELETE /api/org/:id                            # 조직 삭제 (org:admin)
        ├── GET    /api/org/:id/members                    # 멤버 목록
        ├── POST   /api/org/:id/members/invitations        # 초대 발송 (org:admin)
        ├── PATCH  /api/org/:id/members/:userId            # 역할 변경 (org:admin)
        ├── DELETE /api/org/:id/members/:userId            # 멤버 제거 (org:admin)
        │
        │   # ── Phase 3: 구독 결제 (토스페이먼츠 빌링키 + 11상태 주문) ──
        ├── GET    /api/billing/plans                                # 플랜 카탈로그 (공개 정보)
        ├── GET    /api/billing/subscription                         # 현재 구독 상태 (member 이상)
        ├── GET    /api/billing/usage                                # 이번 달 사용량 (member 이상)
        ├── POST   /api/billing/orders                               # 주문 생성 (ORDER 상태, expiresAt +30분, org:admin)
        ├── DELETE /api/billing/orders/:orderId                      # ORDER 상태 주문 삭제 (고아 주문 정리)
        ├── PATCH  /api/billing/orders/:orderId/status               # AUTH_* 상태 전환 (클라이언트 가드)
        ├── POST   /api/billing/orders/:orderId/confirm              # AUTH_SUCCESS → PAY_SUCCESS 승인 (서버 DB amount 사용)
        ├── POST   /api/billing/orders/:orderId/sync                 # AUTH_SUCCESS 폴백 동기화 (Toss GET orders 호출)
        ├── POST   /api/billing/subscription/cancel                  # 구독 취소 (current_period_end까지 사용, org:admin)
        ├── POST   /api/billing/subscription/change                  # 플랜 업/다운그레이드 (org:admin)
        ├── GET    /api/billing/payments                             # 결제 이력 (페이지네이션, org:admin)
        ├── GET    /api/billing/payments/:paymentKey                 # 결제 단건 상세 + 영수증 URL
        ├── POST   /api/billing/payments/:paymentKey/cancel-request  # 사용자 환불 요청 (PENDING)
        ├── PATCH  /api/billing/cancel-requests/:id                  # 관리자 승인/거절 (시스템 admin 전용, 향후)
        ├── POST   /api/webhooks/toss                                # 토스 Webhook — eventId 멱등성·항상 200 응답
        │
        │   # ── Phase 3: AI Agent (Tool Calling 기반) ──────────────
        ├── GET    /api/agents                                       # Agent 목록 (member 이상)
        ├── POST   /api/agents                                       # Agent 생성 (org:admin)
        ├── GET    /api/agents/:id                                   # Agent 단건 조회
        ├── PATCH  /api/agents/:id                                   # Agent 설정 수정 (org:admin)
        ├── DELETE /api/agents/:id                                   # Agent 삭제 (org:admin)
        ├── POST   /api/agents/:id/run                               # 즉시 실행 (수동 트리거, member 이상)
        ├── GET    /api/agents/:id/runs                              # 실행 이력
        ├── GET    /api/agents/:id/runs/:runId                       # 실행 단건 상세 (tool_calls 트레이스 포함)
        ├── GET    /api/agents/:id/runs/:runId/tool-calls            # Function Calling 호출 이력 (스트리밍 가능)
        ├── GET    /api/agents/tools                                 # 사용 가능한 도구 목록 (Topic Picker·Content Writer·Platform Publisher)
        │
        │   # ── Phase 3: Cron 트리거 (QStash JWT 서명 검증, BR-37 멱등성) ───
        │   #    Upstash QStash가 외부에서 각 엔드포인트를 일정에 따라 호출
        │   #    → Receiver(@upstash/qstash)로 Upstash-Signature 검증 후 처리
        ├── POST   /api/cron/agents/tick                             # Agent 스케줄 디스패처 (개발 10분 / 운영 5분)
        ├── POST   /api/cron/billing/tick                            # 정기결제 자동 청구 (매일 02:00 KST, BR-02)
        ├── POST   /api/cron/billing/expire-orders                   # 만료 주문 PAY_EXPIRED 처리 (개발 15분 / 운영 5분)
        ├── POST   /api/cron/billing/finalize-canceled               # current_period_end 도래 시 → status='canceled' + 빌링키 파기(BR-39) (매일 04:00 KST)
        ├── POST   /api/cron/quota/reset                             # 월간 quota 리셋 (매월 1일 00:00 KST)
        ├── POST   /api/cron/org/purge                     # 30일 grace 경과 조직 hard delete (매일 03:00 KST)
        │
        │   # ── Phase 3: SystemAdmin 운영 콘솔 ─────────────────────
        ├── GET    /api/system/crons                                 # 등록된 Schedule + 최근 cron_runs 요약
        ├── GET    /api/system/crons/:code/runs                      # cron_runs 페이지네이션 조회
        ├── GET    /api/system/crons/:code/qstash                    # QStash REST로 스케줄 메타 조회 (읽기 전용)
        │
        └── POST /api/webhooks/clerk     # Clerk Webhook (user.created / organization.* / organizationMembership.*)
        │
        ▼
[외부 서비스]
   ├── Clerk             → 인증·세션·조직 관리 (Phase 3: Organizations + Membership Webhook)
   ├── Neon Postgres     → 사용자·지침·이력·구독·결제·Agent·cron_runs 데이터 저장
   ├── Gemini API        → AI 콘텐츠 생성·번역 + Function Calling (Agent 도구 호출)
   ├── 토스페이먼츠       → 빌링키 발급·삭제 + 정기결제 + 단건 승인/취소 (Phase 3)
   ├── **Upstash QStash** → 외부 메시지 큐 — Schedule(cron)로 우리 `/api/cron/**` 호출 + 자동 재시도(기본 3회 지수 백오프) + JWT 서명 발급 (Phase 3, 무료 500 메시지/일)
   └── (Phase 3.5) Hashnode/Medium → Platform Publisher 도구로 Draft 전송 — 스키마만 정의

[QStash 트리거 흐름]
   QStash Cloud → HTTPS POST /api/cron/{name}
                  헤더: Upstash-Signature: <JWT>, Upstash-Message-Id: <unique>
                  ↓
   Receiver.verify(signature, body, signingKey)  ← 서명 위조·재전송 검증
                  ↓
   webhook_events 멱등성 체크 (Upstash-Message-Id UNIQUE) → 중복이면 즉시 200
                  ↓
   cron_runs INSERT(status='running') → 작업 실행 → status='completed'|'failed' UPDATE
                  ↓
   HTTP 200 응답 (5xx 시 QStash가 자동 재시도)
```

### 주요 컴포넌트 역할

| 컴포넌트           | 역할                                             |
| ------------------ | ------------------------------------------------ |
| Next.js App Router | 라우팅, SSR, 정적 생성, 미들웨어                 |
| Hono (API 레이어)  | REST API 라우터, 요청 검증, 응답 정규화          |
| Clerk Middleware   | 인증 보호 경로 제어, JWT 검증                    |
| Neon + Drizzle     | 데이터 CRUD, 스키마 마이그레이션                 |
| Gemini API         | 시스템 프롬프트 + 사용자 주제 → 블로그 초안 생성 |

### 기술 스택 선택 이유

| 기술          | 선택 이유 (PRD 기준)                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Next.js v16   | PRD 타겟 플랫폼이 Web → Nextjs.md 기준                                                                             |
| shadcn/ui     | 반응형 필수 + Notion 스타일 커스텀 → 커스터마이징 자유도 최고                                                      |
| Neon Postgres | PRD 저장 방식이 Database + Vercel 서버리스 환경 최적화                                                             |
| Clerk         | MVP: 이메일+비밀번호 인증. Webhook(`user.created`)으로 users 테이블 자동 동기화. 향후 조직 관리(Phase 3) 확장 대비 |
| Gemini API    | PRD 핵심 기능 AI 콘텐츠 생성 + 무료 티어로 저예산 MVP 적합                                                         |
| Vercel        | Neon 공식 통합 + 무료 플랜으로 1개월 내 MVP 출시 가능                                                              |

---

## 3. 기술 명세

### 3-1. 프론트엔드

| 항목                       | 기술                             | 비고                                                                       |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| 프레임워크                 | Next.js v16 App Router           | Turbopack 개발 서버                                                        |
| 언어                       | TypeScript                       | `any` 사용 금지                                                            |
| UI 컴포넌트                | shadcn/ui                        | 기능적 핵심 컴포넌트                                                       |
| 스타일                     | Tailwind CSS v4                  | shadcn/ui 자동 포함                                                        |
| 아이콘                     | Lucide React                     | shadcn/ui 번들 포함                                                        |
| 상태 관리                  | Zustand                          | 글로벌 상태 (생성 중 스트리밍 등)                                          |
| 서버 상태                  | TanStack Query                   | API 데이터 페칭·캐싱                                                       |
| 폼 검증                    | react-hook-form + zod            | 지침 입력폼                                                                |
| 에디터                     | MDX Editor (`@mdxeditor/editor`) | 생성된 초안 WYSIWYG 편집 + 실시간 미리보기                                 |
| Diff Viewer (Phase 2)      | `react-diff-viewer-continued`    | 버전 비교 line-by-line 시각화 (`splitView` 모드, 마크다운 plain text 기반) |
| 가상 스크롤 (Phase 2)      | `@tanstack/react-virtual`        | 버전 목록 50개+ 시 메모리 최적화                                           |
| 결제 위젯 (Phase 3)        | `@tosspayments/payment-sdk`      | 토스페이먼츠 결제창·빌링키 발급 위젯 (클라이언트 전용)                     |
| 사용량 차트 (Phase 3)      | `recharts`                       | 월별 생성·번역·Agent 실행 사용량 시각화                                    |
| Cron 표현식 입력 (Phase 3) | `react-js-cron` + `cronstrue`    | Agent 스케줄 입력 UI + 한글 해석 표시                                      |
| 조직 스위처 (Phase 3)      | `<OrganizationSwitcher>` (Clerk) | Sidebar 상단 조직 전환 컴포넌트                                            |

**컴포넌트 원칙**

- 모든 UI 컴포넌트 기본 `"use client"`
- 서버 컴포넌트는 데이터 페칭이 명확한 경우에만 사용
- `page.tsx` / `layout.tsx`의 `params`, `searchParams`는 반드시 `await` (Next.js 15+)

### 3-2. 백엔드

| 항목        | 기술                        | 비고                                    |
| ----------- | --------------------------- | --------------------------------------- |
| API 라우터  | Hono                        | `src/app/api/[[...hono]]/route.ts` 위임 |
| 런타임      | Node.js (Vercel Serverless) | Edge Runtime 미사용                     |
| 스키마 검증 | Zod                         | API 요청·응답 검증                      |
| ORM         | Drizzle ORM                 | Neon Serverless 드라이버 연동           |
| AI SDK      | @google/genai               | 서버 전용, 클라이언트 노출 금지         |

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
│   ├── history/              # 생성 이력
│   ├── content-versions/     # 콘텐츠 버전 (Phase 2)
│   ├── translations/         # 다국어 번역 (Phase 2)
│   ├── organizations/        # 조직 관리 (Phase 3)
│   ├── billing/              # 구독 결제 (Phase 3)
│   └── agents/               # AI Agent 자동화 (Phase 3)
├── lib/
│   ├── gemini.ts             # Gemini API 싱글턴 (서버 전용)
│   └── toss.ts               # 토스페이먼츠 SDK 래퍼 (Phase 3, 서버 전용)
└── db/
    ├── schema.ts             # Drizzle 스키마 정의
    └── migrations/           # SQL 마이그레이션 파일
```

### 3-3. 데이터베이스 설계 방향

**주요 테이블**

| 테이블                                             | 역할                                                             | 주요 컬럼                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                            | 사용자 정보 (Clerk 연동)                                         | `clerk_user_id`, `email`, `plan`, `default_organization_id`(Phase 3), `payment_customer_key`(Phase 3)                                                                                                                                                                                                 |
| `guidelines`                                       | AI 지침(지시서)                                                  | `organization_id`(Phase 3 전환), `created_by`(Phase 3), `title`, `content`, `is_default`                                                                                                                                                                                                              |
| `contents`                                         | 생성된 콘텐츠 이력                                               | `user_id`, `organization_id`(Phase 3), `guideline_id`, `topic`, `keywords`(JSON), `direction`, `body`, `seo_meta`(JSON), `source_lang`(Phase 2), `created_by_agent_job_id`(Phase 3)                                                                                                                   |
| `content_versions` **(Phase 2)**                   | 콘텐츠 버전 스냅샷                                               | `content_id`, `version_no`(INT, content 단위 1부터 증가), `snapshot_body`, `snapshot_seo_meta`(JSON), `created_at`                                                                                                                                                                                    |
| `content_translations` **(Phase 2)**               | 다국어 번역본 (언어별 1행)                                       | `content_id`, `target_lang`(`ko`\|`en`), `translated_body`, `translated_seo_meta`(JSON), `status`, `error_message`                                                                                                                                                                                    |
| `organizations` **(Phase 3)**                      | 조직(팀) 정보 (Clerk 연동, soft delete)                          | `clerk_org_id`, `name`, `slug`, `owner_user_id`, `plan`(`free`\|`pro`\|`team`), `is_personal`(BOOL), `deleted_at`(TIMESTAMPTZ NULL, 30일 grace)                                                                                                                                                       |
| `organization_members` **(Phase 3)**               | 조직 멤버 관계 (Clerk mirroring)                                 | `organization_id`, `user_id`, `role`(`admin`\|`member`), `invited_by`, `joined_at`                                                                                                                                                                                                                    |
| `subscriptions` **(Phase 3, v1.4)**                | 구독 빌링키 보관 (조직당 1행)                                    | `organization_id`(UNIQUE), `plan`(`'pro'` 만 — Team 제거), `status`(`active`\|`past_due`\|`canceled`), `billing_key_encrypted`(canceled 시 NULL, BR-39), `next_billing_at`, `current_period_end`, `canceled_at`, `past_due_since`, **`cancel_scheduled_at`**(BR-38 해지 예약, status='active'와 공존) |
| `orders` **(Phase 3, Toss 11상태)**                | 결제 주문 (단건·정기 공통)                                       | `id`(VARCHAR(64) = Toss orderId), `organization_id`, `subscription_id`, `kind`(`new_subscription`\|`recurring`\|`plan_change`), `status`(11종 내부 상태), `total_amount`, `expires_at`(TIMESTAMPTZ, +30분), `created_at`                                                                              |
| `order_items` **(Phase 3)**                        | 주문 상품 라인                                                   | `order_id`, `plan_code`, `quantity`(1 고정), `unit_price`, `period_months`(1 고정)                                                                                                                                                                                                                    |
| `order_status_history` **(Phase 3)**               | 주문 상태 변경 감사                                              | `order_id`, `from_status`, `to_status`, `changed_by`(user_id\|`system`\|`webhook`\|`cron`), `reason`, `changed_at`                                                                                                                                                                                    |
| `payments` **(Phase 3)**                           | Toss Payment 객체 보관                                           | `payment_key`(VARCHAR(64) UNIQUE = Toss paymentKey), `order_id`, `method`, `status`(Toss enum 8종), `amount`, `balance_amount`, `approved_at`, `raw_data`(JSONB Toss 응답 원본)                                                                                                                       |
| `payment_logs` **(Phase 3)**                       | 모든 Toss API 요청/응답/에러 감사                                | `order_id`, `type`(`CONFIRM_REQ`\|`CONFIRM_RES`\|`CONFIRM_ERR`\|`CANCEL_*`\|`SYNC_*`\|`BILLING_*`\|`RECURRING_*`), `request_body`(JSONB), `response_body`(JSONB), `status_code`, `error_code`, `error_message`, `created_at`                                                                          |
| `payment_cancel_requests` **(Phase 3)**            | 사용자 취소/환불 요청                                            | `order_id`, `requested_by`, `requested_items`(JSONB), `refund_amount`, `status`(`PENDING`\|`APPROVED`\|`REJECTED`), `reason`, `decided_at`, `decided_by`                                                                                                                                              |
| `payment_cancels` **(Phase 3)**                    | Toss cancel API 결과                                             | `payment_key`, `cancel_request_id`, `cancel_amount`, `transaction_key`, `canceled_at`, `raw_data`(JSONB)                                                                                                                                                                                              |
| `payment_error_codes` **(Phase 3)**                | 에러 코드 → 한글 메시지 매핑 (시드 데이터)                       | `pg_provider`(`toss`), `error_code`(PK), `display_message`, `action_type`(`retry`\|`change_card`\|`contact_support`)                                                                                                                                                                                  |
| `webhook_events` **(Phase 3, v1.4)**               | Toss/Clerk/QStash 멱등성 보장                                    | `event_id`(UNIQUE), `provider`(`toss`\|`clerk`\|`qstash`), `event_type`, `payload`(JSONB), `processed_at`. QStash는 `Upstash-Message-Id`를 `event_id`로 저장 (BR-37)                                                                                                                                  |
| `cron_runs` **(Phase 3, v1.4)**                    | cron 실행 이력 (UC-39 가시화용)                                  | `id`, `cron_code`(5종 + manual), `qstash_message_id`(NULL=수동), `triggered_by`(`schedule`\|`manual`), `triggered_by_user_id`, `status`(`running`\|`completed`\|`failed`), `result_summary`(JSONB), `error_message`, `started_at`, `finished_at`                                                      |
| `usage_quotas` **(Phase 3)**                       | 조직별 월간 사용량 카운터 (BR-32)                                | `organization_id`, `period_month`(YYYY-MM KST), `generations_used`, `translations_used`, `agent_runs_used`, UNIQUE(`organization_id`+`period_month`)                                                                                                                                                  |
| `agent_jobs` **(Phase 3)**                         | AI Agent 정의 (조직 소유)                                        | `organization_id`, `created_by`, `name`, `topic_source`(JSONB), `guideline_id`(조직 공용 지침), `cron_expression`, `target_lang`, `publish_target`(JSONB, Phase 3.5 placeholder), `is_active`, `last_run_at`, `next_run_at`                                                                           |
| `agent_runs` **(Phase 3)**                         | Agent 실행 이력                                                  | `agent_job_id`, `triggered_by`(`schedule`\|`manual`), `triggered_by_user_id`, `status`(`pending`\|`running`\|`completed`\|`failed`), `selected_topic`, `generated_content_id`, `error_code`, `error_message`, `started_at`, `finished_at`                                                             |
| `agent_topic_sources` **(Phase 3)**                | manual_pool 주제 풀                                              | `agent_job_id`, `topic`, `consumed_at`, `agent_run_id`, `created_at`                                                                                                                                                                                                                                  |
| `agent_tools` **(Phase 3, Function Calling)**      | 도구 레지스트리 (시드 데이터)                                    | `code`(PK, `topic_picker`\|`content_writer`\|`platform_publisher`), `display_name`, `description`, `function_schema`(JSONB, Gemini functionDeclaration), `requires_phase`(`3`\|`3.5`), `is_enabled`                                                                                                   |
| `agent_tool_calls` **(Phase 3)**                   | Function Calling 호출 트레이스                                   | `agent_run_id`, `sequence_no`(INT, run 내 호출 순서), `tool_code`, `arguments`(JSONB), `result`(JSONB), `status`(`pending`\|`success`\|`failed`), `error_message`, `duration_ms`, `started_at`, `finished_at`                                                                                         |
| `platform_credentials` **(Phase 3.5 placeholder)** | 외부 플랫폼 발행 인증정보 (스키마만 정의, 실제 사용은 Phase 3.5) | `organization_id`, `platform`(`hashnode`\|`medium`), `access_token_encrypted`, `default_publication_id`, `last_used_at`                                                                                                                                                                               |

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

**Phase 2 — `content_versions` 스키마**

```typescript
// content_versions — 자동/수동 스냅샷 저장소
// 자동 생성 시점: PUT /api/history/:id 직전 본문, 복원 직전 본문
// 수동 생성 시점: POST /api/contents/:id/versions
{
  id: string                    // UUID PK
  content_id: string            // FK → contents.id (CASCADE DELETE)
  version_no: number            // content 단위 1부터 증가 (UNIQUE: content_id+version_no)
  snapshot_body: string         // 해당 시점 마크다운 전문
  snapshot_seo_meta: {          // 해당 시점 SEO 메타 (JSONB)
    title: string
    description: string
    slug: string
    keywords: string[]
  }
  created_at: string            // 스냅샷 생성 시각
}
```

**Phase 2 — `content_translations` 스키마**

```typescript
// content_translations — 콘텐츠당 언어별 최대 1행 (UNIQUE: content_id+target_lang)
// 재번역 시 기존 행을 UPDATE (덮어쓰기)
{
  id: string                    // UUID PK
  content_id: string            // FK → contents.id (CASCADE DELETE)
  target_lang: 'ko' | 'en'      // Phase 2 지원 언어 (한↔영만)
  translated_body: string       // 번역된 마크다운 전문
  translated_seo_meta: {        // 번역된 SEO 메타 (JSONB, 원문과 동일 구조)
    title: string
    description: string
    slug: string
    keywords: string[]
  }
  status: 'pending' | 'streaming' | 'completed' | 'failed'
  error_message: string | null  // status='failed' 시 사유
  created_at: string
  updated_at: string
}
```

**Phase 2 — `contents` 테이블 확장 컬럼**

- `source_lang` VARCHAR(2) NOT NULL DEFAULT `'ko'` — 원문 언어 (번역 시 from/to 결정에 사용)

**Phase 2 마이그레이션 파일 추가**

- `0004_create_content_versions.sql` — `content_versions` 테이블 + `version_no` UNIQUE 인덱스 + `updated_at` 트리거
- `0005_create_content_translations.sql` — `content_translations` 테이블 + `(content_id, target_lang)` UNIQUE 인덱스 + status ENUM 제약
- `0006_add_source_lang_to_contents.sql` — `contents.source_lang` 컬럼 추가 (기본값 `'ko'`)

**Phase 3 — `organizations` / `organization_members` 스키마**

```typescript
// organizations — Clerk Organizations와 1:1 동기화 + Personal Org 자동 생성 (BR-31)
// soft delete: deleted_at IS NOT NULL이면 30일 grace 진입, 매일 cron이 30일 경과 시 완전 삭제
{
  id: string; // UUID PK
  clerk_org_id: string; // UNIQUE, Clerk org_id (org_xxx) — Personal Org도 Clerk 생성 필수
  name: string; // 조직 표시명 (Personal Org: "{email}'s Workspace", 최대 80자)
  slug: string; // UNIQUE, URL 친화 식별자 (Personal Org: "personal-{user_id_short}")
  owner_user_id: string; // FK → users.id (생성자, 권한과 무관 — Personal Org는 본인)
  plan: "free" | "pro"; // v1.4: Team 제거. subscriptions 미존재 시 'free'
  is_personal: boolean; // true=Personal Org (멤버 초대 불가·조직 삭제 불가·플랜 업그레이드만 허용)
  deleted_at: string | null; // soft delete: NOT NULL 시 30일 grace 진입 (Personal Org는 절대 NOT NULL 불가)
  created_at: string;
  updated_at: string;
}

// organization_members — Clerk OrganizationMembership과 동기화 (단일 진실: Clerk)
{
  id: string; // UUID PK
  organization_id: string; // FK → organizations.id (CASCADE DELETE)
  user_id: string; // FK → users.id (CASCADE DELETE)
  role: "admin" | "member"; // Clerk 'org:admin' / 'org:member' 매핑
  invited_by: string | null; // FK → users.id (Personal Org는 NULL)
  joined_at: string;
  // UNIQUE: (organization_id, user_id)
}
```

**Phase 3 — `subscriptions` 스키마 (빌링키 보관 + 정기결제 메타)**

```typescript
// subscriptions — 조직당 최대 1행 (UNIQUE: organization_id)
// free 플랜은 row 미존재. orders/payments 테이블이 실제 결제 이력을 가짐
// 빌링키는 AES-256-GCM 암호화 후 보관 — 매일 정기결제 cron(/api/cron/billing/tick)이 사용
// v1.4: Team 제거 (Free/Pro 2종), cancel_scheduled_at 추가 (BR-38)
{
  id: string; // UUID PK
  organization_id: string; // UNIQUE, FK → organizations.id (CASCADE DELETE)
  plan: "pro"; // Pro만 row 존재 (Free는 row 없음, Team 제거)
  status: "active" | "past_due" | "canceled";
  billing_key_encrypted: string | null; // AES-256-GCM(Toss billingKey). canceled 시 NULL (BR-39 파기)
  amount: number; // 월 결제 금액 (KRW) — 현재 29,900 (BR-구독결제.md)
  started_at: string; // 최초 결제 성공 시점
  next_billing_at: string | null; // 다음 정기결제 예정일. canceled·해지 예약 시 NULL
  current_period_end: string; // canceled 후에도 유효한 마지막 사용일
  cancel_scheduled_at: string | null; // BR-38: 해지 예약 요청 시점. status='active'와 공존 가능
  canceled_at: string | null; // status='canceled' 전환된 실제 시점 (current_period_end 직후)
  past_due_since: string | null; // status='past_due' 진입 시점 (3일 grace 시작 기준)
  created_at: string;
  updated_at: string;
}
```

> **v1.4 정책 정리**:
>
> - **해지 예약**: `cancel_scheduled_at IS NOT NULL` && `status='active'` → 사용자 사용은 정상, 단 cron이 `next_billing_at`을 NULL로 설정하여 재청구 안 함
> - **canceled 전환**: `current_period_end` 도래 시 `/api/cron/billing/finalize-canceled`가 `status='canceled'` + Toss 빌링키 삭제 API 호출 + `billing_key_encrypted = NULL`
> - **해지 예약 취소(UC-38)**: `cancel_scheduled_at = NULL` 복구 + `next_billing_at = current_period_end + 1일`로 재설정

**Phase 3 — `cron_runs` 스키마 (v1.4 신규, UC-39 운영 가시화)**

```typescript
// cron_runs — QStash가 호출한 각 cron 실행 결과 또는 SystemAdmin 수동 트리거 결과
// SystemAdmin의 /system/crons 페이지가 조회 (읽기 전용)
{
  id: string                          // UUID PK
  cron_code:                          // 5개 정의된 cron + 수동 코드
    | 'agents_tick' | 'billing_tick' | 'billing_expire_orders'
    | 'billing_finalize_canceled' | 'quota_reset' | 'organizations_purge'
  qstash_message_id: string | null    // Upstash-Message-Id (수동 트리거 시 NULL)
  triggered_by: 'schedule' | 'manual'
  triggered_by_user_id: string | null // SystemAdmin 수동 트리거 시 user_id
  status: 'running' | 'completed' | 'failed'
  result_summary: object              // JSONB — 처리 결과 (예: { processed: 5, succeeded: 4, failed: 1 })
  error_message: string | null
  started_at: string
  finished_at: string | null
}
```

**Phase 3 — 결제 주문/이력 스키마 (toss-quickstart 11상태 기반)**

> 빌링키 정기결제도 매월 신규 `orders` 행을 생성한 뒤 토스 빌링키 결제 API를 호출하는 방식으로 통일한다.
> 이렇게 하면 단건 결제(신규 구독·플랜 변경)와 정기결제가 동일한 감사·환불 파이프라인을 공유한다.

```typescript
// orders — 모든 결제 주문 (Toss orderId)
// id = Toss orderId 형식: 6~64자, 영문/숫자/-_= 조합 (VARCHAR(64))
// kind로 결제 유형 구분: 신규 구독 / 정기결제 / 플랜 변경(prorated)
{
  id: string                    // VARCHAR(64) PK, UUID 기반 문자열 (Toss orderId)
  organization_id: string       // FK → organizations.id
  subscription_id: string | null // FK → subscriptions.id (신규 구독은 NULL, 정기/변경은 NOT NULL)
  kind: 'new_subscription' | 'recurring' | 'plan_change'
  status:                       // 11개 내부 상태 (toss-quickstart §내부 주문 상태 설계)
    | 'ORDER' | 'AUTH_READY' | 'AUTH_SUCCESS' | 'AUTH_CANCEL' | 'AUTH_FAIL'
    | 'PAY_SUCCESS' | 'PAY_FAIL' | 'PAY_WAITING' | 'PAY_EXPIRED'
    | 'PAY_CANCELED' | 'PAY_CANCELED_PARTIAL'
  total_amount: number          // KRW, confirm 시 서버가 이 값을 사용 (클라이언트 amount 무시)
  order_name: string            // Toss orderName (최대 100자, 예: "IndiePost AI Pro 월 구독")
  customer_key: string          // users.payment_customer_key 캐시 (감사용)
  expires_at: string            // TIMESTAMPTZ, 주문 생성 +30분 (cron이 PAY_EXPIRED 처리)
  metadata: object              // JSONB (plan_change 시 from_plan/to_plan/proration_amount 등)
  created_by: string | null     // FK → users.id (recurring은 NULL=system)
  created_at: string
  updated_at: string
}

// order_items — 주문 라인 (구독은 1주문 1라인)
{
  id: string                    // UUID PK
  order_id: string              // FK → orders.id (CASCADE)
  plan_code: 'pro'              // v1.4: Team 제거 — Phase 4에서 추가 시 'pro' | 'team'으로 확장
  quantity: number              // 구독은 1 고정
  cancelled_quantity: number    // 환불 시 증가
  used_quantity: number         // 구독은 항상 0 (사용 기반 환불 미지원, BR-32 quota로 갈음)
  unit_price: number            // KRW
  period_months: number         // 구독은 1 고정 (월 단위)
}

// order_status_history — 상태 변경 감사 (BR-34 분쟁 증빙)
{
  id: string                    // UUID PK
  order_id: string              // FK → orders.id (CASCADE)
  from_status: string | null    // 최초 ORDER 진입 시 NULL
  to_status: string             // 11개 내부 상태 중 하나
  changed_by: string            // user_id | 'system' | 'webhook' | 'cron'
  reason: string | null         // 사용자 메시지 또는 에러 코드
  changed_at: string
}

// payments — Toss Payment 객체 (paymentKey)
// 한 order에 하나의 payment만 존재 (Toss 정책상 재시도는 신규 order로)
{
  id: string                    // UUID PK
  payment_key: string           // VARCHAR(64) UNIQUE = Toss paymentKey
  order_id: string              // FK → orders.id
  method: string | null         // '카드' | '간편결제' | '가상계좌' 등 Toss 응답값
  status: string                // Toss enum 8종 (READY/IN_PROGRESS/WAITING_FOR_DEPOSIT/DONE/CANCELED/PARTIAL_CANCELED/ABORTED/EXPIRED)
  amount: number                // 승인 금액
  balance_amount: number        // 남은 잔액 (취소 시 감소)
  approved_at: string | null
  raw_data: object              // JSONB, Toss /confirm 응답 전체 (영수증 URL·카드 메타 등)
  created_at: string
  updated_at: string
}

// payment_logs — 모든 Toss API 요청/응답/에러 자동 기록 (tossRequest 래퍼가 INSERT)
// 분쟁·감사 증빙용 — 30일 후 자동 아카이브 권장
{
  id: string                    // UUID PK
  order_id: string | null       // FK → orders.id (없을 수 있음 — 빌링키 발급 시)
  type: string                  // 'CONFIRM_REQ' | 'CONFIRM_RES' | 'CONFIRM_ERR' | 'CANCEL_*' | 'SYNC_*' | 'BILLING_KEY_ISSUE_*' | 'RECURRING_CHARGE_*'
  request_body: object | null   // JSONB
  response_body: object | null  // JSONB
  status_code: number | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

// payment_cancel_requests — 사용자 환불 요청 (관리자 승인 대기)
{
  id: string                    // UUID PK
  order_id: string              // FK → orders.id
  requested_by: string          // FK → users.id
  requested_items: object       // JSONB: [{order_item_id, cancel_quantity}]
  refund_amount: number         // 자동 계산 (calculateRefundAmount, KRW Math.floor)
  reason: string                // 사용자 입력 사유
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decided_at: string | null
  decided_by: string | null     // FK → users.id (시스템 admin)
  decided_reason: string | null
  created_at: string
}

// payment_cancels — Toss cancel API 결과 (한 cancel_request에 1+개)
{
  id: string                    // UUID PK
  payment_key: string           // FK 논리 → payments.payment_key
  cancel_request_id: string     // FK → payment_cancel_requests.id
  cancel_amount: number
  transaction_key: string       // Toss 응답 transactionKey
  canceled_at: string
  raw_data: object              // JSONB, Toss cancel 응답 전체
}

// payment_error_codes — 에러 코드 한글 매핑 (시드 데이터, 0014 마이그레이션에서 일괄 INSERT)
// 토스 공식 에러코드(`docs/tech/toss.md §자주 발생하는 에러 코드`) 기준
{
  pg_provider: 'toss'           // 복합 PK 1
  error_code: string            // 복합 PK 2 (예: 'NOT_FOUND_PAYMENT_SESSION', 'REJECT_CARD_COMPANY')
  display_message: string       // 한글 사용자 표시 메시지
  action_type: 'retry' | 'change_card' | 'contact_support' | 'expired'
}

// webhook_events — Toss/Clerk Webhook 멱등성 보장 (BR-34 중복 처리 방지)
{
  id: string                    // UUID PK
  event_id: string              // UNIQUE (Toss eventId · Clerk svix-id)
  provider: 'toss' | 'clerk'
  event_type: string            // PAYMENT_STATUS_CHANGED | VIRTUAL_ACCOUNT_DEPOSIT_CALLBACK | user.created | organization.* 등
  payload: object               // JSONB, 원본 페이로드
  processed_at: string
}
```

**Phase 3 — `usage_quotas` 스키마**

```typescript
// usage_quotas — 조직별 월간 사용량 카운터 (BR-32 플랜 한도 검증용)
// 첫 사용 시 row 생성, 매월 1일 자동 리셋 (QStash Schedule — /api/cron/quota/reset)
// UPSERT 패턴: INSERT ... ON CONFLICT (organization_id, period_month) DO UPDATE
{
  id: string; // UUID PK
  organization_id: string; // FK → organizations.id (CASCADE DELETE)
  period_month: string; // 'YYYY-MM' 형식 (KST 기준)
  generations_used: number; // /api/generate/stream 성공 횟수
  translations_used: number; // /api/contents/:id/translations/stream 성공 횟수
  agent_runs_used: number; // agent_runs.status='completed' 카운트
  created_at: string;
  updated_at: string;
  // UNIQUE: (organization_id, period_month)
}
```

**Phase 3 — `agent_jobs` / `agent_runs` / `agent_topic_sources` 스키마**

```typescript
// agent_jobs — Agent 정의 (조직 소유, 공유 지침 BR-34 기반)
{
  id: string                    // UUID PK
  organization_id: string       // FK → organizations.id (CASCADE DELETE)
  created_by: string            // FK → users.id
  name: string                  // 최대 80자
  topic_source: {               // JSONB
    type: 'manual_pool' | 'keyword_expansion'
    seed_keywords?: string[]    // keyword_expansion 필수, 최대 10개
  }
  guideline_id: string | null   // FK → guidelines.id — Phase 3에서 조직 공용 지침으로 전환됨 (BR-34)
  target_lang: 'ko' | 'en'
  cron_expression: string       // 5-field, 최소 간격 1시간 (BR-33)
  publish_target: object | null // JSONB, Phase 3.5 placeholder: { platform: 'hashnode'|'medium', publication_id?, draft_only: true }
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null    // cron 파서로 계산된 다음 실행 예정
  created_at: string
  updated_at: string
}

// agent_runs — 실행 1건
{
  id: string                    // UUID PK
  agent_job_id: string          // FK → agent_jobs.id (CASCADE DELETE)
  triggered_by: 'schedule' | 'manual'
  triggered_by_user_id: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  selected_topic: string | null
  generated_content_id: string | null  // FK → contents.id
  error_code: string | null     // 'GEMINI_RATE_LIMIT' | 'QUOTA_EXCEEDED' | 'TOPIC_POOL_EXHAUSTED' | 'TOOL_CALL_FAILED' | ...
  error_message: string | null
  started_at: string
  finished_at: string | null
}

// agent_topic_sources — manual_pool 주제 풀
{
  id: string                    // UUID PK
  agent_job_id: string          // FK → agent_jobs.id (CASCADE DELETE)
  topic: string                 // 최대 300자
  consumed_at: string | null
  agent_run_id: string | null   // FK → agent_runs.id (소비 시 채워짐)
  created_at: string
}
```

**Phase 3 — Tool Calling 스키마 (Gemini Function Calling)**

> SRS §2.3 Agent 전용 도구 정의를 기반으로 한다.  
> Gemini의 `functionDeclarations`로 등록하고, LLM이 자율적으로 도구를 선택·호출한다.  
> 각 도구 호출은 `agent_tool_calls`에 한 행씩 기록되며, Agent 실행 상세 페이지에서 트레이스로 표시된다.

```typescript
// agent_tools — 도구 레지스트리 (시드 데이터, 0017 마이그레이션에서 INSERT)
{
  code: string; // PK: 'topic_picker' | 'content_writer' | 'platform_publisher'
  display_name: string; // '주제 선정기' 등
  description: string; // LLM에게 전달되는 도구 설명
  function_schema: object; // JSONB, Gemini functionDeclaration 형식:
  // { name, description, parameters: { type, properties, required } }
  requires_phase: "3" | "3.5"; // 'platform_publisher'는 '3.5' — Phase 3에서는 dry-run만 허용
  is_enabled: boolean; // 기능 플래그 (Phase 3.5 출시 전엔 platform_publisher=false)
  created_at: string;
  updated_at: string;
}

// agent_tool_calls — Function Calling 호출 트레이스 (run 단위 다중 행)
// LLM 응답에 functionCall이 포함되면 서버가 매핑된 도구를 실행하고 결과를 functionResponse로 다시 LLM에게 전달
// sequence_no는 같은 run 내 호출 순서 (1부터)
// (v1.4.1) 마스킹 이원화: result는 UI 노출용 마스킹 적용본만 저장 — LLM에 전달된 functionResponse 원본은 별도 보관하지 않음
//   (Gemini 컨텍스트 메모리에서만 일시 사용. 감사 필요 시 cron_runs.result_summary 또는 별도 디버그 로그 사용)
{
  id: string; // UUID PK
  agent_run_id: string; // FK → agent_runs.id (CASCADE DELETE)
  sequence_no: number; // INT, 호출 순서 (1, 2, 3...)
  tool_code: string; // FK 논리 → agent_tools.code
  arguments: object; // JSONB, LLM이 호출한 인자 (마스킹 동일 정책 적용)
  result: object | null; // JSONB, 도구 실행 결과 — UI 트레이스 노출용 마스킹 적용본
  //   (예: customer_email: "kim@*****.com", access_token: "sk_***")
  //   ID·status·plan 등 비밀 아닌 비즈니스 식별자는 원본 유지
  status: "pending" | "success" | "failed";
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
  // UNIQUE: (agent_run_id, sequence_no)
}

// platform_credentials — Phase 3.5 placeholder (스키마만 정의)
// 실제 사용은 Phase 3.5 (Hashnode/Medium 실제 API 호출 구현 시점)
{
  id: string; // UUID PK
  organization_id: string; // FK → organizations.id (CASCADE DELETE)
  platform: "hashnode" | "medium";
  access_token_encrypted: string; // AES-256-GCM
  default_publication_id: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  // UNIQUE: (organization_id, platform)
}
```

**Phase 3 — 표준 도구 3개 명세 (SRS §2.3)**

| 도구 code            | 입력 (arguments)                                                                                       | 출력 (result)                                                                                                    | Phase                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `topic_picker`       | `{ seed_keywords: string[], recent_topics: string[] }`                                                 | `{ topic: string, rationale: string }` — 중복 없는 long-tail 주제 1개                                            | 3                                                                        |
| `content_writer`     | `{ topic: string, guideline_id: string \| null, target_lang: 'ko'\|'en' }`                             | `{ content_id: string, body_preview: string, seo_meta: object }` — 기존 `/api/generate/stream` 파이프라인 재사용 | 3                                                                        |
| `platform_publisher` | `{ content_id: string, platform: 'hashnode'\|'medium', publication_id?: string, draft_only: boolean }` | `{ external_post_id: string, draft_url: string }`                                                                | 3.5 (Phase 3에서는 `dry_run=true`로 호출되어 실제 발행 없이 검증만 수행) |

**Phase 3 — `contents` 테이블 확장 컬럼**

- `organization_id` UUID NOT NULL — FK → organizations.id. 모든 콘텐츠는 조직 소유. 기존 row는 personal_org로 백필
- `created_by_agent_job_id` UUID NULL — FK → agent_jobs.id. Agent가 생성한 콘텐츠 추적

**Phase 3 — `guidelines` 테이블 확장 컬럼 (BR-34 조직 공용 전환)**

- `organization_id` UUID NOT NULL — FK → organizations.id. 조직 내 모든 멤버가 공유 (Option A)
- `created_by` UUID NOT NULL — FK → users.id. 누가 작성했는지 추적 (감사용)
- 기존 `user_id` 컬럼은 마이그레이션 0015에서 제거. 대신 `created_by`로 추적
- 기존 row는 사용자별 personal_org로 백필 + `created_by = user_id` 복사

**Phase 3 — `users` 테이블 확장 컬럼**

- `default_organization_id` UUID NULL — FK → organizations.id. 마지막 선택한 조직 (재로그인 시 자동 진입)
- `payment_customer_key` VARCHAR(300) UNIQUE NULL — Toss customerKey (사용자당 영구 1회 UUID 발급, 모든 결제에서 재사용 — toss-quickstart §customerKey 영구 관리)

**Phase 3 마이그레이션 파일 추가 (순서 의존성 주의)**

| #    | 파일                                             | 내용                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0007 | `0007_create_organizations.sql`                  | `organizations` + `organization_members` + Clerk org_id UNIQUE + `is_personal` + `deleted_at`                                                                                                                                                                                                               |
| 0008 | `0008_add_default_org_to_users.sql`              | `users.default_organization_id` + `users.payment_customer_key` UNIQUE                                                                                                                                                                                                                                       |
| 0009 | `0009_backfill_personal_orgs.sql`                | (v1.4.1) **`CREATE UNIQUE INDEX organizations_personal_per_user_uk ON organizations(owner_user_id) WHERE is_personal=true AND deleted_at IS NULL`** + 기존 user별 Personal Org 생성 + `users.default_organization_id` 채움 (멱등성: `WHERE NOT EXISTS`). 부분 unique index는 §3-5 3중 방어의 최종 DB 안전망 |
| 0010 | `0010_add_organization_to_contents.sql`          | `contents.organization_id` 추가 + Personal Org로 백필 + NOT NULL + `created_by_agent_job_id`                                                                                                                                                                                                                |
| 0011 | `0011_migrate_guidelines_to_org.sql`             | `guidelines.organization_id` + `created_by` 추가 + Personal Org로 백필 + 기존 `user_id` 컬럼 DROP                                                                                                                                                                                                           |
| 0012 | `0012_create_subscriptions.sql`                  | `subscriptions` + 빌링키 컬럼 (AES 암호화 저장 가정)                                                                                                                                                                                                                                                        |
| 0013 | `0013_create_orders.sql`                         | `orders` (id VARCHAR(64)) + `order_items` + `order_status_history`                                                                                                                                                                                                                                          |
| 0014 | `0014_create_payments.sql`                       | `payments` + `payment_logs` + `payment_cancel_requests` + `payment_cancels` + `payment_error_codes` 시드                                                                                                                                                                                                    |
| 0015 | `0015_create_webhook_events.sql`                 | `webhook_events` + `event_id` UNIQUE 인덱스                                                                                                                                                                                                                                                                 |
| 0016 | `0016_create_usage_quotas.sql`                   | `usage_quotas` + `(organization_id, period_month)` UNIQUE                                                                                                                                                                                                                                                   |
| 0017 | `0017_create_agents.sql`                         | `agent_jobs` + `agent_runs` + `agent_topic_sources` + `agent_runs.status='running'` 부분 인덱스                                                                                                                                                                                                             |
| 0018 | `0018_create_agent_tools.sql`                    | `agent_tools` 시드 (topic_picker·content_writer·platform_publisher) + `agent_tool_calls` 테이블                                                                                                                                                                                                             |
| 0019 | `0019_create_platform_credentials.sql`           | `platform_credentials` (Phase 3.5 placeholder, 스키마만)                                                                                                                                                                                                                                                    |
| 0020 | `0020_add_cancel_scheduled_to_subscriptions.sql` | **(v1.4)** `subscriptions.cancel_scheduled_at` 컬럼 추가 (BR-38) + `subscriptions.plan` CHECK 제약을 `'pro'`로 한정 (Team 제거)                                                                                                                                                                             |
| 0021 | `0021_extend_webhook_events_qstash.sql`          | **(v1.4)** `webhook_events.provider` CHECK 제약에 `'qstash'` 추가                                                                                                                                                                                                                                           |
| 0022 | `0022_create_cron_runs.sql`                      | **(v1.4)** `cron_runs` 테이블 신규 + `cron_code`·`started_at` 인덱스 (UC-39 운영 콘솔용)                                                                                                                                                                                                                    |

**마이그레이션 규칙** (`docs/tech/neon.md` 기준)

- 파일명 prefix: `0001_create_users.sql`, `0002_create_guidelines.sql`
- 멱등성 보장: `CREATE TABLE IF NOT EXISTS`
- 모든 테이블 `updated_at` + 자동 업데이트 트리거
- 식별자 전체 `snake_case`
- RLS 비활성화: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`
- 연결 문자열: 서버리스 환경에서 `-pooler` suffix 필수

### 3-4. API 설계

| 메서드   | 엔드포인트                                         | 설명                                                                                                     | 인증                                 |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `POST`   | `/api/generate/stream`                             | AI 콘텐츠 스트리밍 생성                                                                                  | 필수                                 |
| `GET`    | `/api/guidelines`                                  | 지침 목록 조회                                                                                           | 필수                                 |
| `POST`   | `/api/guidelines`                                  | 지침 생성                                                                                                | 필수                                 |
| `GET`    | `/api/guidelines/:id`                              | 지침 단건 조회 (수정 폼 초기 데이터)                                                                     | 필수                                 |
| `PUT`    | `/api/guidelines/:id`                              | 지침 수정 또는 기본 지침 설정                                                                            | 필수                                 |
| `DELETE` | `/api/guidelines/:id`                              | 지침 삭제                                                                                                | 필수                                 |
| `GET`    | `/api/history`                                     | 생성 이력 목록                                                                                           | 필수                                 |
| `GET`    | `/api/history/:id`                                 | 이력 상세 조회                                                                                           | 필수                                 |
| `PUT`    | `/api/history/:id`                                 | 에디터 편집본 수동 저장                                                                                  | 필수                                 |
| `GET`    | `/api/contents/:id/versions`                       | **(Phase 2)** 버전 목록 조회                                                                             | 필수                                 |
| `POST`   | `/api/contents/:id/versions`                       | **(Phase 2)** 현재 본문 → 새 버전 스냅샷                                                                 | 필수                                 |
| `GET`    | `/api/contents/:id/versions/:no`                   | **(Phase 2)** 특정 버전 단건 조회                                                                        | 필수                                 |
| `POST`   | `/api/contents/:id/versions/:no/restore`           | **(Phase 2)** 해당 버전으로 본문 복원                                                                    | 필수                                 |
| `GET`    | `/api/contents/:id/versions/diff`                  | **(Phase 2)** 두 버전 차이 (`?from=A&to=B`)                                                              | 필수                                 |
| `GET`    | `/api/contents/:id/translations`                   | **(Phase 2)** 번역 목록 (언어별 상태)                                                                    | 필수                                 |
| `POST`   | `/api/contents/:id/translations/stream`            | **(Phase 2)** 번역 스트리밍 생성 (target: `ko`/`en`)                                                     | 필수                                 |
| `GET`    | `/api/contents/:id/translations/:lang`             | **(Phase 2)** 특정 언어 번역 본문 조회                                                                   | 필수                                 |
| `DELETE` | `/api/contents/:id/translations/:lang`             | **(Phase 2)** 번역 삭제                                                                                  | 필수                                 |
| `GET`    | `/api/org`                                         | **(Phase 3)** 내가 속한 조직 목록                                                                        | 필수                                 |
| `POST`   | `/api/org`                                         | **(Phase 3)** 조직 생성                                                                                  | 필수                                 |
| `GET`    | `/api/org/:id`                                     | **(Phase 3)** 조직 단건 조회                                                                             | 필수 (member 이상)                   |
| `PATCH`  | `/api/org/:id`                                     | **(Phase 3)** 조직 설정 수정                                                                             | 필수 (`org:admin`)                   |
| `DELETE` | `/api/org/:id`                                     | **(Phase 3)** 조직 삭제                                                                                  | 필수 (`org:admin`)                   |
| `GET`    | `/api/org/:id/members`                             | **(Phase 3)** 멤버 목록                                                                                  | 필수 (member 이상)                   |
| `POST`   | `/api/org/:id/members/invitations`                 | **(Phase 3)** 초대 발송                                                                                  | 필수 (`org:admin`)                   |
| `PATCH`  | `/api/org/:id/members/:userId`                     | **(Phase 3)** 멤버 역할 변경                                                                             | 필수 (`org:admin`)                   |
| `DELETE` | `/api/org/:id/members/:userId`                     | **(Phase 3)** 멤버 제거                                                                                  | 필수 (`org:admin`)                   |
| `GET`    | `/api/billing/plans`                               | **(Phase 3)** 플랜 카탈로그 (공개 정보)                                                                  | 필수                                 |
| `GET`    | `/api/billing/subscription`                        | **(Phase 3)** 현재 구독 상태                                                                             | 필수 (member 이상)                   |
| `GET`    | `/api/billing/usage`                               | **(Phase 3)** 이번 달 사용량                                                                             | 필수 (member 이상)                   |
| `POST`   | `/api/billing/orders`                              | **(Phase 3)** 주문 생성 (`ORDER` 상태, expiresAt +30분)                                                  | 필수 (`org:admin`)                   |
| `DELETE` | `/api/billing/orders/:orderId`                     | **(Phase 3)** `ORDER` 상태 주문 삭제                                                                     | 필수 (`org:admin`)                   |
| `PATCH`  | `/api/billing/orders/:orderId/status`              | **(Phase 3)** `AUTH_*` 4종 상태 전환 (클라이언트 가드)                                                   | 필수 (`org:admin`)                   |
| `POST`   | `/api/billing/orders/:orderId/confirm`             | **(Phase 3)** 결제 승인 (DB amount 사용)                                                                 | 필수 (`org:admin`)                   |
| `POST`   | `/api/billing/orders/:orderId/sync`                | **(Phase 3)** Toss 상태 폴백 동기화                                                                      | 필수 (`org:admin`)                   |
| `POST`   | `/api/billing/subscription/cancel`                 | **(Phase 3, v1.4 재작성)** 구독 해지 예약 — `cancel_scheduled_at` 설정 (UC-31, BR-38)                    | 필수 (`org:admin`)                   |
| `DELETE` | `/api/billing/subscription/cancel`                 | **(Phase 3, v1.4 신규)** 해지 예약 취소 — `cancel_scheduled_at = NULL` (UC-38)                           | 필수 (`org:admin`)                   |
| `POST`   | `/api/billing/subscription/change`                 | **(Phase 3)** 플랜 업/다운그레이드 (Pro 만 — Team 제거)                                                  | 필수 (`org:admin`)                   |
| `GET`    | `/api/billing/payments`                            | **(Phase 3)** 결제 이력 (페이지네이션)                                                                   | 필수 (`org:admin`)                   |
| `GET`    | `/api/billing/payments/:paymentKey`                | **(Phase 3)** 결제 단건 + 영수증                                                                         | 필수 (`org:admin`)                   |
| `POST`   | `/api/billing/payments/:paymentKey/cancel-request` | **(Phase 3)** 사용자 환불 요청 (PENDING)                                                                 | 필수 (`org:admin`)                   |
| `PATCH`  | `/api/billing/cancel-requests/:id`                 | **(Phase 3)** 환불 승인/거절 (시스템 admin)                                                              | 필수 (system admin, 향후)            |
| `POST`   | `/api/webhooks/toss`                               | **(Phase 3)** Toss Webhook — eventId 멱등성·항상 200 응답                                                | 없음 (HMAC 서명 검증)                |
| `GET`    | `/api/agents`                                      | **(Phase 3)** Agent 목록                                                                                 | 필수 (member 이상)                   |
| `POST`   | `/api/agents`                                      | **(Phase 3)** Agent 생성                                                                                 | 필수 (`org:admin`)                   |
| `GET`    | `/api/agents/:id`                                  | **(Phase 3)** Agent 단건 조회                                                                            | 필수 (member 이상)                   |
| `PATCH`  | `/api/agents/:id`                                  | **(Phase 3)** Agent 수정                                                                                 | 필수 (`org:admin`)                   |
| `DELETE` | `/api/agents/:id`                                  | **(Phase 3)** Agent 삭제                                                                                 | 필수 (`org:admin`)                   |
| `POST`   | `/api/agents/:id/run`                              | **(Phase 3)** 즉시 실행                                                                                  | 필수 (member 이상)                   |
| `GET`    | `/api/agents/:id/runs`                             | **(Phase 3)** 실행 이력                                                                                  | 필수 (member 이상)                   |
| `GET`    | `/api/agents/:id/runs/:runId`                      | **(Phase 3)** 실행 단건 상세 (tool_calls 포함)                                                           | 필수 (member 이상)                   |
| `GET`    | `/api/agents/:id/runs/:runId/tool-calls`           | **(Phase 3)** Function Calling 트레이스 (스트리밍 가능)                                                  | 필수 (member 이상)                   |
| `GET`    | `/api/agents/tools`                                | **(Phase 3)** 사용 가능한 도구 레지스트리                                                                | 필수 (member 이상)                   |
| `POST`   | `/api/cron/agents/tick`                            | **(Phase 3, v1.4)** Agent 디스패처 (개발 10분 / 운영 5분)                                                | 없음 (**QStash Receiver 서명 검증**) |
| `POST`   | `/api/cron/billing/tick`                           | **(Phase 3, v1.4)** 정기결제 자동 청구 (매일 02:00 KST, BR-구독결제.md)                                  | 없음 (QStash)                        |
| `POST`   | `/api/cron/billing/expire-orders`                  | **(Phase 3, v1.4)** 만료 주문 `PAY_EXPIRED` (개발 15분 / 운영 5분)                                       | 없음 (QStash)                        |
| `POST`   | `/api/cron/billing/finalize-canceled`              | **(Phase 3, v1.4 신규)** 해지 예약 만료 처리 — `status='canceled'` + 빌링키 파기(BR-39) (매일 04:00 KST) | 없음 (QStash)                        |
| `POST`   | `/api/cron/quota/reset`                            | **(Phase 3)** 월간 quota 리셋 (매월 1일 KST)                                                             | 없음 (QStash)                        |
| `POST`   | `/api/cron/org/purge`                              | **(Phase 3)** 30일 grace 경과 조직 hard delete (매일 03:00 KST)                                          | 없음 (QStash)                        |
| `GET`    | `/api/system/crons`                                | **(Phase 3, v1.4)** 등록된 Schedule + 최근 cron_runs 요약 (UC-39)                                        | 필수 (`SystemAdmin`)                 |
| `GET`    | `/api/system/crons/:code/runs`                     | **(Phase 3, v1.4)** cron_runs 페이지네이션 조회                                                          | 필수 (`SystemAdmin`)                 |
| `GET`    | `/api/system/crons/:code/qstash`                   | **(Phase 3, v1.4)** QStash REST로 Schedule 메타 조회 (읽기)                                              | 필수 (`SystemAdmin`)                 |
| `POST`   | `/api/webhooks/clerk`                              | Clerk Webhook (`user.created` / **(Phase 3)** `organization.*` / `organizationMembership.*`)             | 없음 (svix 서명 검증)                |

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
  source_lang: 'ko' | 'en'          // Phase 2: 원문 언어 (기본 'ko')
  created_at: string
  updated_at: string
}
```

**Phase 2 — 콘텐츠 이력 관리 스키마**

```typescript
// === GET /api/contents/:id/versions ===
// 쿼리: ?limit=N (기본 30, 최대 100), ?cursor=<last_version_no>
// 정렬: version_no DESC (최신 버전 우선)
Response: {
  data: Array<{
    version_no: number
    created_at: string
    is_current: boolean          // 현재 contents.body와 동일한 스냅샷 여부
    char_count: number           // 해당 버전 본문 글자 수
    char_diff: number | null     // 직전 버전 대비 ± 글자 수 (가장 오래된 버전은 null)
  }>
  next_cursor: number | null     // 다음 페이지 시작 version_no
}

// === POST /api/contents/:id/versions ===
// 요청 본문 없음 — 서버가 현재 contents.body를 그대로 스냅샷
// 동일 본문이 직전 버전과 일치하면 409 conflict 반환 (중복 스냅샷 방지)
Response: { version_no: number; created_at: string }

// === GET /api/contents/:id/versions/:no ===
Response: {
  version_no: number
  snapshot_body: string
  snapshot_seo_meta: { title: string; description: string; slug: string; keywords: string[] }
  created_at: string
}

// === POST /api/contents/:id/versions/:no/restore ===
// 동작:
//   1) 복원 직전 contents.body를 새 버전으로 자동 스냅샷 (안전장치)
//   2) :no 버전의 snapshot_body·snapshot_seo_meta를 contents에 덮어쓰기
//   3) contents.updated_at 갱신
Response: {
  restored_from_version_no: number   // 복원 소스 버전
  new_current_version_no: number     // 복원 직전 본문이 저장된 새 버전
  updated_at: string
}

// === GET /api/contents/:id/versions/diff?from=A&to=B ===
// 서버는 두 버전 본문을 그대로 반환 — diff 계산은 클라이언트 측 라이브러리에 위임 (§3-1 참조)
Response: {
  from: { version_no: number; body: string; seo_meta: object; created_at: string }
  to:   { version_no: number; body: string; seo_meta: object; created_at: string }
}
```

**Phase 2 — 다국어 번역 스키마**

```typescript
// === POST /api/contents/:id/translations/stream ===
// 원문 언어(contents.source_lang)와 다른 target_lang만 허용
// 동일 target_lang에 status='completed' 행이 이미 있으면:
//   - force=false (기본): 409 conflict + 기존 데이터 안내
//   - force=true: 기존 행 status='streaming'으로 UPDATE 후 재번역
Request: {
  target_lang: 'ko' | 'en'
  force?: boolean             // 재번역 여부 (기본 false)
}
// 스트리밍 청크: 번역된 마크다운 텍스트 순차 전달
// 마지막 청크: [DONE]{"translationId":"<id>","seo_meta":{...}}
Response: ReadableStream

// === GET /api/contents/:id/translations ===
Response: {
  source_lang: 'ko' | 'en'    // 원문 언어
  data: Array<{
    target_lang: 'ko' | 'en'
    status: 'pending' | 'streaming' | 'completed' | 'failed'
    error_message: string | null
    updated_at: string
  }>
}

// === GET /api/contents/:id/translations/:lang ===
Response: {
  target_lang: 'ko' | 'en'
  translated_body: string
  translated_seo_meta: { title: string; description: string; slug: string; keywords: string[] }
  status: 'pending' | 'streaming' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  updated_at: string
}

// === DELETE /api/contents/:id/translations/:lang ===
// 해당 언어 번역 행 하드 삭제 — 다시 번역하려면 POST stream 호출
Response: { deleted: true; target_lang: 'ko' | 'en' }
```

**Phase 2 — Gemini 번역 프롬프트 가이드 (서버 전용)**

- 시스템 프롬프트: "다음 마크다운 블로그 글을 {target_lang}로 번역하라. **마크다운 문법 구조(헤딩 계층·코드블록·링크·이미지 alt)를 100% 보존**하고, SEO 메타(title/description/slug/keywords)도 자연스러운 {target_lang} 표현으로 재생성하라. 코드블록 안의 식별자·예약어는 번역하지 않는다."
- 입력: `contents.body` + `contents.seo_meta` + `source_lang` + `target_lang`
- 마지막 청크에 SEO 메타를 JSON으로 부착 (생성 API와 동일 패턴)

**Phase 3 — 조직(팀) 관리 스키마**

```typescript
// === GET /api/org ===
// 내가 속한 모든 조직 (Clerk OrganizationMembership 기반)
Response: {
  data: Array<{
    id: string
    clerk_org_id: string
    name: string
    slug: string
    plan: 'free' | 'pro'            // v1.4: Team 제거
    role: 'admin' | 'member'        // 현재 사용자의 역할
    member_count: number
    is_default: boolean              // users.default_organization_id 일치 여부
  }>
}

// === POST /api/org ===
Request: {
  name: string                       // 최대 80자
  slug?: string                      // 미지정 시 name 기반 자동 생성 (kebab-case)
}
// 동작: Clerk Organization 생성 → DB 동기화 → 생성자를 admin으로 자동 등록
Response: { id: string; clerk_org_id: string; slug: string }

// === POST /api/org/:id/members/invitations ===
// 동작: Clerk Invitations API 호출 → 초대 이메일 자동 발송
// 멤버 한도 초과 시 (BR-30) 409 conflict + 현재 플랜·한도 안내
Request: {
  email: string
  role: 'admin' | 'member'           // 기본 'member'
}
Response: {
  invitation_id: string              // Clerk invitation_id
  status: 'pending'
  expires_at: string                 // Clerk 기본 30일
}

// === PATCH /api/org/:id/members/:userId ===
// 마지막 admin을 member로 강등 시 400 + error_code: 'LAST_ADMIN'
Request: { role: 'admin' | 'member' }
Response: { user_id: string; role: 'admin' | 'member' }
```

**Phase 3 — 구독 결제 스키마 (Toss 11상태 + 빌링키 정기결제)**

> 결제 흐름 전체는 [`docs/quickstart/toss-quickstart.md`](quickstart/toss-quickstart.md)의 11상태·상태 가드·`tossRequest()` 래퍼·DB amount 사용 원칙을 100% 준수한다.  
> 빌링키 발급은 신규 구독 결제 성공(`PAY_SUCCESS`) 직후 Toss 빌링키 발급 API 호출로 함께 처리하며, 결과는 `subscriptions.billing_key_encrypted`에 AES-256-GCM 암호화 저장한다.

```typescript
// === GET /api/billing/plans === (v1.4: Free/Pro 2종, BR-구독결제.md SSOT)
// 코드 상수 (DB 비저장). Team은 Phase 4로 이연
Response: {
  data: Array<{
    plan: 'free' | 'pro'
    name: string                     // 표시명
    monthly_price: number            // KRW (Free: 0, Pro: 29900)
    limits: {
      max_members: number            // free: 1, pro: 3
      monthly_generations: number    // free: 10, pro: 200
      monthly_translations: number   // free: 5, pro: 100
      monthly_agent_runs: number     // free: 0, pro: 30
      max_agents: number             // free: 0, pro: 3
    }
    features: string[]
  }>
}

// === GET /api/billing/subscription === (v1.4: Team 제거, 해지 예약 필드 추가)
Response: {
  organization_id: string
  plan: 'free' | 'pro'
  status: 'free' | 'active' | 'past_due' | 'canceled'
  next_billing_at: string | null     // free·canceled·해지 예약 상태는 null
  current_period_end: string | null
  past_due_since: string | null      // past_due 진입 시점 (3일 grace 표시용)
  cancel_scheduled_at: string | null // BR-38 해지 예약 시점 — UI에 amber 배너 노출
  amount: number | null              // KRW
  has_billing_key: boolean           // 빌링키 보유 여부 (재결제 시 결제창 재호출 불필요)
}

// === POST /api/billing/orders ===
// toss-quickstart §결제 UI 플로우 1단계: 주문 행 생성
// 동작:
//   1) users.payment_customer_key 없으면 UUID 발급·저장 (getOrCreatePaymentCustomerKey)
//   2) UUID 기반 orderId 생성 (VARCHAR(64), 영문/숫자/-_= 조합)
//   3) orders INSERT (status='ORDER', expires_at = now() + 30분, kind 결정)
//   4) order_items + order_status_history INSERT (단일 트랜잭션)
Request: {
  plan: 'pro'                          // v1.4: Team 제거 (Phase 4 확장 시 'pro' | 'team')
  kind?: 'new_subscription' | 'plan_change'  // 기본 new_subscription (recurring은 cron만 호출 가능)
}
Response: {
  order_id: string                   // VARCHAR(64), Toss orderId
  customer_key: string               // users.payment_customer_key (UUID)
  amount: number                     // 서버 계산 — 클라이언트는 표시용으로만 사용
  order_name: string                 // 'IndiePost AI Pro 월 구독' 등
  success_url: string                // /billing/checkout/result (단일 URL — toss-quickstart §결제 결과 페이지)
  fail_url: string                   // /billing/checkout/result (성공/실패 단일 URL + 쿼리 분기)
  expires_at: string                 // ISO 8601, +30분
}

// === DELETE /api/billing/orders/:orderId ===
// status='ORDER'인 주문만 삭제 가능 (고아 주문 정리)
// 다른 상태 삭제 시도 → 400 + 'INVALID_ORDER_STATUS'
Response: { deleted: true }

// === PATCH /api/billing/orders/:orderId/status ===
// 클라이언트가 전환 가능한 4개 상태(AUTH_READY/AUTH_SUCCESS/AUTH_CANCEL/AUTH_FAIL)만 허용
// toss-quickstart §상태 가드 화이트리스트 — CLIENT_TRANSITION_STATUSES
Request: {
  status: 'AUTH_READY' | 'AUTH_SUCCESS' | 'AUTH_CANCEL' | 'AUTH_FAIL'
  reason?: string                    // AUTH_FAIL 시 에러 메시지 (감사용)
}
Response: { status: string; changed_at: string }

// === POST /api/billing/orders/:orderId/confirm ===
// 전제: status='AUTH_SUCCESS' (toss-quickstart CONFIRMABLE_STATUSES 가드)
// 동작:
//   1) order 조회 + 상태 가드 (AUTH_SUCCESS 아니면 400 INVALID_ORDER_STATUS)
//   2) tossRequest('POST', '/payments/confirm', { paymentKey, orderId, amount: order.total_amount })
//      — amount는 DB 값 사용 (클라이언트 금액 절대 신뢰 금지)
//      — payment_logs에 CONFIRM_REQ/CONFIRM_RES/CONFIRM_ERR 3종 자동 기록
//   3) payments UPSERT(paymentKey, raw_data)
//   4) 응답 status별 분기:
//      - DONE → orders.status='PAY_SUCCESS' → 빌링키 발급(`new_subscription` 시) → subscriptions UPSERT
//      - WAITING_FOR_DEPOSIT → orders.status='PAY_WAITING' (가상계좌)
//      - 그 외 → orders.status='PAY_FAIL'
//   5) PAY_SUCCESS 시 후처리: usage_quotas 리셋 시점 갱신, 사용자 알림 등
Request: { paymentKey: string }
Response: {
  status: 'PAY_SUCCESS' | 'PAY_WAITING' | 'PAY_FAIL'
  subscription?: { plan: 'pro', next_billing_at: string }
  receipt_url?: string               // payments.raw_data.receipt.url
  error_code?: string                // PAY_FAIL 시 (payment_error_codes 매핑)
  display_message?: string           // 한글 사용자 메시지
}

// === POST /api/billing/orders/:orderId/sync ===
// 사용자가 결제 인증 후 새로고침·뒤로가기 시 confirm 누락 보정
// toss-quickstart §상태 동기화 구현 패턴 — syncTossPaymentStatus
// status='ORDER'면 Toss API 호출 스킵 (Toss 미등록)
// 404 + expires_at 초과 + AUTO_SYNC_STATUSES(AUTH_SUCCESS) → PAY_EXPIRED
Response: { status: string; synced_at: string }

// === POST /api/billing/subscription/cancel === (v1.4 재작성, UC-31 · BR-38)
// 즉시 해지 X — 해지 예약 패턴
// subscriptions.cancel_scheduled_at = now() 설정, status='active' 유지
// next_billing_at = NULL로 변경 (정기결제 cron이 재청구하지 않도록)
// 실제 status='canceled' 전환은 current_period_end 도래 시
//   /api/cron/billing/finalize-canceled가 처리:
//     - subscriptions.status='canceled' + canceled_at = now()
//     - organizations.plan='free' 강등 (BR-32 free 한도 적용)
//     - Toss DELETE /v1/billing/authorizations/{billingKey} 호출 (BR-39 빌링키 파기)
//     - subscriptions.billing_key_encrypted = NULL
//     - payment_logs에 BILLING_KEY_DELETE_REQ/RES/ERR 기록
Response: {
  status: 'active'                     // 여전히 활성 — cancel_scheduled_at만 채워짐
  cancel_scheduled_at: string
  current_period_end: string           // 이 시점에 cron이 canceled 전환 + 빌링키 파기
  can_undo: true                       // UC-38 해지 예약 취소 가능
}

// === DELETE /api/billing/subscription/cancel === (v1.4 신규 · v1.4.1 경합 방어, UC-38 · BR-38)
// 해지 예약 취소 — 결제 예정일 전이면 언제든 가능
// 동작 (단일 트랜잭션):
//   ① SELECT ... FOR UPDATE로 subscriptions 행 락 (billing/tick·finalize-canceled cron과 직렬화)
//   ② 락 획득 후 상태 재검증:
//      - status='active' && cancel_scheduled_at IS NOT NULL && current_period_end > now()
//      - 미충족 시 409 + error_code 분기:
//        · status != 'active' → 'SUBSCRIPTION_NOT_ACTIVE'
//        · cancel_scheduled_at IS NULL → 'NO_CANCEL_SCHEDULED'
//        · current_period_end <= now() → 'CANCEL_ALREADY_FINALIZED' (cron이 이미 처리)
//   ③ next_billing_at 보정: MAX(current_period_end + 1일, now() + 1시간)
//      → 현재 시각 +1시간 미만이 절대 되지 않도록 보장 (즉시 cron 재실행 방지)
//   ④ cancel_scheduled_at = NULL + next_billing_at = 계산값 UPDATE → COMMIT
Response: {
  status: 'active'
  cancel_scheduled_at: null
  next_billing_at: string                  // 보정된 미래 시각
}

// === POST /api/billing/subscription/change === (v1.4: Pro만 — Team 제거)
// 플랜 업/다운그레이드 — 현재 Pro 단일 플랜이므로 Phase 4 Team 출시 전까진 호출 사례 없음
// 인터페이스만 유지하여 향후 확장 대비
Request: { to_plan: 'pro', mode: 'upgrade' | 'downgrade' }
Response: {
  mode: 'upgrade' | 'downgrade'
  order_id?: string                  // upgrade 시 차액 결제용 order
  amount?: number                    // upgrade 시 prorated 금액
  effective_at: string               // 변경 적용 시점
}

// === GET /api/billing/payments ===
// 쿼리: ?limit=N (기본 20, 최대 100), ?cursor=<last_order_id>
Response: {
  data: Array<{
    order_id: string
    payment_key: string | null
    kind: 'new_subscription' | 'recurring' | 'plan_change'
    method: string | null
    status: string                   // 11개 내부 상태
    amount: number
    balance_amount: number           // 환불 후 잔액
    approved_at: string | null
    receipt_url: string | null
  }>
  next_cursor: string | null
}

// === GET /api/billing/payments/:paymentKey ===
Response: {
  payment_key: string
  order: { id: string, kind: string, status: string, total_amount: number }
  method: string | null
  status: string
  amount: number
  balance_amount: number
  approved_at: string | null
  receipt_url: string | null
  cancels: Array<{ amount: number, transaction_key: string, canceled_at: string }>  // 부분 취소 누적
}

// === POST /api/billing/payments/:paymentKey/cancel-request ===
// 환불 요청 (PENDING 생성 — 시스템 admin 승인 대기)
// 환불액 자동 계산 (toss-quickstart §환불 금액 계산):
//   refund = unitPrice × (quantity - usedQuantity - cancelledQuantity) × 0.9
//   Math.floor 적용 (KRW 정수 단위)
// 구독은 usedQuantity=0 고정이므로 단순 잔여 일자 비례 환불
Request: { reason: string, item_quantities?: Array<{ order_item_id: string, cancel_quantity: number }> }
Response: {
  cancel_request_id: string
  refund_amount: number
  status: 'PENDING'
}

// === GET /api/billing/usage ===
Response: {
  period_month: string               // 'YYYY-MM' (KST)
  plan: 'free' | 'pro'               // v1.4: Team 제거
  usage: {
    generations: { used: number; limit: number }
    translations: { used: number; limit: number }
    agent_runs: { used: number; limit: number }
  }
  reset_at: string                   // 다음 달 1일 00:00 KST
}

// === POST /api/webhooks/toss ===
// 헤더: TossPayments-Signature (HMAC-SHA256, TOSS_WEBHOOK_SECRET 검증)
// 멱등성: webhook_events.event_id UNIQUE — 중복 수신 시 즉시 200 OK
// 항상 200 응답 (toss-quickstart §Webhook 핸들러 — 5xx 시 Toss 지수 백오프 재시도로 중복 처리 위험)
// 이벤트별 처리: syncTossPaymentStatus(data.orderId)로 코드 통일 — 가상계좌 입금도 동일 경로
Request: {
  eventId: string
  eventType: 'PAYMENT_STATUS_CHANGED' | 'VIRTUAL_ACCOUNT_DEPOSIT_CALLBACK'
  createdAt: string
  data: { paymentKey: string, orderId: string, status: string }
}
Response: { ok: true }

// === POST /api/cron/billing/tick === (v1.4 재작성 — 이름·시각·해지 예약 분기 변경)
// 매일 02:00 KST (BR-구독결제.md), QStash Schedule cron: '0 17 * * *' (UTC, KST 02:00)
// 호출자: Upstash QStash (Receiver 서명 검증 + webhook_events 멱등성)
// 동작:
//   1) cron_runs INSERT (status='running', cron_code='billing_tick', qstash_message_id)
//   2) subscriptions WHERE status='active' AND next_billing_at IS NOT NULL AND next_billing_at <= now()
//      SELECT FOR UPDATE SKIP LOCKED
//      (cancel_scheduled_at IS NOT NULL인 구독은 next_billing_at=NULL이므로 자동 제외)
//   3) 각 구독에 대해:
//      a) 신규 orders INSERT (kind='recurring', status='AUTH_SUCCESS' 직행)
//      b) tossRequest('POST', `/billing/${billing_key_복호화}`, { customerKey, amount, orderId, orderName })
//         — payment_logs에 RECURRING_CHARGE_REQ/RES/ERR 자동 기록
//      c) 성공 → orders.status='PAY_SUCCESS' + payments UPSERT
//                + subscriptions.next_billing_at += 1개월 + current_period_end += 1개월
//      d) 일시적 5xx 실패 → QStash가 메시지 전체를 자동 재시도 (현 cron_run은 5xx 응답 후 종료)
//      e) 영구 실패(REJECT_CARD/EXPIRED 등) → orders.status='PAY_FAIL'
//         + subscriptions.status='past_due' + past_due_since=now() (BR-36)
//   4) past_due 3일 경과 구독 → status='canceled' 전환 위임 → finalize-canceled cron이 처리
//   5) cron_runs UPDATE (status='completed'·result_summary={ processed, succeeded, failed })
Response: { processed: number, succeeded: number, failed: number, past_due_new: number }

// === POST /api/cron/billing/finalize-canceled === (v1.4 신규, BR-38 + BR-39)
// 매일 04:00 KST, QStash Schedule: '0 19 * * *' (UTC, KST 04:00)
// 동작:
//   1) cron_runs INSERT
//   2) 대상 SELECT: 두 케이스 OR
//      A) status='active' && cancel_scheduled_at IS NOT NULL && current_period_end <= now()  (해지 예약 만료)
//      B) status='past_due' && past_due_since + 3일 <= now()                                 (BR-36 grace 경과)
//   3) 각 구독에 대해 단일 트랜잭션:
//      a) subscriptions.status='canceled' + canceled_at=now()
//      b) organizations.plan='free' UPDATE (BR-32 한도 즉시 적용)
//      c) tossRequest('DELETE', `/billing/authorizations/${billing_key_복호화}`)
//         — payment_logs에 BILLING_KEY_DELETE_REQ/RES/ERR 자동 기록 (BR-39)
//      d) subscriptions.billing_key_encrypted = NULL
//      e) 사용자에게 이메일 안내 ("구독이 종료되었습니다 · 무료 플랜으로 전환")
//   4) cron_runs UPDATE
Response: { canceled_total: number, from_schedule: number, from_past_due: number }
```

**Phase 3 — AI Agent 자동화 스키마 (Gemini Function Calling 기반)**

> SRS §2 의 "Tool Calling 능력을 갖춘 시스템" 요구사항을 충족하기 위해, Agent 본체 로직은 Gemini Function Calling 루프로 구현한다.  
> LLM은 작업 컨텍스트(목표·시드 키워드·최근 주제·지침 ID 등)를 받고, `agent_tools`에 등록된 도구를 자율적으로 호출한다.  
> 모든 호출은 `agent_tool_calls`에 기록되어 실행 단건 상세 페이지에서 트레이스로 노출된다.

```typescript
// === POST /api/agents ===
// BR-33: cron_expression 검증 — 최소 간격 1시간 (분 단위 와일드카드 '*' 금지)
Request: {
  name: string                       // 최대 80자
  topic_source: {
    type: 'manual_pool' | 'keyword_expansion'
    seed_keywords?: string[]         // keyword_expansion 필수, 최대 10개
    initial_topics?: string[]        // manual_pool 필수, 최소 1개·최대 100개
  }
  guideline_id?: string              // 조직 공용 지침 ID (BR-34, 미지정 시 조직 기본 지침)
  target_lang: 'ko' | 'en'
  cron_expression: string            // 예: '0 9 * * 1' 매주 월요일 09:00
  publish_target?: {                 // Phase 3.5 placeholder — Phase 3에서는 무시되거나 dry-run만
    platform: 'hashnode' | 'medium'
    publication_id?: string
    draft_only: true                 // Phase 3.5 출시 전까진 항상 true 강제
  }
  is_active?: boolean                // 기본 true
}
Response: {
  id: string
  next_run_at: string
}

// === GET /api/agents ===
Response: {
  data: Array<{
    id: string
    name: string
    cron_expression: string
    cron_human: string               // cronstrue 한글 해석
    target_lang: 'ko' | 'en'
    is_active: boolean
    last_run_at: string | null
    last_run_status: 'completed' | 'failed' | null
    next_run_at: string | null
    runs_this_month: number
    has_publish_target: boolean      // publish_target 설정 여부 (Phase 3.5 UI 분기용)
  }>
}

// === POST /api/agents/:id/run ===
// 수동 트리거 — quota 검증 후 즉시 큐 등록
// 동일 agent에 status='running' 또는 'pending' run 존재 시 409 conflict
Response: {
  run_id: string
  status: 'pending'
  started_at: string
}

// === GET /api/agents/:id/runs ===
// 쿼리: ?limit=N (기본 20, 최대 100), ?cursor=<last_run_id>
Response: {
  data: Array<{
    id: string
    triggered_by: 'schedule' | 'manual'
    status: 'pending' | 'running' | 'completed' | 'failed'
    selected_topic: string | null
    generated_content_id: string | null
    tool_calls_count: number         // 이 run에서 발생한 도구 호출 수 (UI 뱃지)
    error_code: string | null
    started_at: string
    finished_at: string | null
    duration_ms: number | null
  }>
  next_cursor: string | null
}

// === GET /api/agents/:id/runs/:runId ===
Response: {
  id: string
  triggered_by: 'schedule' | 'manual'
  status: 'pending' | 'running' | 'completed' | 'failed'
  selected_topic: string | null
  generated_content_id: string | null
  error_code: string | null
  error_message: string | null
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  tool_calls: Array<{                // sequence_no ASC, 최대 20건 인라인 (초과 시 별도 엔드포인트 안내)
    sequence_no: number
    tool_code: string                // 'topic_picker' | 'content_writer' | 'platform_publisher'
    arguments: object                // JSONB (UI에서 코드블록 토글)
    result: object | null
    status: 'pending' | 'success' | 'failed'
    error_message: string | null
    duration_ms: number | null
    started_at: string
    finished_at: string | null
  }>
}

// === GET /api/agents/:id/runs/:runId/tool-calls ===
// 실행 중인 run을 SSE 스트리밍으로 구독 (status='running'일 때만 stream, 아니면 정적 JSON)
// 각 도구 호출이 끝날 때마다 한 청크 전송: { sequence_no, tool_code, status, ... }
// 종료 청크: [DONE]
Response: ReadableStream | { tool_calls: Array<...> }

// === GET /api/agents/tools ===
// 도구 레지스트리 — Agent 생성 폼·실행 상세에서 도구 메타 조회용
Response: {
  data: Array<{
    code: 'topic_picker' | 'content_writer' | 'platform_publisher'
    display_name: string
    description: string
    function_schema: object          // Gemini functionDeclaration 그대로
    requires_phase: '3' | '3.5'
    is_enabled: boolean
  }>
}

// === POST /api/cron/agents/tick === (v1.4.1 갱신)
// QStash Schedule */15 * * * * (모든 환경 통일) — 환경변수 QSTASH_AGENTS_TICK_CRON
// 헤더: Upstash-Signature: <JWT> (Receiver 검증) + Upstash-Message-Id (멱등성)
// 첫 단계: webhook_events UPSERT (event_id=Upstash-Message-Id, provider='qstash') — UNIQUE 충돌 시 즉시 200
//          cron_runs INSERT (cron_code='agents_tick', qstash_message_id, status='running')
// 동작:
//   1) agent_jobs WHERE is_active=true AND next_run_at <= now() SELECT FOR UPDATE SKIP LOCKED LIMIT AGENT_MAX_CONCURRENT_RUNS
//   2) 각 job에 대해:
//      a) usage_quotas 한도 검증 (한도 초과 시 agent_runs INSERT status='failed' error_code='QUOTA_EXCEEDED')
//      b) agent_runs INSERT (status='pending')
//      c) Function Calling 루프 시작 (별도 비동기 함수):
//         - Gemini에게 시스템 프롬프트 + 도구 목록 전달
//         - LLM이 functionCall 응답 시 → 매핑된 도구 실행
//           → 결과 분기 (v1.4.1 이원화):
//             · functionResponse: 원본 result → LLM에 전달 (ID·메타 보존)
//             · agent_tool_calls.result INSERT: 마스킹 필터 통과본 (UI 노출용 — 이메일·토큰 부분 가림)
//         - LLM이 final text 응답 시 → 루프 종료
//         - 최대 도구 호출 10회 제한 (무한 루프 방지)
//      d) 성공 → run.status='completed' + agent_jobs.last_run_at·next_run_at 갱신
//      e) 실패 → run.status='failed' + error_code 기록 (재시도 없음, 다음 스케줄에서 자연 재시도)
//   3) 처리 결과 반환
Response: {
  processed: number
  scheduled_runs: string[]
}
```

**Phase 3 — Agent Function Calling 시스템 프롬프트 (개요)**

LLM에게는 다음과 같은 컨텍스트를 시스템 프롬프트로 전달한다:

```
당신은 IndiePost AI의 자율 블로그 작성 에이전트입니다.
목표: 한 편의 블로그 글을 발굴 → 작성 → (선택적으로) 외부 플랫폼에 임시 발행합니다.

주어진 도구를 자율적으로 선택·호출하세요:
- topic_picker: 시드 키워드로 새 주제를 발굴 (manual_pool 타입이면 호출 불필요 — 사전 선택됨)
- content_writer: 주제와 지침으로 블로그 본문 작성 (필수)
- platform_publisher: 외부 플랫폼에 Draft 전송 (publish_target이 지정된 경우만)

제약:
- 도구 호출은 최대 10회
- content_writer 호출은 정확히 1회만 (중복 호출 금지)
- 모든 호출 결과를 검토한 후 다음 도구를 선택할 것
- 최종 응답은 "완료" 한 단어로 종료할 것 (별도 텍스트 생성 금지)
```

**Phase 3 — Gemini 주제 발굴 프롬프트 (`topic_picker` 도구 내부)**

- "다음 시드 키워드 `{seed_keywords}`를 기반으로, 인디해커 블로그에 적합한 새 글감 주제 1개를 한 문장으로 제안하라. 이미 사용된 주제 목록 `{recent_topics}`와 중복되지 않아야 하며, 검색 의도가 명확한 long-tail 형태로 작성하라."
- 입력: `agent_jobs.topic_source.seed_keywords` + 최근 30개 `agent_runs.selected_topic`
- 출력: `{ topic: string, rationale: string }` JSON

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

**Phase 3 — Clerk Organizations 활성화 + RBAC**

- Clerk 대시보드에서 Organizations 기능 활성화 (사용자당 최대 100개 조직, 조직당 멤버 한도는 우리 측 BR-32 플랜 한도가 우선)
- **신규 user 가입 처리 (`user.created` Webhook, v1.4.1 레이스 컨디션 방어 강화)**:
  1. `users` UPSERT (`clerk_user_id`, `email`, `plan='free'`) — `clerk_user_id` UNIQUE 충돌 시 갱신
  2. `payment_customer_key` = UUID v4 발급·저장 (없을 때만, toss-quickstart §customerKey 영구 관리)
  3. **Personal Org 자동 생성 — 3중 방어** (BR-31, v1.4.1):
     ```
     BEGIN TRANSACTION
       SELECT pg_advisory_xact_lock(hashtext('personal_org:' || clerk_user_id))
         ↑ 동일 user에 대한 동시 트랜잭션을 직렬화 (Webhook · 미들웨어 보상 트랜잭션 모두 동일 락 키)

       SELECT id FROM organizations
         WHERE owner_user_id = :user_id AND is_personal = true AND deleted_at IS NULL
         LIMIT 1
       ↳ 이미 있으면 그 id로 users.default_organization_id 동기화 후 COMMIT

       (없으면) Clerk Organization API 호출
         Body: { name: "{email}'s Workspace", slug: "personal-{user_id_short}",
                 private_metadata: { idempotency_key: "personal-{clerk_user_id}" } }
         ↳ Clerk 측에도 동일 idempotency_key로 중복 호출 방지 (Clerk API 멱등성)

       INSERT INTO organizations (...) VALUES (..., is_personal=true, plan='free')
         ON CONFLICT (owner_user_id) WHERE is_personal=true DO NOTHING
         ↑ 부분 unique index (마이그레이션 0009)가 최종 DB 레벨 안전망
         RETURNING id

       INSERT INTO organization_members (role='admin', invited_by=NULL)
       UPDATE users SET default_organization_id = :personal_org_id
     COMMIT
     ```
  4. 어느 단계에서 실패해도 rollback. Clerk Org가 생성됐는데 DB INSERT 실패한 경우 → 다음 진입 시 보상 트랜잭션이 동일 `idempotency_key`로 Clerk에 재요청 → 기존 org 반환 → DB INSERT만 재시도
- 조직 라이프사이클 Webhook:
  - `organization.created` (사용자가 추가 조직 생성) → `organizations` INSERT (`is_personal=false`, plan='free')
  - `organization.updated` → `organizations` UPDATE (name·slug)
  - `organization.deleted` → **soft delete: `organizations.deleted_at = now()` 만 설정** (BR-31 30일 grace). 실제 row·CASCADE 삭제는 `/api/cron/org/purge`가 30일 후 수행. Personal Org는 절대 삭제 불가 (Webhook에서 400 응답)
  - `organizationMembership.created` / `.updated` / `.deleted` → `organization_members` 동기화
- 역할: Clerk 표준 `org:admin` / `org:member` (커스텀 역할 미정의)
- **미들웨어 계층 (4단계)**:
  1. `clerkMiddleware` — Clerk JWT 검증
  2. `withOrganization(orgId)` — `auth().orgId` 확인 + `auth().has({ role: 'org:member' })` + `organizations.deleted_at IS NULL` 검증 (grace 진입 조직은 읽기만 허용, 쓰기 차단)
  3. `withAdminRole(orgId)` — `auth().has({ role: 'org:admin' })` 검증
  4. `withOrgQuota(quotaType)` — `usage_quotas` 검증 (BR-32, 한도 초과 시 402 Payment Required + `error_code='QUOTA_EXCEEDED'`)
- 활성 조직(`auth().orgId`)이 없는 사용자는 `/dashboard` 진입 시 `users.default_organization_id`로 자동 설정 후 진행. `default_organization_id`도 NULL이면(`user.created` Webhook 실패·지연 등 예외) **위 §신규 user 가입 처리 3중 방어 블록을 그대로 재실행** (advisory_lock + 부분 unique index + Clerk idempotency_key). Webhook과 보상 트랜잭션이 동시 실행되어도 락이 직렬화하여 정확히 1건만 INSERT 됨

**Phase 3 — Cron 인증 (v1.4 Upstash QStash 전환)**

- `/api/cron/**` 엔드포인트는 Clerk 인증 우회. 대신 **QStash Receiver JWT 서명 검증** 적용 (`@upstash/qstash` 패키지)
- 라이브러리: `new Receiver({ currentSigningKey: QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: QSTASH_NEXT_SIGNING_KEY })` 싱글턴 → `receiver.verify({ signature: req.headers['upstash-signature'], body, url })`
- 두 키 운영 이유: QStash가 키 로테이션 시 현재 키·다음 키를 동시에 발급 → 어느 쪽으로 서명되어도 검증 통과 (무중단 로테이션)
- 검증 실패 시 401 + 응답 본문 최소화 (외부 트리거 방지)
- 멱등성: 모든 `/api/cron/**` 핸들러는 첫 단계에서 `webhook_events` UPSERT (`event_id = Upstash-Message-Id`, `provider='qstash'`). UNIQUE 충돌 시 즉시 200 OK + 처리 스킵 (BR-37)
- 재시도: QStash는 5xx 응답 시 기본 3회 자동 재시도(지수 백오프). 따라서 일시적 5xx 응답은 자체 복구되지만, 실패 누적은 `cron_runs.status='failed'`로 기록되어 SystemAdmin 모니터링 대상이 됨
- **메시지 발행(쓰기)**: 우리 서버에서 QStash로 즉시 메시지를 발행하는 경우(예: SystemAdmin 수동 트리거) `QSTASH_TOKEN`을 Bearer로 사용 (`@upstash/qstash` Client)
- **운영 가시화**: 모든 cron 실행이 `cron_runs`에 기록되며 `/system/crons` 페이지에서 SystemAdmin이 조회 (UC-39)

**Phase 3 — Toss/Clerk Webhook은 QStash와 무관**

- `/api/webhooks/toss`는 Toss가 직접 호출 (HMAC-SHA256 + `TOSS_WEBHOOK_SECRET`)
- `/api/webhooks/clerk`는 Clerk가 직접 호출 (svix 서명)
- 두 Webhook 모두 `webhook_events.provider`에 각각 `'toss'`·`'clerk'`로 저장. QStash 멱등성 처리(`'qstash'`)와는 별개 흐름

---

## 4. 인프라 요구사항

### 호스팅 및 배포

| 항목                         | 선택                               | 이유                                                                                                                                              |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 호스팅                       | Vercel (**Hobby 유지 가능**, v1.4) | Next.js 공식 플랫폼, Neon 공식 통합. QStash 도입으로 Vercel Cron 의존성 제거 → Hobby의 Cron 1개 제한 회피 (인디해커 무료 플랜 최적화)             |
| DB                           | Neon Serverless Postgres           | Vercel 통합, 컴퓨트 자동 중단으로 비용 최소화                                                                                                     |
| CDN                          | Vercel Edge Network                | Vercel 플랜 포함                                                                                                                                  |
| **스케줄러 (Phase 3, v1.4)** | **Upstash QStash**                 | 외부 메시지 큐 — Schedule(cron)로 우리 `/api/cron/**` 호출 + 자동 재시도(기본 3회) + JWT 서명 발급. 무료 500 메시지/일. Vercel Cron 1개 제한 회피 |
| 결제 (Phase 3)               | 토스페이먼츠 정기결제              | PCI-DSS 위임, 한국 카드사 호환성, 빌링키 기반 자동 결제                                                                                           |

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

# Phase 3 — 토스페이먼츠
# 클라이언트 SDK 초기화는 서버 라우트(/api/billing/orders 응답)로 전달 — 클라이언트 번들에 직접 노출 안 함
TOSS_CLIENT_KEY=                 # test_ck_* / live_ck_* — 서버에서 클라이언트로 전달
TOSS_SECRET_KEY=                 # test_sk_* / live_sk_* — 서버 전용 (Basic Auth용, base64 콜론 필수)
TOSS_WEBHOOK_SECRET=             # Webhook HMAC-SHA256 서명 검증
TOSS_BILLING_KEY_ENCRYPTION_KEY= # subscriptions.billing_key_encrypted AES-256-GCM 키 (32바이트 base64)
TOSS_PLATFORM_CRED_ENCRYPTION_KEY= # platform_credentials.access_token_encrypted AES-256-GCM 키 (Phase 3.5 placeholder)
TOSS_API_BASE_URL=https://api.tosspayments.com/v1  # tossRequest 래퍼 base URL (테스트 환경 분기용)

# Phase 3 — Upstash QStash (v1.4: Vercel Cron 대체 — 메시지 큐 기반 스케줄러)
# 무료 티어 500 메시지/일. 인디해커 무료 플랜 최적화
QSTASH_TOKEN=                    # 우리 서버 → QStash로 메시지 발행/Schedule CRUD 시 Bearer
QSTASH_CURRENT_SIGNING_KEY=      # QStash → 우리 서버 호출 시 JWT 서명 검증용 (현재 키)
QSTASH_NEXT_SIGNING_KEY=         # 동상, 키 로테이션 대비 (둘 중 하나로 검증 통과)
QSTASH_URL=https://qstash.upstash.io  # 기본값. enterprise 환경에서만 변경

# (v1.4.1) cron 표현식 — 모든 환경 통일 (무료 한도 안전 마진 확보)
# 일 합계: agents/tick 96 + expire-orders 96 + billing/tick 1 + finalize-canceled 1
#         + quota/reset ~0.03 + organizations/purge 1 = ~195/500 (한도 38%)
# 향후 출시 후 트래픽 폭증으로 응답성이 더 필요해지면 QStash 유료 전환과 함께 */5 재조정
QSTASH_AGENTS_TICK_CRON=*/15 * * * *           # 15분 — BR-33(Agent 최소 1시간)과 무관
QSTASH_EXPIRE_ORDERS_CRON=*/15 * * * *         # 15분 — 만료 처리 최대 15분 지연 수용
QSTASH_BILLING_TICK_CRON=0 17 * * *            # 매일 KST 02:00 (UTC 17:00) — BR-구독결제.md
QSTASH_FINALIZE_CANCELED_CRON=0 19 * * *       # 매일 KST 04:00 (UTC 19:00)
QSTASH_QUOTA_RESET_CRON=0 15 1 * *             # 매월 1일 KST 00:00 (UTC 15시)
QSTASH_ORG_PURGE_CRON=0 18 * * *               # 매일 KST 03:00 (UTC 18:00)

# Phase 3 — Agent
AGENT_MAX_CONCURRENT_RUNS=5      # cron tick당 동시 처리 Agent 수 (서버리스 함수 한도 고려)
AGENT_MAX_TOOL_CALLS_PER_RUN=10  # Function Calling 무한 루프 방지 — run당 최대 도구 호출 수
AGENT_RUN_TIMEOUT_MS=180000      # run 단위 타임아웃 (3분) — 초과 시 status='failed' error_code='RUN_TIMEOUT'
```

---

## 5. 보안 요구사항

> 데이터 민감도: **높음** (향후 결제 데이터 포함 예정, Phase 3)

| 항목                                            | 요구사항                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API 키 관리                                     | `GOOGLE_GENAI_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL` 서버 전용 — 클라이언트 노출 절대 금지                                                                                                                                                                                                                                                                                                                                               |
| 통신 암호화                                     | HTTPS 강제 (Vercel 기본 제공), DB 연결 `sslmode=require`                                                                                                                                                                                                                                                                                                                                                                                       |
| 인증 검증                                       | 모든 API 엔드포인트 Clerk JWT 검증 필수                                                                                                                                                                                                                                                                                                                                                                                                        |
| 입력 검증                                       | Hono 레이어에서 Zod 스키마 검증 — SQL Injection, XSS 방지                                                                                                                                                                                                                                                                                                                                                                                      |
| AI 데이터                                       | 무료 티어에서 사용자 콘텐츠 Google 전송 — 개인정보 포함 금지 정책 약관 명시                                                                                                                                                                                                                                                                                                                                                                    |
| 번역 데이터 (Phase 2)                           | 번역 요청 시 원문 전체가 Gemini로 전송 — 동일 개인정보 금지 정책 적용. 번역 결과는 사용자 DB에만 저장 (Google 측에는 캐시되지 않음 — 무료 티어 정책 약관 명시)                                                                                                                                                                                                                                                                                 |
| 소유자 검증 (Phase 2)                           | `/api/contents/:id/versions/**`, `/api/contents/:id/translations/**` 모든 엔드포인트는 Hono 미들웨어에서 `contents.user_id == Clerk userId` 검증 — 타인 콘텐츠 조회·복원·번역 금지                                                                                                                                                                                                                                                             |
| 버전 본문 크기 (Phase 2)                        | `snapshot_body` 최대 100KB 제한 (마크다운 기준 약 5만자) — 초과 시 400 반환, 사용자에게 본문 분할 안내                                                                                                                                                                                                                                                                                                                                         |
| Phase 3 대비                                    | 결제 데이터 연동 시 PCI-DSS 준수 결제 전문 서비스(토스페이먼츠 등) 사용 — 카드 정보 직접 저장 절대 금지                                                                                                                                                                                                                                                                                                                                        |
| 결제 핵심 원칙 (Phase 3)                        | [`docs/quickstart/toss-quickstart.md §핵심 보안 원칙`](quickstart/toss-quickstart.md) 5가지 100% 준수 — 비즈니스 규칙은 [usecase-common BR-35](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 참조. 구현: `tossRequest()` 래퍼 강제·DB `total_amount` 사용·상태 가드 상수                                                                                                                                               |
| 카드 정보 (Phase 3)                             | 카드번호·CVC 절대 비저장. `subscriptions.billing_key_encrypted`만 AES-256-GCM (`TOSS_BILLING_KEY_ENCRYPTION_KEY`)                                                                                                                                                                                                                                                                                                                              |
| 결제 Webhook (Phase 3)                          | `/api/webhooks/toss` HMAC-SHA256 검증(`TOSS_WEBHOOK_SECRET`) + **항상 200 응답** + `webhook_events.event_id` UNIQUE 멱등성 — 비즈니스 규칙은 [usecase-common BR-37](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 참조                                                                                                                                                                                                 |
| 결제 감사 로그 (Phase 3)                        | 모든 Toss 호출 `tossRequest()` 래퍼 경유로 `payment_logs`에 REQ/RES/ERR 자동 기록. `fetch` 직접 호출 금지                                                                                                                                                                                                                                                                                                                                      |
| 주문 상태 가드 (Phase 3)                        | 화이트리스트 상수(`CLIENT_TRANSITION_STATUSES`·`CONFIRMABLE_STATUSES`·`CANCELED_STATUSES`) 정의 — toss-quickstart §상태 가드 화이트리스트 100% 일치                                                                                                                                                                                                                                                                                            |
| 주문 만료 (Phase 3)                             | `orders.expires_at = +30분` + `/api/cron/billing/expire-orders` 5분 간격 cron이 자동 `PAY_EXPIRED` 전환                                                                                                                                                                                                                                                                                                                                        |
| 환불 계산 (Phase 3)                             | `calculateRefundAmount(unitPrice, qty, used, cancelled)` 단일 정의 — `Math.floor(... × 0.9)` (toss-quickstart §환불 금액 계산)                                                                                                                                                                                                                                                                                                                 |
| 역할 권한 (Phase 3)                             | 모든 `/api/org/**`·`/api/billing/**`·`/api/agents/**`는 §3-5 RBAC 미들웨어로 검증. 실패 시 403 + `error_code='FORBIDDEN_ROLE'` — 비즈니스 규칙은 [usecase-common §1-2 권한 범위](usecase/usecase-common.md#1-2-행위자별-권한-범위) 참조                                                                                                                                                                                                        |
| 콘텐츠 소유권 (Phase 3)                         | `contents.user_id` 검증 → `contents.organization_id` + 멤버십 검증으로 확장. soft-deleted 조직은 읽기만 허용                                                                                                                                                                                                                                                                                                                                   |
| 지침 공유 (Phase 3)                             | 조직 공용 정책 [BR-34](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 구현 — `guidelines.organization_id` 기반 가시성·admin만 수정/삭제                                                                                                                                                                                                                                                                                 |
| Cron 엔드포인트 (Phase 3, v1.4)                 | `/api/cron/**`는 **QStash JWT 서명 검증** (`@upstash/qstash` Receiver — `Upstash-Signature` 헤더 + `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`). 키 로테이션 무중단 지원. 검증 실패 401 + 응답 본문 최소화. 멱등성은 `webhook_events.event_id = Upstash-Message-Id` UNIQUE (BR-37)                                                                                                                                                  |
| 빌링키 파기 (Phase 3, v1.4)                     | BR-39 — 구독 최종 종료 시 Toss `DELETE /v1/billing/authorizations/{billingKey}` 호출 + `subscriptions.billing_key_encrypted = NULL`. 호출 결과는 `payment_logs`에 `BILLING_KEY_DELETE_*`로 기록                                                                                                                                                                                                                                                |
| Agent 입력 검증 (Phase 3)                       | `cron_expression` 5-field 파서 + 분 단위 와일드카드 금지 ([BR-33](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules)). `seed_keywords`·`initial_topics` 길이 제한·이스케이프로 프롬프트 인젝션 차단                                                                                                                                                                                                                         |
| Agent Function Calling (Phase 3, v1.4.1 이원화) | LLM `arguments`는 `function_schema`로 Zod 검증 후 실행. **마스킹은 이원화**: ① **LLM functionResponse는 원본 유지** (Agent 추론 정확성 — content_id·plan·status 등 ID·메타 보존) ② `agent_tool_calls.result`에 저장될 때만 PII·시크릿 마스킹(이메일·전화·access_token·card_number·billing_key 부분 가림). 비밀번호·CVV 같은 절대 비공개 값은 양쪽 모두 마스킹 + 코드 리뷰 시 alert. `AGENT_MAX_TOOL_CALLS_PER_RUN`·`AGENT_RUN_TIMEOUT_MS` 가드 |
| Personal Org 보호 (Phase 3)                     | [BR-31](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 정책을 백엔드 미들웨어로 강제 — 위반 시 400 + `error_code='PERSONAL_ORG_PROTECTED'`                                                                                                                                                                                                                                                                              |

---

## 6. 성능 요구사항

| 항목                                | 목표                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 페이지 초기 로딩                    | 3초 이내 (LCP 기준)                                                                                                                   |
| AI 첫 번째 청크 도착                | 2초 이내 (스트리밍 체감 속도)                                                                                                         |
| API 응답 (AI 제외)                  | 500ms 이내                                                                                                                            |
| 번역 첫 번째 청크 도착 (Phase 2)    | 3초 이내 (원문 분석 시간 고려)                                                                                                        |
| 버전 목록/diff 응답 (Phase 2)       | 800ms 이내 (DB 조회 + 직렬화)                                                                                                         |
| Diff Viewer 렌더 (Phase 2)          | 5만자 본문 기준 500ms 이내 (가상 스크롤 적용)                                                                                         |
| 결제 응답 (Phase 3)                 | 토스 결제창 호출 ~ DB `payments` 행 생성까지 1초 이내 (Webhook 비동기 처리 제외)                                                      |
| Agent 스케줄 지연 (Phase 3, v1.4.1) | cron 명시 시각 ~ 실제 `agent_runs.started_at` 차이 **15분 이내** (모든 환경 dispatch 15분 통일). QStash 큐 지연은 일반적으로 1초 이내 |
| Agent 생성 시간 (Phase 3)           | 단일 run 완료까지 평균 60초 이내 (Gemini 스트리밍 비포함, 일반 생성과 동일)                                                           |
| 권한 검증 미들웨어 (Phase 3)        | 단일 요청당 추가 지연 50ms 이내 (Clerk 세션 캐시 활용)                                                                                |
| 반응형 중단점                       | 모바일(375px) / 태블릿(768px) / 데스크톱(1280px)                                                                                      |

**캐싱 전략**

- 지침 목록: TanStack Query `staleTime: 5분` (자주 변경되지 않음)
- 생성 이력: `staleTime: 1분`
- AI 생성 콘텐츠: 캐시 없음 (매 요청마다 fresh 생성)
- 버전 목록 (Phase 2): `staleTime: 30초` (편집 직후 빠른 반영 필요, `POST versions` 성공 시 invalidate)
- 버전 단건/diff (Phase 2): `staleTime: 무한` (스냅샷은 불변 — 동일 `version_no` 재요청 시 캐시 재활용)
- 번역 본문 (Phase 2): `staleTime: 무한` (생성된 번역본은 불변 — 재번역(`force=true`) 시 명시적 invalidate)
- 번역 목록(상태): `staleTime: 10초` (스트리밍 중 상태 변화 폴링 대비)
- 조직 목록·멤버 (Phase 3): `staleTime: 1분` (Clerk Webhook으로 변경 시 명시적 invalidate)
- 구독 상태 (Phase 3): `staleTime: 30초` (결제 직후 빠른 반영, Webhook 처리 후 invalidate)
- 사용량 (Phase 3): `staleTime: 10초` (생성/번역 직후 카운터 갱신 확인)
- 플랜 카탈로그 (Phase 3): `staleTime: 무한` (코드 상수, 배포 전까지 불변)
- Agent 목록 (Phase 3): `staleTime: 30초`
- Agent 실행 이력 (Phase 3): 실행 중(`status='running'`) row가 있으면 5초 polling, 없으면 `staleTime: 1분`

---

## 7. 외부 연동

| 서비스                               | 용도                                                                           | 장애 대응                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Gemini API                    | AI 콘텐츠 생성                                                                 | 429(Rate Limit) → 사용자 안내 토스트 + 재시도 버튼                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Google Gemini API (Phase 2 번역)     | 마크다운 번역                                                                  | 동일 429 대응 + 스트리밍 중단 시 `content_translations.status='failed'` + `error_message` 기록 → 사용자가 "다시 번역" 버튼으로 재시도                                                                                                                                                                                                                                                                                                                                      |
| Clerk                                | 인증·사용자 관리 (+ Phase 3 Organizations)                                     | 서비스 다운 시 로그인 불가 안내 페이지. Webhook 일시 실패 → svix 자동 재시도(최대 24시간)                                                                                                                                                                                                                                                                                                                                                                                  |
| Neon Postgres                        | 데이터 저장                                                                    | 연결 실패 시 재시도 3회 후 500 에러 반환                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 토스페이먼츠 (Phase 3)               | 단건 승인·취소 + 빌링키 정기결제                                               | 결제 실패 → `subscriptions.status='past_due'` + `past_due_since=now()` + 사용자 이메일 안내 + 3일 grace 후 자동 free 강등(BR-32 한도 즉시 적용). 토스 API 다운 → 결제 페이지 "잠시 후 다시 시도해주세요" + 사용자가 새로고침해도 `syncTossPaymentStatus` 폴백으로 상태 보정                                                                                                                                                                                                |
| **Upstash QStash** (Phase 3, v1.4.1) | Agent 스케줄 / 정기결제 / 만료 주문 / 해지 예약 종료 / quota 리셋 / 조직 purge | (a) **자동 재시도**: 5xx 응답 시 기본 3회 지수 백오프 — 일시적 장애 자체 복구. (b) **무료 한도**: 500 메시지/일 — **모든 환경에서 15분 통일로 ~195/일(38%) 안착**, 향후 트래픽 폭증 시 유료 전환. (c) **운영 가시화**: 모든 실행이 `cron_runs`에 기록, `/system/crons`에서 SystemAdmin 조회. (d) **장애 대응**: QStash 자체 다운 시에도 우리 서비스 본체는 영향 없음(스케줄 작업만 지연). 정기결제 누락이 길어지면 `cron_runs.status='failed'` 누적으로 운영자 알림 트리거 |
| Hashnode/Medium (Phase 3.5)          | `platform_publisher` 도구 — Draft 전송                                         | Phase 3에서는 `is_enabled=false`로 비활성, `dry_run=true` 호출만 허용. 실제 API 연동·OAuth 플로우는 Phase 3.5에서 구현                                                                                                                                                                                                                                                                                                                                                     |

**Gemini API Rate Limit 대응**

- 무료 티어 한도 초과 시 `429 RESOURCE_EXHAUSTED` 오류 반환
- 클라이언트에 "AI 서비스가 잠시 혼잡합니다. 1분 후 다시 시도해주세요." 토스트 노출
- (Phase 2) 콘텐츠 생성과 번역이 동일 API quota를 공유 — 사용자 안내 모달의 노출 정책·메시지·LocalStorage 키는 **[usecase-common.md BR-21](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules)** 단일 정의 (TRD는 quota 공유 사실만 명시)
- (Phase 3) Agent 자동 실행도 동일 quota 공유. Gemini 429 발생 시 `agent_runs.status='failed'` + `error_code='GEMINI_RATE_LIMIT'` 기록 → 다음 스케줄에서 자연 재시도 (개별 알림 없음, Agent 상세 페이지에서만 확인 가능)

**Phase 3 — 플랜 한도 초과 대응 (BR-32)**

- 401 Unauthorized와 구분하기 위해 **402 Payment Required** 사용
- 응답 본문: `{ error_code: 'QUOTA_EXCEEDED', quota_type: 'generations' | 'translations' | 'agent_runs', limit, used, reset_at }`
- 클라이언트: 토스트 + "플랜 업그레이드하기" CTA → `/billing` 이동
- Agent 자동 실행 중 한도 초과: `agent_runs.status='failed'` + `error_code='QUOTA_EXCEEDED'` 기록, 다음 결제 주기 전까지 동일 Agent의 후속 스케줄은 자동 skip

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

| 유형        | 도구       | 대상                                             |
| ----------- | ---------- | ------------------------------------------------ |
| 타입 검사   | TypeScript | 전체 코드                                        |
| 단위 테스트 | Vitest     | 비즈니스 로직 (지침 조합, SEO 프롬프트 빌드)     |
| E2E (추후)  | Playwright | 핵심 플로우 (회원가입 → 지침 등록 → 콘텐츠 생성) |

---

## 9. TRD 검토 체크리스트

- [x] 아키텍처 구성도가 텍스트로 표현되어 있는가?
- [x] 기술 선택 이유가 PRD의 타겟 플랫폼·저장 방식 기준으로 명시되어 있는가?
- [x] DB 스키마 설계 방향이 포함되어 있는가?
- [x] API 구조 및 인증 방식이 정의되어 있는가?
- [x] 보안 요구사항이 데이터 민감도(높음) 수준에 맞게 명시되어 있는가?
- [x] 예산·일정 제약(1개월, 저예산)이 기술 선택에 반영되어 있는가?
- [x] **(Phase 2)** 콘텐츠 이력 관리(`content_versions`)·다국어 번역(`content_translations`) 테이블 스키마가 정의되어 있는가?
- [x] **(Phase 2)** 버전 복원 시 안전장치(직전 본문 자동 스냅샷)가 명시되어 있는가?
- [x] **(Phase 2)** 번역 데이터 Gemini 전송 정책과 소유자 검증 미들웨어 요구사항이 보안 섹션에 반영되어 있는가?
- [x] **(Phase 2)** 번역 본문 캐싱 전략(`staleTime: 무한` + 재번역 시 invalidate)이 정의되어 있는가?
- [x] **(Phase 2)** 지원 언어가 한국어(`ko`)·영어(`en`) 두 가지로 명확히 제한되어 있는가?
- [x] **(Phase 3)** 조직(`organizations`·`organization_members`)·구독(`subscriptions`·`payments`·`usage_quotas`)·Agent(`agent_jobs`·`agent_runs`·`agent_topic_sources`) 9개 신규 테이블 스키마가 정의되어 있는가?
- [x] **(Phase 3)** 기존 `contents`·`users` 테이블 확장 컬럼(`organization_id`, `created_by_agent_job_id`, `default_organization_id`)이 명시되어 있는가?
- [x] **(Phase 3)** Clerk Organizations 활성화와 Webhook 동기화(`organization.*`, `organizationMembership.*`) 정책이 §3-5에 반영되어 있는가?
- [x] **(Phase 3)** RBAC 미들웨어 4단계(`clerkMiddleware` → `withOrganization` → `withAdminRole` → `withOrgQuota`)가 정의되어 있는가?
- [x] **(Phase 3)** 결제 보안(빌링키 AES-256-GCM 암호화 + Webhook HMAC 서명 + `toss_payment_key` UNIQUE 멱등성)이 §5에 반영되어 있는가?
- [x] **(Phase 3)** 플랜 한도 초과(BR-32) 응답 코드(402 Payment Required)와 quota 리셋 cron(매월 1일 KST)이 정의되어 있는가?
- [x] **(Phase 3)** Agent cron 표현식 검증(BR-33, 최소 간격 1시간)과 cron 엔드포인트 보안(v1.4: QStash JWT 서명 검증)이 정의되어 있는가?
- [x] **(Phase 3)** Agent 동시 실행 한도(`AGENT_MAX_CONCURRENT_RUNS`)와 SELECT FOR UPDATE SKIP LOCKED 패턴이 명시되어 있는가?
- [x] **(Phase 3)** 콘텐츠 소유권이 `user_id` → `organization_id` + 멤버십 검증으로 확장되었는가? (BR-31)
- [x] **(Phase 3)** 구독 취소 시 즉시 해지가 아닌 `current_period_end`까지 사용 가능 정책이 정의되어 있는가?
- [x] **(v1.3 / SRS)** `guidelines`가 조직 공용으로 전환되었고(BR-34) `created_by` 컬럼·기존 데이터 백필 마이그레이션(0011)이 정의되어 있는가?
- [x] **(v1.3 / SRS)** Personal Org 자동 생성 로직이 `user.created` Webhook 처리에 단계별로 명시되어 있는가? (Clerk Org API → DB INSERT → default_organization_id 설정 + 보상 트랜잭션)
- [x] **(v1.3 / SRS)** `organizations.deleted_at` soft delete + 30일 grace + `/api/cron/org/purge` 완전 삭제가 정의되어 있는가? Personal Org 삭제 차단 정책이 명시되어 있는가?
- [x] **(v1.3 / Toss)** 결제 스키마가 toss-quickstart 8개 테이블(`orders`·`order_items`·`order_status_history`·`payments`·`payment_logs`·`payment_cancel_requests`·`payment_cancels`·`payment_error_codes`) + `webhook_events` 멱등성 테이블로 재설계되었는가?
- [x] **(v1.3 / Toss)** 빌링키 정기결제가 매월 신규 `orders` 행 생성 + Toss 빌링키 결제 API 호출 + `payment_logs`에 `RECURRING_CHARGE_*` 기록 방식으로 단건 결제와 통일되었는가?
- [x] **(v1.3 / Toss)** 11개 내부 상태 + `CLIENT_TRANSITION_STATUSES`·`CONFIRMABLE_STATUSES`·`CANCELED_STATUSES` 화이트리스트가 정의되어 있는가?
- [x] **(v1.3 / Toss)** 핵심 보안 원칙 5가지(DB amount 사용·tossRequest 래퍼·AUTH_SUCCESS 가드·customerKey 영구 UUID·항상 200 Webhook 응답)가 §5에 명시되어 있는가?
- [x] **(v1.3 / Toss)** `users.payment_customer_key VARCHAR(300) UNIQUE`와 영구 발급 정책이 정의되어 있는가?
- [x] **(v1.3 / Toss)** `orders.id`가 `VARCHAR(64)` 문자열(UUID 타입 아님)로 정의되었고, `expires_at = +30분` + 만료 cron이 정의되어 있는가?
- [x] **(v1.3 / Agent)** Agent가 Gemini Function Calling 기반 Tool Calling 시스템으로 설계되었는가? `agent_tools` 레지스트리 + `agent_tool_calls` 트레이스 테이블이 정의되어 있는가?
- [x] **(v1.3 / Agent)** 3개 표준 도구(topic_picker·content_writer·platform_publisher)의 입출력 스키마가 정의되어 있고, platform_publisher는 Phase 3.5 분리(is_enabled=false)가 명시되어 있는가?
- [x] **(v1.3 / Agent)** `AGENT_MAX_TOOL_CALLS_PER_RUN`·`AGENT_RUN_TIMEOUT_MS`로 무한 루프·장시간 실행 방지가 정의되어 있는가?
- [x] **(v1.3)** Cron 5개(agents/tick · billing/recurring · billing/expire-orders · quota/reset · organizations/purge)와 각 스케줄·동작이 정의되어 있는가? (v1.4에서 6개로 확장 — billing/finalize-canceled 추가, billing/recurring → billing/tick 개명)
- [x] **(v1.4 / QStash)** 스케줄러가 Vercel Cron에서 Upstash QStash로 교체되었고, JWT 서명 검증(`@upstash/qstash` Receiver) + 환경변수 `QSTASH_TOKEN`/`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` 3종이 정의되어 있는가?
- [x] **(v1.4 / QStash)** 모든 cron 엔드포인트가 `webhook_events.event_id = Upstash-Message-Id` 멱등성 + `cron_runs` 기록을 첫 단계에서 수행하도록 명세되어 있는가?
- [x] **(v1.4 / QStash)** 무료 한도(500 메시지/일) 고려한 환경별 cron 주기 분리(`QSTASH_*_CRON` 환경변수, 개발/운영 dispatch 빈도 차등)가 정의되어 있는가?
- [x] **(v1.4 / BR-02)** Team 플랜이 제거되고 Free/Pro 2종으로 통일되었는가? 모든 ENUM·Request·Response가 갱신되었는가?
- [x] **(v1.4 / BR-38)** 구독 해지가 즉시 cancel에서 '해지 예약' 패턴으로 재작성되었는가? `subscriptions.cancel_scheduled_at` 컬럼 + `POST/DELETE /api/billing/subscription/cancel` + `/api/cron/billing/finalize-canceled` cron이 정의되어 있는가?
- [x] **(v1.4 / BR-39)** 구독 최종 종료 시 Toss 빌링키 삭제 API 호출 + `billing_key_encrypted=NULL` 정리 + `payment_logs` BILLING*KEY_DELETE*\* 기록이 정의되어 있는가?
- [x] **(v1.4 / UC-39)** `cron_runs` 테이블 + `/api/system/crons/**` 3개 엔드포인트가 SystemAdmin 운영 콘솔용으로 정의되어 있는가?
- [x] **(v1.4.1 / 패치1)** cron 주기가 모든 환경에서 15분으로 통일되어 QStash 무료 한도 안에 안착(~195/500/일)되어 있는가?
- [x] **(v1.4.1 / 패치2)** Personal Org 자동 생성에 부분 unique index + advisory lock + Clerk idempotency_key 3중 방어가 §3-5·BR-31·08-usecase §4-1·마이그레이션 0009에 모두 명시되어 있는가?
- [x] **(v1.4.1 / 패치3)** Function Calling 마스킹이 LLM functionResponse(원본 유지) / `agent_tool_calls.result`(마스킹 적용)로 이원화되어 있는가? 마스킹 분류 표(4분류)가 정의되어 있는가?
- [x] **(v1.4.1 / 패치4)** UC-38 DELETE 핸들러에 `SELECT FOR UPDATE` 락 + 상태 재검증 + `next_billing_at = MAX(current_period_end+1d, now()+1h)` 보정이 정의되어 있는가? BR-38 본문·UC-38 의사코드·TRD DELETE 본문 3곳에 일관되게 반영되었는가?
- [x] **(v1.3)** 마이그레이션 파일 13개(0007~0019)가 순서 의존성을 고려해 정의되어 있는가? (personal_org 백필 → contents/guidelines 백필)
