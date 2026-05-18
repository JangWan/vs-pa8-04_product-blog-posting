# Usecase Common — IndiePost AI

> 공통 정의 문서 (모든 기능별 Usecase가 참조)  
> 작성일: 2026-05-15 | 버전: v1.3.1 (2026-05-18 v1.4.1 운영 안정성 패치)  
> 참조: PRD.md · IA.md · TRD.md · SRS.md · BR-구독결제.md
>
> **변경 이력**
>
> - v1.0 (2026-05-15) 최초 작성 — UC-01~14
> - v1.1 (2026-05-17) Phase 2 확장 — UC-15~22 추가, BR-18~24 추가, 토스트·모달·Empty State 표 확장
> - v1.2 (2026-05-17) Phase 3 확장 — UC-23~37 추가 (조직 관리·결제·에이전트), BR-31~37 추가, Personal Org·30일 grace·11상태 결제·Tool Calling 규칙 정의
> - v1.3.1 (2026-05-18) **v1.4.1 운영 안정성 패치 정합** — BR-31 3중 방어, BR-33 15분 통일, BR-38 트랜잭션 락·보정 추가
> - v1.3 (2026-05-18) **QStash·BR-02 정합화**
>   - **Team 플랜 제거** — Free/Pro 2종으로 단순화 (BR-구독결제.md SSOT 채택). Team은 Phase 4로 이연
>   - **해지 예약 정책 도입** — BR-38 신규. UC-31 재작성 + UC-38 신규 (해지 예약 취소)
>   - **빌링키 파기 정책** — BR-39 신규. 구독 최종 만료 시 Toss 빌링키 삭제 API 호출
>   - **메시지 큐 기반 cron 트리거** — BR-37 멱등성에 QStash 추가 (`Upstash-Message-Id`), BR-36 재시도 정책 명확화(일시적 오류만 자동 재시도)
>   - **시스템 cron 가시화** — UC-39 신규 (`/system/crons` SystemAdmin 전용)

---

## 0. 전체 유스케이스 목록 (UC-00)

> 이 목록은 서비스의 모든 유스케이스를 단 한 곳에서 정의한다.  
> 각 기능별 Usecase 파일은 이 목록을 재정의하지 않고 참조만 한다.

| UC ID               | 기능명                               | 파일                                                   | 구현 순서 | 관련 행위자            | 핵심 기술 문서                                  |
| ------------------- | ------------------------------------ | ------------------------------------------------------ | --------- | ---------------------- | ----------------------------------------------- |
| UC-01               | 랜딩 페이지                          | `01-usecase-랜딩.md`                                   | 1         | `Visitor`, `User`      | IA.md (디자인)                                  |
| UC-02               | 회원가입                             | `02-usecase-인증.md`                                   | 2         | `Visitor`              | `docs/tech/clerk.md`                            |
| UC-03               | 로그인                               | `02-usecase-인증.md`                                   | 2         | `Visitor`              | `docs/tech/clerk.md`                            |
| UC-04               | 비밀번호 찾기                        | `02-usecase-인증.md`                                   | 2         | `Visitor`              | `docs/tech/clerk.md`                            |
| UC-05               | 로그아웃                             | `02-usecase-인증.md`                                   | 2         | `User`                 | `docs/tech/clerk.md`                            |
| UC-06               | 대시보드 홈                          | `03-usecase-대시보드.md`                               | 3         | `User`                 | `docs/tech/neon.md`                             |
| UC-07               | 콘텐츠 생성 폼                       | `04-usecase-콘텐츠생성.md`                             | 4         | `User`                 | `docs/tech/gemini_tech.md`, `docs/tech/neon.md` |
| UC-08               | AI 스트리밍 생성                     | `04-usecase-콘텐츠생성.md`                             | 4         | `User`, `System`       | `docs/tech/gemini_tech.md`                      |
| UC-09               | 생성 결과 에디터                     | `04-usecase-콘텐츠생성.md`                             | 4         | `User`                 | `docs/tech/neon.md`                             |
| UC-10               | 지침 목록 조회                       | `05-usecase-지침관리.md`                               | 5         | `User`                 | `docs/tech/neon.md`                             |
| UC-11               | 지침 생성                            | `05-usecase-지침관리.md`                               | 5         | `User`                 | `docs/tech/neon.md`                             |
| UC-12               | 지침 수정                            | `05-usecase-지침관리.md`                               | 5         | `User`                 | `docs/tech/neon.md`                             |
| UC-13               | 지침 삭제                            | `05-usecase-지침관리.md`                               | 5         | `User`                 | `docs/tech/neon.md`                             |
| UC-14               | 기본 지침 설정                       | `05-usecase-지침관리.md`                               | 5         | `User`                 | `docs/tech/neon.md`                             |
| UC-15 **(Phase 2)** | 이력 상세 조회                       | [`06-usecase-콘텐츠이력.md`](06-usecase-콘텐츠이력.md) | 6         | `User`                 | `docs/tech/neon.md`                             |
| UC-16 **(Phase 2)** | 버전 목록·미리보기                   | [`06-usecase-콘텐츠이력.md`](06-usecase-콘텐츠이력.md) | 6         | `User`                 | `docs/tech/neon.md`                             |
| UC-17 **(Phase 2)** | 버전 수동 스냅샷                     | [`06-usecase-콘텐츠이력.md`](06-usecase-콘텐츠이력.md) | 6         | `User`                 | `docs/tech/neon.md`                             |
| UC-18 **(Phase 2)** | 버전 복원                            | [`06-usecase-콘텐츠이력.md`](06-usecase-콘텐츠이력.md) | 6         | `User`                 | `docs/tech/neon.md`                             |
| UC-19 **(Phase 2)** | 두 버전 비교 (Diff)                  | [`06-usecase-콘텐츠이력.md`](06-usecase-콘텐츠이력.md) | 6         | `User`                 | `docs/tech/neon.md`                             |
| UC-20 **(Phase 2)** | 번역 생성 (스트리밍)                 | [`07-usecase-다국어번역.md`](07-usecase-다국어번역.md) | 7         | `User`, `System`       | `docs/tech/gemini_tech.md`                      |
| UC-21 **(Phase 2)** | 번역 조회·재생성                     | [`07-usecase-다국어번역.md`](07-usecase-다국어번역.md) | 7         | `User`, `System`       | `docs/tech/gemini_tech.md`                      |
| UC-22 **(Phase 2)** | 번역 삭제                            | [`07-usecase-다국어번역.md`](07-usecase-다국어번역.md) | 7         | `User`                 | `docs/tech/neon.md`                             |
| UC-23 **(Phase 3)** | 조직 생성                            | [`08-usecase-조직관리.md`](08-usecase-조직관리.md)     | 8         | `User`                 | `docs/tech/clerk.md`                            |
| UC-24 **(Phase 3)** | 멤버 초대                            | [`08-usecase-조직관리.md`](08-usecase-조직관리.md)     | 8         | `Admin`                | `docs/tech/clerk.md`                            |
| UC-25 **(Phase 3)** | 역할 변경·멤버 제거                  | [`08-usecase-조직관리.md`](08-usecase-조직관리.md)     | 8         | `Admin`                | `docs/tech/clerk.md`                            |
| UC-26 **(Phase 3)** | 조직 삭제 (soft delete · 30일 grace) | [`08-usecase-조직관리.md`](08-usecase-조직관리.md)     | 8         | `Admin`                | `docs/tech/neon.md`                             |
| UC-27 **(Phase 3)** | 조직 복원 (grace 기간 내)            | [`08-usecase-조직관리.md`](08-usecase-조직관리.md)     | 8         | `Admin`                | `docs/tech/neon.md`                             |
| UC-28 **(Phase 3)** | 신규 구독 결제 (Free → Pro/Team)     | [`09-usecase-결제.md`](09-usecase-결제.md)             | 9         | `Admin`, `System`      | `docs/quickstart/toss-quickstart.md`            |
| UC-29 **(Phase 3)** | 정기결제 자동 청구 (cron)            | [`09-usecase-결제.md`](09-usecase-결제.md)             | 9         | `System`               | `docs/quickstart/toss-quickstart.md`            |
| UC-30 **(Phase 3)** | 플랜 업/다운그레이드                 | [`09-usecase-결제.md`](09-usecase-결제.md)             | 9         | `Admin`, `System`      | `docs/quickstart/toss-quickstart.md`            |
| UC-31 **(Phase 3)** | 구독 취소                            | [`09-usecase-결제.md`](09-usecase-결제.md)             | 9         | `Admin`                | `docs/quickstart/toss-quickstart.md`            |
| UC-32 **(Phase 3)** | 환불 요청·승인                       | [`09-usecase-결제.md`](09-usecase-결제.md)             | 9         | `Admin`, `SystemAdmin` | `docs/quickstart/toss-quickstart.md`            |
| UC-33 **(Phase 3)** | 가상계좌 입금 대기·확인              | [`09-usecase-결제.md`](09-usecase-결제.md)             | 9         | `Admin`, `System`      | `docs/quickstart/toss-quickstart.md`            |
| UC-34 **(Phase 3)** | AI Agent 생성·설정                   | [`10-usecase-에이전트.md`](10-usecase-에이전트.md)     | 10        | `Admin`                | `docs/tech/gemini_tech.md`                      |
| UC-35 **(Phase 3)** | Agent 즉시 실행 (수동 트리거)        | [`10-usecase-에이전트.md`](10-usecase-에이전트.md)     | 10        | `Member`, `System`     | `docs/tech/gemini_tech.md`                      |
| UC-36 **(Phase 3)** | Agent 자동 실행 (cron)               | [`10-usecase-에이전트.md`](10-usecase-에이전트.md)     | 10        | `System`               | `docs/tech/gemini_tech.md`                      |
| UC-37 **(Phase 3)** | 도구 호출 트레이스 조회              | [`10-usecase-에이전트.md`](10-usecase-에이전트.md)     | 10        | `Member`               | `docs/tech/gemini_tech.md`                      |
| UC-38 **(Phase 3)** | 구독 해지 예약 취소                  | [`09-usecase-결제.md`](09-usecase-결제.md)             | 9         | `Admin`                | `docs/quickstart/toss-quickstart.md`            |
| UC-39 **(Phase 3)** | 시스템 cron 대시보드 (SystemAdmin)   | [`11-usecase-시스템.md`](11-usecase-시스템.md)         | 11        | `SystemAdmin`          | (QStash REST)                                   |

### 구현 순서 근거

| 순서                       | 이유                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| 1 — 랜딩                   | 디자인 시스템 검증 + 마케팅 페이지 선행 구축                                       |
| 2 — 인증                   | 이후 모든 기능이 `userId`에 의존하므로 최우선 구현                                 |
| 3 — 대시보드               | 인증 후 진입점. 내비게이션 셸(Shell) 먼저 완성                                     |
| 4 — 콘텐츠 생성            | 핵심 가치(MVP 기능 F1·F3) 구현                                                     |
| 5 — 지침 관리              | 콘텐츠 생성 품질 향상을 위한 보조 기능                                             |
| 6 — 콘텐츠 이력 (Phase 2)  | MVP 출시 후 사용자 데이터가 누적되면 회고·복원 가치가 부각됨                       |
| 7 — 다국어 번역 (Phase 2)  | 이력 인프라(상세 페이지·소유권 검증) 위에 얹는 부가 가치 — 콘텐츠 이력 먼저        |
| 8 — 조직 관리 (Phase 3)    | 모든 Phase 3 데이터(결제·Agent·콘텐츠)가 `organization_id`에 귀속되므로 최우선     |
| 9 — 결제 (Phase 3)         | 플랜 한도(BR-32)가 Agent 한도를 결정하므로 Agent보다 먼저                          |
| 10 — AI Agent (Phase 3)    | 조직·결제 기반 위에 Function Calling 자동화 — 마지막 단계. Phase 3.5에서 발행 연동 |
| 11 — 시스템 운영 (Phase 3) | cron 가시화는 SystemAdmin 콘솔 — Phase 3 마지막에 운영 안정성 강화용 (UC-39)       |

### Phase 2 — 생성 이력 (`/history`) 페이지네이션 방식

| 항목             | 결정                                                              |
| ---------------- | ----------------------------------------------------------------- |
| 방식             | 커서 기반 무한스크롤 (`cursor` 파라미터)                          |
| 기본 페이지 크기 | 20개                                                              |
| API              | `GET /api/history?cursor=<last_id>` (첫 요청은 cursor 생략)       |
| 종료 조건        | 응답의 `next_cursor`가 `null`이면 마지막 페이지                   |
| 이유             | 콘텐츠가 지속 누적되는 목록에서 offset 방식의 중복·누락 문제 방지 |

---

## 1. 행위자 정의 (Actor Definitions)

### 1-1. 행위자 목록

| 행위자                      | 식별자        | 설명                                                                                                                 |
| --------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 비로그인 방문자             | `Visitor`     | 인증 없이 서비스에 접근한 사용자. 랜딩 페이지만 접근 가능.                                                           |
| 로그인 사용자               | `User`        | Clerk 인증이 완료된 인디해커. 대시보드 전체 기능 사용 가능.                                                          |
| 조직 멤버 **(Phase 3)**     | `Member`      | 특정 조직에 `org:member` 역할로 소속된 `User`. 콘텐츠·지침·Agent 사용 가능, 조직/결제 관리 불가.                     |
| 조직 관리자 **(Phase 3)**   | `Admin`       | 특정 조직에 `org:admin` 역할로 소속된 `User`. Member 권한 + 조직 설정·멤버 관리·결제·Agent 정의 권한.                |
| 시스템 관리자 **(Phase 3)** | `SystemAdmin` | IndiePost AI 운영자 (별도 콘솔, Phase 3 범위 외 — 환불 승인 등 일부만 본 문서에서 언급).                             |
| 시스템                      | `System`      | IndiePost AI 서버(Next.js + Hono), Gemini API, Clerk, Neon Postgres, Toss Payments, **Upstash QStash**(v1.4)의 총칭. |

### 1-2. 행위자별 권한 범위

| 행위자            | 접근 가능 영역                                                                           | 불가 영역                                        |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `Visitor`         | `/` 랜딩, `/sign-in`, `/sign-up`                                                         | `/dashboard/**` 전체                             |
| `User`            | 전체 페이지 (공개 + 인증 영역)                                                           | 타 사용자의 데이터                               |
| `Member` **(P3)** | 활성 조직의 콘텐츠·지침·Agent R/U + Agent 즉시 실행                                      | 조직 설정·멤버 관리·결제 페이지, Agent 정의·삭제 |
| `Admin` **(P3)**  | Member 권한 + `/org/[id]`·`/org/[id]/members`·`/billing/**`·Agent CRUD                   | 다른 조직의 데이터, `SystemAdmin` 전용 환불 승인 |
| `System`          | DB CRUD, Gemini API 호출, Clerk JWT 검증, Toss API 호출(`tossRequest` 래퍼), Cron 트리거 | 사용자 비밀번호·카드 정보 직접 저장              |

### 1-3. 로그인 사용자 상태 세분화

| 상태                                 | 설명                                                                                                                 | 해당 시나리오                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 신규 사용자                          | 가입 후 지침 0개                                                                                                     | 대시보드 Empty State + 지침 등록 CTA                                                  |
| 일반 사용자                          | 지침 1개 이상 등록 완료                                                                                              | 콘텐츠 생성 바로 진행 가능                                                            |
| Personal Org 단독 사용자 **(P3)**    | 가입 시 자동 생성된 Personal Org만 보유 (다른 조직 X)                                                                | 본인 전용 작업 — 멤버 초대·조직 삭제 불가 (BR-31)                                     |
| 조직 다중 소속 사용자 **(P3)**       | Personal Org + 1개 이상의 추가 조직                                                                                  | Sidebar OrganizationSwitcher로 컨텍스트 전환                                          |
| 무료 플랜 조직의 멤버 **(P3)**       | 활성 조직의 `plan='free'`                                                                                            | Agent 사용 불가(BR-32 max_agents=0), 생성/번역 한도 적용                              |
| 유료 플랜 조직의 멤버 **(P3, v1.3)** | 활성 조직의 `plan='pro'`                                                                                             | 전체 기능 사용 가능                                                                   |
| past_due 상태 조직 **(P3)**          | 정기결제 실패, 3일 grace 진행 중                                                                                     | 대시보드 빨강 배너 + 즉시 재결제 CTA, 한도는 유지                                     |
| 해지 예약 상태 조직 **(P3, v1.3)**   | `subscriptions.status='active'` && `cancel_scheduled_at IS NOT NULL`                                                 | amber 배너 + "{current_period_end}까지 사용 가능 · [해지 예약 취소]" — 정상 사용 가능 |
| canceled 상태 조직 **(P3)**          | `current_period_end` 도래 후 자동 강등 → `status='canceled'` + `organizations.plan='free'` 강등 + 빌링키 파기(BR-39) | 무료 플랜으로 사용                                                                    |
| soft-deleted 조직 **(P3)**           | `deleted_at IS NOT NULL`, 30일 grace 내                                                                              | 읽기만 허용, 모든 쓰기 액션 disabled + 복원 CTA                                       |

---

## 2. 공통 비즈니스 규칙 (Common Business Rules)

### 2-1. 인증·권한 규칙

| #     | 규칙                  | 상세                                                                                       |
| ----- | --------------------- | ------------------------------------------------------------------------------------------ |
| BR-01 | 인증 필요 경로 보호   | `/dashboard/**` 및 `/api/**`(webhooks 제외)는 Clerk JWT가 없으면 접근 불가.                |
| BR-02 | 비로그인 접근 차단    | `Visitor`가 인증 필요 경로에 직접 접근하면 `/sign-in?redirect=요청경로`로 즉시 리다이렉트. |
| BR-03 | 로그인 상태 중복 접근 | `User`가 `/sign-in` 또는 `/sign-up`에 접근하면 `/dashboard`로 리다이렉트.                  |
| BR-04 | 데이터 소유권         | `User`는 자신의 `userId`에 귀속된 데이터만 CRUD 가능. 타 사용자 데이터 접근 시 403 반환.   |
| BR-05 | API 인증 검증         | 모든 Hono API 엔드포인트는 요청 헤더의 Clerk JWT를 검증하고 `userId`를 추출한다.           |

### 2-2. 데이터 유효성 규칙

| #     | 규칙           | 상세                                                                                        |
| ----- | -------------- | ------------------------------------------------------------------------------------------- |
| BR-06 | 필수 입력 검증 | 모든 폼의 필수 항목(`required`)이 비어 있으면 서버 전송 전 클라이언트에서 인라인 에러 표시. |
| BR-07 | 입력 길이 제한 | Hono 레이어에서 Zod 스키마로 길이 제한 검증. 초과 시 400 반환 + 에러 메시지.                |
| BR-08 | XSS 방지       | 사용자 입력은 렌더링 전 HTML 이스케이프 처리. MDX Editor 출력은 마크다운으로만 노출.        |

### 2-3. 서비스 정책

| #                           | 규칙                                                  | 상세                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-09                       | AI 데이터 프라이버시                                  | 무료 Gemini 티어에서 사용자 콘텐츠가 Google에 전송됨. 개인정보 포함 금지 정책을 서비스 약관에 명시.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| BR-10                       | 기본 지침 자동 적용                                   | 콘텐츠 생성 시 지침이 선택되지 않으면 `is_default=true`인 지침을 자동 적용. 기본 지침이 없으면 SEO 기본 프롬프트만 사용.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| BR-11                       | 단일 기본 지침                                        | `is_default=true`인 지침은 사용자당 최대 1개. 새로운 지침을 기본으로 설정하면 기존 기본 지침은 `is_default=false`로 변경.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| BR-12                       | 지침 삭제 시 연관 콘텐츠 보존                         | 지침 삭제 시 해당 지침으로 생성된 `contents.guideline_id`를 NULL로 설정. 콘텐츠 이력은 삭제되지 않고 "삭제된 지침"으로 표시.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| BR-13                       | 콘텐츠 자동 저장                                      | AI 스트리밍 완료 즉시 서버가 `contents` 테이블에 자동 저장. 저장 완료 후 마지막 청크로 `[DONE]{"id":"..."}` 전송 → 클라이언트가 `/generate/[id]`로 리다이렉트.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| BR-14                       | 로그아웃 후 이동                                      | 로그아웃 완료 시 랜딩 페이지(`/`)로 이동.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| BR-15                       | 마크다운 다운로드 파일명                              | `YYYY-MM-DD-주제명(slug).md` 형식. 예: `2026-05-15-nextjs-saas-후기.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| BR-16                       | users 테이블 동기화                                   | Clerk `user.created` Webhook 이벤트 수신 시 서버가 `users` 테이블에 INSERT. 클라이언트에서 직접 호출 금지.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| BR-17                       | 에디터 수동 저장                                      | `/generate/[id]` 에디터에서 편집 후 "저장" 버튼 클릭 시에만 DB 업데이트. 자동 저장 없음. 저장 전 이탈 시 편집 내용 소실.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| BR-18 **(P2)**              | 편집본 자동 스냅샷                                    | `PUT /api/history/:id`로 본문이 변경 저장될 때, 서버가 직전 본문을 자동으로 `content_versions`에 INSERT한다. 본문이 동일하면 스냅샷 생성 안 함.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| BR-19 **(P2)**              | 버전 복원 안전장치                                    | 버전 복원(`POST .../versions/:no/restore`) 직전에 현재 `contents.body`를 새 버전으로 자동 스냅샷한 후 복원을 수행한다. 사용자가 실수로 복원해도 직전 상태로 되돌릴 수 있다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| BR-20 **(P2)**              | 버전 본문 크기 제한                                   | `snapshot_body` 최대 100KB(약 5만자). 초과 시 서버는 400을 반환하고 사용자에게 본문 분할을 안내한다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| BR-21 **(P2)**              | 번역 quota 1회 안내                                   | 번역 첫 시도 시 "번역도 AI 생성 횟수에 포함됩니다" 안내 모달을 1회만 노출한다. 노출 후 `LocalStorage["translation_quota_notice_seen"] = "true"`로 재노출 방지.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| BR-22 **(P2)**              | 번역 언어 제약                                        | 지원 언어는 `ko`·`en` 두 가지로 제한. 원문(`contents.source_lang`)과 동일 언어로의 번역은 불가능 — 번역 모달의 언어 Dropdown에서 해당 옵션이 비활성화된다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| BR-23 **(P2)**              | 번역 덮어쓰기 정책                                    | 동일 `(content_id, target_lang)`에 이미 `status='completed'` 행이 있으면 서버는 409를 반환한다. 사용자 확인 후 `force=true`로 재요청 시에만 덮어쓴다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| BR-24 **(P2)**              | 콘텐츠 이력 삭제 연쇄                                 | `contents` DELETE 시 `content_versions`·`content_translations`가 외래키 ON DELETE CASCADE로 함께 삭제된다. 별도 정리 작업 불필요.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| BR-31 **(P3, v1.4.1 갱신)** | 조직 소유권 + Personal Org 자동 생성 + 30일 grace     | (a) 모든 `contents`·`guidelines`·`agent_jobs`는 `organization_id`에 귀속. (b) `user.created` Webhook 시 Personal Org(`is_personal=true`, 이름 `"{email}'s Workspace"`)를 자동 생성하고 `users.default_organization_id`로 설정한다. **중복 생성 방지 3중 방어 필수** (v1.4.1): ① DB 부분 unique index `WHERE is_personal=true AND deleted_at IS NULL` ② PostgreSQL `pg_advisory_xact_lock('personal_org:'                                                                                                                                                                                                                                                                                                                                                                                                                    |     | user_id)`③ Clerk Organization API`idempotency_key=personal-{clerk_user_id}`— Webhook 처리와 미들웨어 보상 트랜잭션이 동시 실행되어도 정확히 1건만 생성. (c) Personal Org는 **삭제 불가·멤버 초대 불가·플랜 다운그레이드만 멤버 0 검증 후 허용**. (d) 일반 조직 삭제 시 즉시 hard delete 하지 않고`organizations.deleted_at = now()`로 soft delete. 30일 내 복원 가능, 30일 경과 시 `/api/cron/org/purge`가 CASCADE 완전 삭제. |
| BR-32 **(P3, v1.3 갱신)**   | 플랜별 한도 (Free/Pro 2종)                            | **Free**(멤버 1·월 생성 10·번역 5·Agent 실행 0·max_agents 0) / **Pro**(멤버 3·생성 200·번역 100·Agent 실행 30·max_agents 3, 월 29,900원 VAT 포함). 한도 초과 시 402 Payment Required + `error_code='QUOTA_EXCEEDED'` + 사용자에게 모달 안내 + 업그레이드 CTA. `usage_quotas`는 매월 1일 KST 자동 리셋 (cron). **Team 플랜은 Phase 4로 이연** — BR-구독결제.md SSOT.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| BR-33 **(P3, v1.4.1 갱신)** | Agent 스케줄 최소 간격                                | `cron_expression`은 5-field 형식 + **분 단위 와일드카드 `*` 금지** + 최소 실행 간격 1시간. 외부 메시지 큐 스케줄러(QStash)가 디스패처(`/api/cron/agents/tick`)를 **15분 간격으로 모든 환경에서 동일 트리거** → 서버가 `next_run_at <= now()` 인 job만 일괄 처리. Agent 최소 1시간 정책과 무관(15분 < 60분). 동시 실행 가능 수는 `AGENT_MAX_CONCURRENT_RUNS=5`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| BR-34 **(P3)**              | 지침 공유 범위 (조직 공용)                            | `guidelines`는 `organization_id`에 귀속되며, 조직 내 모든 멤버가 **조회·사용 가능**. 수정·삭제는 `Admin`만 가능(작성자 `created_by`와 무관). 개인 전용 지침이 필요하면 Personal Org에서 작성해야 한다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| BR-35 **(P3)**              | 결제 핵심 보안 원칙 (toss-quickstart §핵심 보안 원칙) | (a) DB 주문 행을 **먼저 생성**한 뒤 Toss 결제창 호출. (b) 서버 confirm 시 **DB `total_amount` 사용** — 클라이언트 amount 절대 신뢰 금지. (c) confirm 가능 상태는 **`AUTH_SUCCESS` 만**. (d) 모든 Toss API 호출은 **`tossRequest()` 래퍼 경유**(감사 로그 자동). (e) `customer_key`는 사용자별 **영구 UUID** 재사용. 위반 시 분쟁·환불·이중 결제·금액 변조 위험.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| BR-36 **(P3, v1.3 갱신)**   | 정기결제 실패 grace + 자동 재시도 정책                | (a) **일시적 오류(네트워크·5xx)** → 외부 메시지 큐의 자동 재시도(기본 3회 지수 백오프)로 자체 복구. (b) **영구 실패(카드 거절·잔액 부족·빌링키 만료)** → 즉시 `subscriptions.status='past_due'` + `past_due_since=now()` 설정 (재시도 무의미). 매일 cron이 `past_due_since` 3일 경과한 구독을 `canceled`로 전환 + `organizations.plan='free'` 강등(BR-32 한도 즉시 적용). 사용자에게는 첫 실패 시 이메일 안내 + 대시보드 빨강 배너 영구 노출. 메시지 큐의 자동 재시도는 사용자에게 "알아서 처리된다"는 인상을 주지 않도록 UI 문구에서 명시 금지.                                                                                                                                                                                                                                                                            |
| BR-37 **(P3, v1.3 갱신)**   | Webhook·메시지 큐 멱등성                              | `/api/webhooks/toss`·`/api/webhooks/clerk`·`/api/cron/**` 모두 동일 메시지 중복 수신 가능. `webhook_events.event_id` UNIQUE 충돌 시 즉시 200 OK + 처리 스킵. event_id 출처: Toss `eventId` / Clerk `svix-id` / **QStash `Upstash-Message-Id`**. 항상 200 응답 (5xx 시 외부 서비스가 지수 백오프로 재시도하여 중복 처리 위험).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| BR-38 **(P3, v1.4.1 보강)** | 구독 해지 예약 정책                                   | 사용자가 구독 취소 요청 시 즉시 종료되지 않고 **'해지 예약'** 상태가 된다 — `subscriptions.cancel_scheduled_at = now()` 설정, `status='active'` 유지. `current_period_end`까지 Pro 기능 사용 가능. **결제 예정일 전이라면 언제든 해지 예약 취소 가능** (UC-38) — `cancel_scheduled_at = NULL`로 복구. `current_period_end` 도래 시 cron이 `status='canceled'` 전환 + `organizations.plan='free'` 강등 + BR-39 적용. **(v1.4.1 경합 방어)** 해지 예약 취소 시 ① `subscriptions` 행 `SELECT FOR UPDATE` 락으로 billing/tick·finalize-canceled cron과 직렬화 ② `next_billing_at`은 `MAX(current_period_end + 1일, now() + 1시간)`로 보정하여 과거·즉시 cron 재실행 방지 ③ 락 획득 후 상태 재검증(status='active' && cancel_scheduled_at IS NOT NULL && current_period_end > now()) — 미충족 시 409 `CANCEL_ALREADY_FINALIZED`. |
| BR-39 **(P3, v1.3 신규)**   | 빌링키 파기 정책                                      | 구독이 최종적으로 종료(`status='canceled'`) 되는 시점에 cron이 Toss `DELETE /v1/billing/authorizations/{billingKey}` 호출 → `subscriptions.billing_key_encrypted = NULL`로 정리. 재구독 시 신규 빌링키 발급 필요 (UC-28 처음부터). 호출 결과는 `payment_logs`에 `BILLING_KEY_DELETE_*`로 기록.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## 3. 공통 예외 처리 (Common Exception Handling)

### 3-1. 예외 처리 일람

| 예외 유형                       | HTTP 상태                                   | 사용자 메시지                                                             | 처리 방식                                                                         |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 네트워크 오류                   | 연결 실패                                   | "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요." | 토스트 (warning) + 재시도 버튼                                                    |
| 세션 만료                       | 401                                         | "세션이 만료되었습니다. 다시 로그인해주세요."                             | 토스트 3초 → `/sign-in?redirect=현재경로` 리다이렉트                              |
| 권한 없음                       | 403                                         | "접근 권한이 없습니다."                                                   | 토스트 (error) + `/dashboard` 리다이렉트                                          |
| 리소스 없음                     | 404                                         | "요청하신 정보를 찾을 수 없습니다."                                       | 토스트 (error) + 이전 페이지 유지                                                 |
| 서버 오류                       | 500                                         | "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."                    | 토스트 (error) + 재시도 버튼                                                      |
| 입력값 오류                     | 400                                         | 항목별 인라인 에러 메시지 (BR-06 참조)                                    | 인라인 에러 (토스트 미사용)                                                       |
| 플랜 한도 초과 **(P3)**         | 402                                         | "이번 달 {quota_type} 한도를 모두 사용했습니다."                          | 모달 (Dialog) + 사용량 차트 + "플랜 업그레이드" CTA (BR-32)                       |
| 역할 권한 부족 **(P3)**         | 403 + `error_code='FORBIDDEN_ROLE'`         | "관리자만 사용할 수 있는 기능입니다."                                     | 토스트 (error) + 이전 페이지 유지 (member에게는 메뉴 자체가 숨겨지므로 도달 드뭄) |
| Personal Org 보호 위반 **(P3)** | 400 + `error_code='PERSONAL_ORG_PROTECTED'` | "Personal Org는 보호된 공간입니다."                                       | 토스트 (error) + 작업 차단 (BR-31)                                                |
| Webhook 멱등성 중복 **(P3)**    | 200                                         | (외부 서비스용 응답, 사용자 노출 없음)                                    | 즉시 200 OK + 처리 스킵 (BR-37)                                                   |

### 3-2. 예외별 상세 처리 흐름

**네트워크 오류**

```
요청 실패 (fetch error / timeout)
  → 우하단 warning 토스트 노출 (5초, 재시도 버튼 포함)
  → 사용자가 재시도 클릭 → 동일 요청 재전송
  → 재시도 없이 닫으면 현재 상태 유지
```

**세션 만료 (401)**

```
API 응답 401 감지
  → "세션이 만료되었습니다. 다시 로그인해주세요." 토스트 3초 노출
  → 3초 후 자동으로 /sign-in?redirect=현재경로 리다이렉트
  → 재로그인 완료 → redirect 파라미터 경로로 복귀
```

**서버 오류 (500)**

```
API 응답 500 감지
  → Neon DB: 재시도 3회 후 클라이언트에 오류 반환
  → 우하단 error 토스트 노출 (5초, 재시도 버튼 포함)
```

---

## 4. 공통 UI 패턴 (Common UI Patterns)

### 4-1. 로딩 상태

| 상황                    | 표시 방식                                | 컴포넌트                      |
| ----------------------- | ---------------------------------------- | ----------------------------- |
| 페이지 초기 데이터 로딩 | 스켈레톤 카드                            | shadcn/ui `<Skeleton>`        |
| 버튼 액션 처리 중       | 버튼 비활성화 + 스피너 아이콘            | Lucide `<Loader2>` (spin)     |
| AI 콘텐츠 생성 중       | 스트리밍 텍스트 실시간 append            | → 04-usecase-콘텐츠생성 참조  |
| 폼 제출 중              | 제출 버튼 비활성화 + "저장 중..." 텍스트 | shadcn/ui `<Button disabled>` |

### 4-2. 에러 메시지 표시 기준

| 유형             | 사용 시점                                   | 컴포넌트                           |
| ---------------- | ------------------------------------------- | ---------------------------------- |
| 인라인 에러      | 폼 입력값 유효성 오류 (BR-06)               | `<FormMessage>` (react-hook-form)  |
| 토스트 (warning) | 재시도 가능한 오류 (네트워크·Rate Limit)    | shadcn/ui `<Toaster>` — 우하단 5초 |
| 토스트 (error)   | 즉각 해결 불가한 오류 (서버 오류·권한 없음) | shadcn/ui `<Toaster>` — 우하단 5초 |
| 모달             | 되돌릴 수 없는 삭제 확인 (아래 4-3 참조)    | shadcn/ui `<AlertDialog>`          |

> **원칙**: 인라인 에러와 토스트를 동시에 표시하지 않는다. 폼 오류는 인라인, 시스템 오류는 토스트.

### 4-3. 성공 피드백

| 액션                               | 토스트 메시지                                                                              | 정의 위치                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 지침 저장 성공                     | "지침이 저장되었습니다."                                                                   | 05-usecase-지침관리 참조                               |
| 지침 삭제 성공                     | "지침이 삭제되었습니다."                                                                   | 05-usecase-지침관리 참조                               |
| 콘텐츠 복사 성공                   | "클립보드에 복사되었습니다."                                                               | 04-usecase-콘텐츠생성 참조                             |
| AI 초안 생성 완료                  | "초안 생성이 완료되었습니다."                                                              | 04-usecase-콘텐츠생성 참조                             |
| 이력 삭제 성공 **(P2)**            | "이력이 삭제되었습니다."                                                                   | [06-usecase-콘텐츠이력](06-usecase-콘텐츠이력.md) 참조 |
| 버전 스냅샷 저장 성공 **(P2)**     | "버전이 저장되었습니다."                                                                   | [06-usecase-콘텐츠이력](06-usecase-콘텐츠이력.md) 참조 |
| 버전 복원 성공 **(P2)**            | "버전 v{N}으로 복원되었습니다. 직전 본문은 새 버전으로 저장되었습니다."                    | [06-usecase-콘텐츠이력](06-usecase-콘텐츠이력.md) 참조 |
| 버전 동일 안내 **(P2)**            | "이미 해당 버전 상태입니다." (warning)                                                     | [06-usecase-콘텐츠이력](06-usecase-콘텐츠이력.md) 참조 |
| 번역 생성 완료 **(P2)**            | "{언어명} 번역이 완료되었습니다."                                                          | [07-usecase-다국어번역](07-usecase-다국어번역.md) 참조 |
| 번역 삭제 성공 **(P2)**            | "번역본이 삭제되었습니다."                                                                 | [07-usecase-다국어번역](07-usecase-다국어번역.md) 참조 |
| 조직 생성 성공 **(P3)**            | "조직 '{name}'이(가) 생성되었습니다."                                                      | [08-usecase-조직관리](08-usecase-조직관리.md) 참조     |
| 멤버 초대 발송 성공 **(P3)**       | "{email}로 초대 메일을 발송했습니다."                                                      | [08-usecase-조직관리](08-usecase-조직관리.md) 참조     |
| 역할 변경 성공 **(P3)**            | "{email}의 역할이 {role}로 변경되었습니다."                                                | [08-usecase-조직관리](08-usecase-조직관리.md) 참조     |
| 조직 삭제 성공 **(P3)**            | "조직이 삭제 예정 상태로 전환되었습니다 · 30일 내 복원 가능합니다."                        | [08-usecase-조직관리](08-usecase-조직관리.md) 참조     |
| 조직 복원 성공 **(P3)**            | "조직이 복원되었습니다."                                                                   | [08-usecase-조직관리](08-usecase-조직관리.md) 참조     |
| 결제 성공 **(P3)**                 | "{plan} 플랜이 활성화되었습니다."                                                          | [09-usecase-결제](09-usecase-결제.md) 참조             |
| 가상계좌 입금 대기 **(P3)**        | "가상계좌가 발급되었습니다 · 입금이 확인되면 자동으로 활성화됩니다." (info)                | [09-usecase-결제](09-usecase-결제.md) 참조             |
| 구독 해지 예약 성공 **(P3, v1.3)** | "구독 해지가 예약되었습니다 · {date}까지 Pro 기능을 사용할 수 있습니다 · [해지 예약 취소]" | [09-usecase-결제 UC-31](09-usecase-결제.md) 참조       |
| 해지 예약 취소 성공 **(P3, v1.3)** | "해지 예약이 취소되었습니다 · 구독이 정상 유지됩니다."                                     | [09-usecase-결제 UC-38](09-usecase-결제.md) 참조       |
| 환불 요청 접수 **(P3)**            | "환불 요청이 접수되었습니다 · 관리자 승인 후 처리됩니다."                                  | [09-usecase-결제](09-usecase-결제.md) 참조             |
| Agent 생성 성공 **(P3)**           | "Agent '{name}'이(가) 생성되었습니다."                                                     | [10-usecase-에이전트](10-usecase-에이전트.md) 참조     |
| Agent 즉시 실행 시작 **(P3)**      | "Agent 실행을 시작했습니다 · 완료까지 1~3분 소요됩니다."                                   | [10-usecase-에이전트](10-usecase-에이전트.md) 참조     |
| Agent 실행 완료 **(P3)**           | "Agent가 콘텐츠를 생성했습니다 · [확인하기]"                                               | [10-usecase-에이전트](10-usecase-에이전트.md) 참조     |

> 모든 성공 토스트: shadcn/ui `<Toaster>` — 우하단, 5초 자동 닫힘.

### 4-4. 확인 다이얼로그 (AlertDialog)

**사용 기준**: DB에서 영구 삭제되는 작업에만 표시한다. 저장·수정·기본 지침 변경은 다이얼로그 없이 즉시 처리.

| 대상 작업                                 | 다이얼로그 사용 여부                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| 지침 삭제                                 | ✅ 사용                                                                                  |
| 생성 이력 삭제 (Phase 2)                  | ✅ 사용                                                                                  |
| 버전 복원 (Phase 2)                       | ✅ 사용 — 본문에 BR-19 안전장치 안내 ("직전 본문은 새 버전으로 저장됩니다") 포함         |
| 번역 덮어쓰기 (Phase 2)                   | ✅ 사용 — BR-23 (`force=true`) 재요청 전 사용자 확인                                     |
| 번역 삭제 (Phase 2)                       | ✅ 사용                                                                                  |
| 번역 quota 안내 (Phase 2)                 | ℹ️ 단순 안내 모달 (`<Dialog>`) — `AlertDialog` 아님, BR-21에 따라 1회만                  |
| 지침 저장·수정                            | ❌ 미사용                                                                                |
| 기본 지침 변경                            | ❌ 미사용                                                                                |
| 조직 삭제 (Phase 3)                       | ✅ 사용 — slug 입력 확인 + BR-31 30일 grace 안내 강조                                    |
| 조직 복원 (Phase 3)                       | ✅ 사용 — "{name}을 복원하시겠습니까?" 간단 확인                                         |
| 멤버 제거 (Phase 3)                       | ✅ 사용 — [usecase-common §4-4](#4-4-확인-다이얼로그-alertdialog) 공통 패턴              |
| 역할 변경 — admin → member 강등 (Phase 3) | ✅ 사용 — "마지막 admin은 강등 불가" 분기 안내 포함                                      |
| 구독 해지 예약 (Phase 3, v1.3)            | ✅ 사용 — `current_period_end`까지 사용 가능 + "결제일 전 언제든 취소 가능" 안내 (BR-38) |
| 해지 예약 취소 (Phase 3, v1.3)            | ❌ 미사용 — 단순 토스트로 즉시 처리 (UC-38)                                              |
| 결제 환불 요청 (Phase 3)                  | ✅ 사용 — 환불 예상액 + 관리자 승인 안내                                                 |
| 플랜 한도 초과 모달 (Phase 3, BR-32)      | ℹ️ `<Dialog>` (AlertDialog 아님) — 사용량 차트 + 업그레이드 CTA                          |
| Agent 삭제 (Phase 3)                      | ✅ 사용 — "실행 이력은 30일 보관 후 자동 삭제" 안내                                      |
| Agent 즉시 실행 확인 (Phase 3)            | ℹ️ `<Dialog>` — "이번 달 quota N회 남음" 안내 (선택적)                                   |

**공통 다이얼로그 구조**:

```
제목: "정말 삭제하시겠습니까?"
본문: "{삭제 대상}을 삭제하면 복구할 수 없습니다."   ← 기능별 Usecase에서 구체화
버튼: [취소 (secondary)] [삭제 (destructive)]
```

### 4-5. Empty State 패턴

| 페이지                            | 조건                                | 표시 내용                                                                            |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `/dashboard`                      | 지침 0개                            | "먼저 AI 지침을 등록해보세요" + "지침 등록하기" CTA                                  |
| `/guidelines`                     | 지침 0개                            | "첫 번째 AI 지침을 등록해보세요" + "+" 버튼 안내                                     |
| `/history` (Phase 2)              | 이력 0개                            | "아직 생성한 콘텐츠가 없습니다" + "생성 시작" CTA                                    |
| `/history/[id]/versions` **(P2)** | 버전 0개                            | "아직 저장된 버전이 없습니다. 본문을 편집하면 자동으로 버전이 쌓입니다."             |
| `/history/[id]` 번역 탭 **(P2)**  | 해당 언어 번역 없음                 | "{언어명} 번역본이 없습니다." + "번역하기" CTA (→ UC-20 모달 진입)                   |
| `/org` **(P3)**                   | 1개 조직만 보유 (Personal Org 단독) | "추가 조직이 없습니다 — 팀 협업이 필요하면 새 조직을 만들어보세요" + "+ 새 조직" CTA |
| `/org/[id]/members` **(P3)**      | 멤버 본인만 (초대 발송 X)           | "아직 멤버가 없습니다" + "+ 멤버 초대" CTA                                           |
| `/billing/payments` **(P3)**      | 결제 이력 0건                       | "아직 결제 이력이 없습니다"                                                          |
| `/agents` (Free 플랜) **(P3)**    | BR-32 max_agents=0                  | "AI Agent는 Pro 플랜부터 사용 가능합니다" + "업그레이드" CTA → `/billing`            |
| `/agents` (Pro+ 미생성) **(P3)**  | Agent 0개                           | "첫 번째 Agent를 만들어 자동 글쓰기를 시작해보세요" + "+ 새 Agent" CTA               |
| `/agents/[id]/runs` **(P3)**      | 실행 이력 0건                       | "아직 실행된 적이 없습니다 · [즉시 실행]으로 테스트해보세요"                         |

---

## 5. 공통 사전 조건 (Common Preconditions)

### 5-1. 인증 필요 기능의 공통 선행 조건

모든 인증 필요 기능(`/dashboard/**` 내 기능)은 아래 조건이 모두 충족된 상태에서 시작한다.

| #     | 사전 조건                     | 미충족 시 처리                            |
| ----- | ----------------------------- | ----------------------------------------- |
| PC-01 | `User`가 Clerk 인증 완료 상태 | BR-02 적용 → `/sign-in?redirect=요청경로` |
| PC-02 | Clerk JWT가 만료되지 않음     | 세션 만료 예외 처리 (3-2 참조)            |
| PC-03 | 네트워크 연결이 정상 상태     | 네트워크 오류 예외 처리 (3-1 참조)        |
| PC-04 | Neon DB 연결 정상             | 서버 오류 예외 처리 (3-1 참조)            |

### 5-2. 데이터 접근 공통 선행 조건

| #     | 사전 조건                                                    | 상세                          |
| ----- | ------------------------------------------------------------ | ----------------------------- |
| PC-05 | 요청 대상 리소스가 존재함                                    | 존재하지 않으면 404 예외 처리 |
| PC-06 | 요청 대상 리소스의 `user_id`가 현재 `User`의 `userId`와 일치 | 불일치 시 403 예외 처리       |

---

## 6. 공통 참조 정보

### 6-1. 용어 정의

| 용어                        | 정의                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 지침                        | 브랜드 톤·문체·금지 표현 등 AI 생성에 적용되는 사용자 등록 규칙 (`guidelines` 테이블)                                                                                                   |
| 초안                        | AI가 생성한 마크다운 형식의 블로그 글 (`contents` 테이블의 `body`)                                                                                                                      |
| 기본 지침                   | `is_default=true`인 지침. 콘텐츠 생성 시 별도 선택 없이 자동 적용됨.                                                                                                                    |
| 생성 이력                   | 과거에 생성된 콘텐츠 목록 (`contents` 테이블 전체)                                                                                                                                      |
| 버전 **(P2)**               | 특정 시점의 본문 스냅샷 (`content_versions` 1행). `version_no`는 콘텐츠 단위로 1부터 증가.                                                                                              |
| 현재 버전 **(P2)**          | `contents.body`와 동일한 스냅샷. 버전 목록에서 "현재" Badge로 표시.                                                                                                                     |
| 원문 언어 **(P2)**          | 콘텐츠 생성 시점의 본문 언어 (`contents.source_lang`, 기본 `'ko'`).                                                                                                                     |
| 번역본 **(P2)**             | 원문 외 언어로 생성된 마크다운 (`content_translations.translated_body`). 콘텐츠+언어당 최대 1개.                                                                                        |
| 조직 **(P3)**               | 콘텐츠·지침·Agent·구독의 소유 단위 (`organizations` 1행). Clerk Organization과 1:1 매핑.                                                                                                |
| Personal Org **(P3)**       | 가입 시 자동 생성되는 본인 전용 조직 (`is_personal=true`). 멤버 초대·삭제 불가. (BR-31)                                                                                                 |
| 활성 조직 **(P3)**          | 현재 사용자가 작업 중인 조직 (`auth().orgId` 또는 `users.default_organization_id`). Sidebar OrganizationSwitcher로 전환.                                                                |
| 빌링키 **(P3)**             | 카드 정보를 토큰화한 키. 첫 결제 시 Toss로부터 발급받아 AES-256-GCM 암호화하여 `subscriptions.billing_key_encrypted`에 저장. 매월 정기결제 cron이 사용.                                 |
| customerKey **(P3)**        | Toss 고객 식별자. 사용자별 영구 UUID 1회 발급 (`users.payment_customer_key`). 모든 결제·빌링키 발급에서 재사용. (BR-35-e)                                                               |
| 주문 (Order) **(P3)**       | 결제 1건의 트랜잭션 단위 (`orders` 1행, id=Toss orderId VARCHAR(64)). `kind`로 신규 구독·정기결제·플랜 변경 구분. 11개 내부 상태로 전이.                                                |
| 11개 내부 상태 **(P3)**     | toss-quickstart 정의: `ORDER` → `AUTH_READY` → `AUTH_SUCCESS` → `PAY_SUCCESS`/`PAY_WAITING`/`PAY_FAIL`/`PAY_EXPIRED`/`PAY_CANCELED`/`PAY_CANCELED_PARTIAL` + `AUTH_CANCEL`/`AUTH_FAIL`. |
| past_due 상태 **(P3)**      | 정기결제 실패 후 3일 grace 진입 상태 (`subscriptions.status='past_due'`). 한도는 유지되며 즉시 재결제 가능. (BR-36)                                                                     |
| Agent **(P3)**              | 자율 블로그 작성 봇 (`agent_jobs` 1행). `cron_expression`에 따라 자동 실행되거나 수동 트리거 가능. Function Calling으로 도구를 자율 호출.                                               |
| 도구 (Tool) **(P3)**        | Agent가 호출하는 기능 단위 (`agent_tools` 레지스트리). topic_picker·content_writer·platform_publisher 3종 표준 정의.                                                                    |
| 도구 호출 트레이스 **(P3)** | 한 Agent 실행(`agent_run`) 동안 발생한 모든 도구 호출 이력 (`agent_tool_calls` N행). UI에 시간순 카드로 노출.                                                                           |

### 6-2. 공통 참조 문서

| 문서   | 참조 목적                                   |
| ------ | ------------------------------------------- |
| PRD.md | 핵심 기능(F1·F2·F3) 정의, 타겟 사용자       |
| TRD.md | API 엔드포인트, DB 스키마, 기술 스택        |
| IA.md  | 페이지명, URL 구조, 네비게이션, 디자인 방향 |

### 6-3. UC별 핵심 기술 문서

각 Usecase 작성·구현 시 아래 기술 문서를 반드시 함께 참조한다.

| UC 그룹                            | 핵심 기술 문서                                            | 참조 이유                                                                                                              |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| UC-01 랜딩                         | `docs/tech/shadcn.md`, `docs/design/design_guide-web.md`  | 컴포넌트 조합, Aceternity UI·Magic UI 사용 패턴                                                                        |
| UC-02~05 인증                      | `docs/tech/clerk.md`                                      | Clerk Elements 커스텀 UI, 미들웨어 설정, JWT 검증                                                                      |
| UC-06 대시보드                     | `docs/tech/neon.md`, `docs/framework/Nextjs.md`           | Neon 연결, Server Component 데이터 페칭 패턴                                                                           |
| UC-07~09 콘텐츠 생성               | `docs/tech/gemini_tech.md`, `docs/tech/neon.md`           | Gemini 스트리밍 API, 생성 결과 DB 저장                                                                                 |
| UC-10~14 지침 관리                 | `docs/tech/neon.md`, `docs/framework/Nextjs.md`           | CRUD API(Hono), Neon ORM 패턴                                                                                          |
| UC-15~19 콘텐츠 이력 **(P2)**      | `docs/tech/neon.md`                                       | `content_versions` 스키마, 복원 트랜잭션(BR-19), 100KB 제한(BR-20)                                                     |
| UC-20~22 다국어 번역 **(P2)**      | `docs/tech/gemini_tech.md`, `docs/tech/neon.md`           | Gemini 번역 프롬프트, 마크다운 구조 보존, `content_translations` UNIQUE 제약                                           |
| UC-23~27 조직 관리 **(P3)**        | `docs/tech/clerk.md`, `docs/tech/neon.md`                 | Clerk Organizations + Webhook 동기화, Personal Org 자동 생성 (BR-31), 30일 grace soft delete                           |
| UC-28~33 결제 **(P3)**             | `docs/quickstart/toss-quickstart.md`, `docs/tech/toss.md` | 11상태 주문·`tossRequest` 래퍼·DB amount 가드·빌링키 정기결제·webhook 멱등성 (BR-35·36·37)                             |
| UC-34~37 AI Agent **(P3, v1.4.1)** | `docs/tech/gemini_tech.md`                                | Gemini Function Calling API, `agent_tools` 레지스트리, **QStash Schedule 디스패처 15분 통일**, cron 최소 1시간 (BR-33) |

---

## 7. Usecase Common 검토 체크리스트

- [x] 서비스에 등장하는 모든 행위자가 정의되어 있는가? (Visitor, User, System)
- [x] 공통 비즈니스 규칙이 누락 없이 정의되어 있는가? (BR-01 ~ BR-17)
- [x] 네트워크 오류·세션 만료·권한 없음·서버 오류 공통 예외가 정의되어 있는가?
- [x] 공통 UI 패턴(로딩·에러·성공·다이얼로그·Empty State)이 정의되어 있는가?
- [x] 공통 사전 조건(PC-01 ~ PC-06)이 정의되어 있는가?
- [x] 특정 기능에만 해당하는 내용이 포함되지 않았는가? (SSOT 준수)
  - AI Rate Limit 토스트 → 04-usecase-콘텐츠생성 참조 표기
  - 지침 삭제 모달 본문 → 05-usecase-지침관리 참조 표기
  - 버전 복원·번역 모달 본문 → 06/07-usecase 참조 표기 **(P2)**
- [x] **(P2)** UC-15~22가 모두 UC-00 목록에 등록되어 있는가?
- [x] **(P2)** BR-18~24가 정의되어 있고 각 UC가 참조 가능한가?
- [x] **(P2)** 번역 quota 메시지·LocalStorage 키가 BR-21에 단일 정의되었는가? (TRD·IA·usecase 중복 금지)
- [x] **(P2)** 지원 언어가 한국어(`ko`)·영어(`en`) 두 가지로 BR-22에 명시되었는가?
- [x] **(P3)** UC-23~37이 모두 UC-00 목록에 등록되었는가? 신규 행위자 `Member`·`Admin`·`SystemAdmin`이 정의되었는가?
- [x] **(P3)** BR-31~37이 정의되었고 각 UC가 참조할 수 있는가? (Personal Org·플랜 한도·cron 간격·지침 공유·Toss 보안·past_due grace·Webhook 멱등성)
- [x] **(P3)** 토스트·다이얼로그·Empty State 표에 조직·결제·Agent 관련 항목이 추가되었는가?
- [x] **(P3)** 예외 처리 일람에 402(quota 초과)·403 FORBIDDEN_ROLE·400 PERSONAL_ORG_PROTECTED가 추가되었는가?
- [x] **(v1.3)** Team 플랜이 제거되고 Free/Pro 2종으로 정리되었는가? (BR-32 + BR-구독결제.md SSOT)
- [x] **(v1.3)** BR-38 해지 예약 정책·BR-39 빌링키 파기 정책이 정의되었고 UC-31·38이 연계되어 있는가?
- [x] **(v1.3)** BR-37 멱등성에 QStash `Upstash-Message-Id`가 추가되었는가? BR-36 재시도 정책이 "일시적 오류만 재시도, 영구 실패는 past_due"로 명확화되었는가?
- [x] **(v1.3)** UC-39 시스템 cron 대시보드(SystemAdmin 전용)가 인덱스에 등록되었는가?
- [x] **(v1.4.1)** BR-31에 Personal Org 중복 생성 방지 3중 방어(부분 unique index + advisory_lock + Clerk idempotency_key)가 명시되었는가?
- [x] **(v1.4.1)** BR-33 cron 간격이 "15분 통일"로 단순화되었는가?
- [x] **(v1.4.1)** BR-38에 해지 예약 취소 트랜잭션 락 + `next_billing_at` 보정 정책이 추가되었는가?
