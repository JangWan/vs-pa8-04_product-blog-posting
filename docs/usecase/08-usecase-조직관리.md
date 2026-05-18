# Usecase — 조직(팀) 관리 (Phase 3)

> UC-23~27 | 작성일: 2026-05-17 | 최종 갱신: 2026-05-18 (BR-03 SSOT 반영)
> 참조: **[BR-03 조직 관리 SSOT](../BR-조직관리.md)** · [PRD.md](../PRD.md) · [IA.md](../IA.md) · [TRD.md](../TRD.md) · [SRS.md](../SRS.md) · [usecase-common.md](usecase-common.md)
>
> ⚠️ **본 UC의 비즈니스 정책은 [BR-03](../BR-조직관리.md)을 단일 진실 공급원(SSOT)으로 따른다.** BR과 본 UC가 충돌할 경우 BR이 우선한다.

---

## 1. 개요

| UC    | 기능명                  | 한 줄 설명                                                     | 관련 URL/액션         |
| ----- | ----------------------- | -------------------------------------------------------------- | --------------------- |
| UC-23 | 조직 생성               | 새 조직을 생성하고 생성자는 자동으로 `org:admin` 역할을 가진다 | `/org/new`            |
| UC-24 | 멤버 초대               | 이메일로 멤버를 초대하고 역할(admin/member)을 부여한다         | `/org/[id]/members`   |
| UC-25 | 역할 변경·멤버 제거     | 멤버의 역할을 변경하거나 조직에서 제거한다                     | `/org/[id]/members`   |
| UC-26 | 조직 삭제 (soft delete) | 조직을 30일 grace 상태로 전환하고, 이후 cron이 완전 삭제한다   | `/org/[id]` 위험 영역 |
| UC-27 | 조직 복원               | 30일 grace 내 삭제 예정 조직을 복원한다                        | `/org` 카드 [복원]    |

**관련 행위자**: `User`, `Admin`, `Member`, `System` (Clerk Organizations · Webhook · Neon DB)  
**[PRD](../PRD.md) 매핑**: [추가 제안 기능 §4](../PRD.md#4-추가-제안-기능-향후-로드맵) "조직(팀) 관리"  
**[SRS](../SRS.md) 매핑**: §1 조직(팀) 관리 및 멀티 테넌시 + §3 BR-31 (Personal Org · 30일 grace · 조직 소유권)  
**[TRD](../TRD.md) 매핑**: [§3-3](../TRD.md#3-3-데이터베이스-설계-방향) `organizations`·`organization_members` 테이블 / [§3-4](../TRD.md#3-4-api-설계) `/api/org/**` 9개 엔드포인트 / [§3-5](../TRD.md#3-5-인증-및-권한-관리) Clerk Organizations + RBAC 미들웨어

> **Personal Org 자동 생성은 본 UC가 아닌 회원가입(UC-02) 후속 시스템 동작이다.** BR-31에 정의되며, 본 문서 §4-1에서 흐름만 참고.

---

## 2. 사전 조건

- **공통 사전 조건**: [usecase-common.md §5](usecase-common.md#5-공통-사전-조건-common-preconditions) 참조 (PC-01~04)
- **UC-23 (조직 생성)**: 추가 제한 없음. 모든 로그인 `User`가 무제한 생성 가능 (Free 플랜으로 시작).
- **UC-24~26 (멤버·삭제)**: 현재 활성 조직의 `org:admin` 역할일 것. `Member`에게는 사이드바 메뉴 자체가 숨겨지므로 도달 불가 (Phase 3 가시성 규칙).
- **UC-24 추가**: 활성 조직의 `plan`별 멤버 한도(BR-32)에 여유가 있을 것. Free=1 / Pro=3. (Team은 Phase 4로 이연)
- **UC-26 추가**: 활성 조직이 `is_personal=false`일 것. Personal Org는 삭제 불가 (BR-31).
- **UC-27 추가**: 대상 조직이 `deleted_at IS NOT NULL` && `deleted_at + 30일 > now()`일 것.

---

## 3. 정상 흐름

### UC-23 — 조직 생성

| 단계 | 행동 주체 | 내용                                                                                                                                                                                                                                       |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `User`    | Sidebar `<OrganizationSwitcher>` 또는 `/org` → [+ 새 조직] 클릭.                                                                                                                                                                           |
| 2    | 시스템    | `/org/new` 페이지 진입. 폼 표시: 조직명 (필수, 최대 80자) + slug (자동 생성, 수정 가능).                                                                                                                                                   |
| 3    | `User`    | 조직명 입력 → [생성] 클릭.                                                                                                                                                                                                                 |
| 4    | 시스템    | `POST /api/org { name, slug? }`. 서버: ① Clerk Organization API로 신규 조직 생성 ② `organizations` INSERT (`is_personal=false`, `plan='free'`, `owner_user_id=현재 User`) ③ `organization_members` INSERT (role='admin', invited_by=NULL). |
| 5    | 시스템    | 응답 수신 → `users.default_organization_id` UPDATE → 활성 조직 컨텍스트 전환. "조직 '{name}'이(가) 생성되었습니다." 토스트 ([usecase-common §4-3](usecase-common.md#4-3-성공-피드백)).                                                     |
| 6    | 시스템    | `/dashboard`로 리다이렉트. Sidebar OrganizationSwitcher 갱신 + caption "조직 내 모든 멤버가 지침·콘텐츠를 공유합니다" (BR-34).                                                                                                             |

### UC-24 — 멤버 초대

| 단계 | 행동 주체         | 내용                                                                                                                                                                               |
| ---- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `Admin`           | `/org/[id]/members`에서 [+ 멤버 초대] 클릭.                                                                                                                                        |
| 2    | 시스템            | 초대 모달 표시 (`<Dialog>`): 이메일 입력 + 역할 RadioGroup (admin / member, 기본 member) + 안내 "현재 N/{한도}명 가입 중". 한도 도달 시 폼 disabled + "플랜 업그레이드 필요" 안내. |
| 3    | `Admin`           | 이메일·역할 입력 → [초대 발송] 클릭.                                                                                                                                               |
| 4    | 시스템            | `POST /api/org/:id/members/invitations { email, role }`. 서버: Clerk Invitations API 호출 → 초대 이메일 자동 발송.                                                                 |
| 5    | 시스템            | 성공 응답 → 모달 닫힘 + "{email}로 초대 메일을 발송했습니다." 토스트. 멤버 표 상단에 "보류 중 초대" 행 추가 (만료일·[재발송]·[취소]).                                              |
| 6    | (초대받은 사용자) | 이메일 링크 클릭 → Clerk SignIn/SignUp 흐름 → 조직 자동 가입.                                                                                                                      |
| 7    | 시스템            | Clerk Webhook(`organizationMembership.created`) 수신 → `organization_members` INSERT (role, invited_by=초대자). UI는 다음 조회 시 멤버 표에 신규 행 노출.                          |

### UC-25 — 역할 변경·멤버 제거

| 단계 | 행동 주체      | 내용                                                                                                                                                                            |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `Admin`        | 멤버 표에서 역할 Dropdown 클릭 → admin/member 토글.                                                                                                                             |
| 2    | 시스템         | admin → member 강등 시: `<AlertDialog>` "{email}을 member로 변경하시겠습니까?" + 차단 분기 검증. 동일 admin → admin 또는 member → admin은 모달 없이 즉시 처리.                  |
| 3    | `Admin`        | [변경] 클릭.                                                                                                                                                                    |
| 4    | 시스템         | `PATCH /api/org/:id/members/:userId { role }`. 마지막 admin을 강등하는 요청이면 서버가 400 + `error_code='LAST_ADMIN'` 반환 → 인라인 에러 "마지막 관리자는 강등할 수 없습니다". |
| 5    | 시스템         | 성공 시: Clerk 역할 동기화 → `organization_members` UPDATE → "{email}의 역할이 {role}로 변경되었습니다." 토스트.                                                                |
| 6    | `Admin` (제거) | 멤버 행의 [제거] 클릭.                                                                                                                                                          |
| 7    | 시스템         | `<AlertDialog>` ([usecase-common §4-4](usecase-common.md#4-4-확인-다이얼로그-alertdialog)): "{email}을 조직에서 제거하시겠습니까? · 해당 멤버는 즉시 접근 권한을 잃습니다."     |
| 8    | `Admin`        | [제거] 클릭.                                                                                                                                                                    |
| 9    | 시스템         | `DELETE /api/org/:id/members/:userId`. Clerk 멤버십 제거 → `organization_members` DELETE → "멤버가 제거되었습니다." 토스트.                                                     |

### UC-26 — 조직 삭제 (soft delete, 30일 grace)

| 단계 | 행동 주체 | 내용                                                                                                                                                                                                                                                                                                                               |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `Admin`   | `/org/[id]` → [일반] 탭 → 위험 영역 [조직 삭제] 클릭. (Personal Org면 버튼 자체가 disabled — 본 흐름 진입 불가)                                                                                                                                                                                                                    |
| 2    | 시스템    | `<AlertDialog>` 표시 (강화 패턴): 제목 "정말 삭제하시겠습니까?" / 본문 BR-31 안내 강조 — "삭제 후 **30일 내에는 복원 가능**하며, 30일 경과 시 이 조직의 모든 콘텐츠·지침·Agent·결제 이력이 영구 삭제됩니다." / **slug 입력 확인** (텍스트 인풋에 정확히 slug 타이핑) / 버튼 [취소] [삭제하기(destructive, slug 일치 시에만 활성)]. |
| 3    | `Admin`   | slug 정확히 입력 → [삭제하기] 클릭.                                                                                                                                                                                                                                                                                                |
| 4    | 시스템    | `DELETE /api/org/:id`. 서버 동작: ① `organizations.deleted_at = now()` UPDATE (hard delete 아님) ② 활성 구독이 있으면 즉시 cancel 처리 (`current_period_end`까지는 사용 가능, BR-36 분리) ③ 해당 조직의 `agent_jobs.is_active=false` UPDATE (자동 실행 즉시 중지).                                                                 |
| 5    | 시스템    | 활성 조직이 삭제 대상이었다면 `users.default_organization_id`를 Personal Org로 자동 전환 후 `/org`로 리다이렉트. "조직이 삭제 예정 상태로 전환되었습니다 · 30일 내 복원 가능합니다." 토스트.                                                                                                                                       |

### UC-27 — 조직 복원

| 단계 | 행동 주체 | 내용                                                                                                                                                                |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `Admin`   | `/org` 목록에서 `[삭제 예정 N일]` amber 뱃지가 붙은 카드의 [복원] 클릭.                                                                                             |
| 2    | 시스템    | `<AlertDialog>`: "{name}을 복원하시겠습니까? · 모든 데이터가 즉시 복구됩니다." + [취소] [복원하기].                                                                 |
| 3    | `Admin`   | [복원하기] 클릭.                                                                                                                                                    |
| 4    | 시스템    | `POST /api/org/:id/restore`. 서버: `organizations.deleted_at = NULL` UPDATE → 활성 구독은 별도 사용자 액션 필요(자동 재활성화 X) → "조직이 복원되었습니다." 토스트. |
| 5    | 시스템    | 카드 amber 뱃지 제거. [관리]·[전환] 버튼 정상 노출.                                                                                                                 |

---

## 4. 대안 흐름

### 4-1. Personal Org 자동 생성 (UC-02 가입 직후 시스템 동작 — BR-31 참조, v1.4.1 갱신)

> 본 UC의 직접 시나리오는 아니지만, 모든 UC-23~27의 전제이므로 흐름을 기록.  
> **레이스 컨디션 방어**: Webhook 처리(1~2초 지연 가능)와 사용자의 즉시 페이지 진입에 따른 미들웨어 보상 트랜잭션이 동시 실행될 수 있음. 3중 방어로 중복 생성 차단.

| 단계 | 행동 주체 | 내용                                                                                                                                                                                                          |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------- |
| 1    | `System`  | Clerk `user.created` Webhook 수신 → `users` UPSERT (`clerk_user_id` UNIQUE, `plan='free'`).                                                                                                                   |
| 2    | `System`  | `users.payment_customer_key = UUID v4` 생성·저장 (없을 때만, Toss customerKey 영구 발급, BR-35-e).                                                                                                            |
| 3    | `System`  | **단일 트랜잭션 시작** + `pg_advisory_xact_lock(hashtext('personal_org:'                                                                                                                                      |     | clerk_user_id))` — 동일 user에 대한 동시 진입 직렬화. |
| 4    | `System`  | 락 획득 후 **재확인**: `organizations WHERE owner_user_id=:user_id AND is_personal=true AND deleted_at IS NULL` 조회. 이미 있으면 그 id로 단계 7만 실행 후 COMMIT (이미 생성된 케이스).                       |
| 5    | `System`  | 없으면 Clerk Organization API 호출 — `private_metadata.idempotency_key = "personal-{clerk_user_id}"` 포함 (Clerk 측에서도 중복 호출 방지). 응답으로 `clerk_org_id` 수신.                                      |
| 6    | `System`  | `organizations` INSERT (`clerk_org_id`, `is_personal=true`, `plan='free'`, `owner_user_id`) — **`ON CONFLICT DO NOTHING`** (마이그레이션 0009의 부분 unique index `WHERE is_personal=true`가 최종 DB 안전망). |
| 7    | `System`  | `organization_members` INSERT (role='admin', invited_by=NULL) + `users.default_organization_id = personal_org.id` UPDATE → COMMIT.                                                                            |
| 8    | `User`    | 다음 로그인 시 `/dashboard` 진입 → 활성 조직이 Personal Org로 자동 설정 → 정상 사용.                                                                                                                          |

**미들웨어 보상 트랜잭션** (User가 Webhook 처리 전 `/dashboard` 진입한 경우):

- 위 단계 3~7과 **동일한 트랜잭션 블록을 그대로 재실행**. 동일 advisory_lock 키 사용으로 Webhook과 직렬화. 부분 unique index가 마지막 안전망으로 중복 INSERT를 거부 → `ON CONFLICT DO NOTHING`로 우아하게 처리.

### 4-2. 보류 중 초대 — 재발송·취소 (UC-24)

| 단계 | 행동 주체 | 내용                                                                        |
| ---- | --------- | --------------------------------------------------------------------------- |
| 1    | `Admin`   | 멤버 표 "보류 중 초대" 행에서 [재발송] 클릭.                                |
| 2    | 시스템    | Clerk Invitations 재발송 API 호출. "초대 메일을 다시 보냈습니다." 토스트.   |
| 1'   | `Admin`   | [취소] 클릭.                                                                |
| 2'   | 시스템    | `<AlertDialog>`: "이 초대를 취소하시겠습니까?" → Clerk 초대 삭제 → 행 제거. |

### 4-3. 활성 조직 전환 (Sidebar OrganizationSwitcher)

| 단계 | 행동 주체 | 내용                                                                                                                              |
| ---- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `User`    | Sidebar 상단 OrganizationSwitcher Dropdown → 다른 조직 클릭.                                                                      |
| 2    | 시스템    | Clerk `setActive({ organization })` 호출 → JWT 갱신 → `users.default_organization_id` UPDATE (다음 로그인 시 자동 진입용).        |
| 3    | 시스템    | 페이지 전체 reload — 모든 페이지의 콘텐츠·지침·Agent가 새 조직 컨텍스트로 갱신. caption도 갱신 (Personal/일반/soft-deleted 분기). |

---

## 5. 예외 흐름

- **공통 예외** (네트워크·세션 만료·403·404·500): [usecase-common.md §3](usecase-common.md#3-공통-예외-처리-common-exception-handling) 참조

### 5-1. Personal Org 보호 위반 시도 (UC-24·26)

| 조건                                                                    | 처리                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_personal=true` 조직에 멤버 초대 시도 (URL 직접 호출 등 비정상 경로) | 400 + `error_code='PERSONAL_ORG_PROTECTED'` + "Personal Org는 보호된 공간입니다." 토스트. 정상 UI에서는 [+ 멤버 초대] 버튼 자체가 disabled. |
| `is_personal=true` 조직에 DELETE 요청                                   | 400 + 동일 error_code. 정상 UI에서는 [조직 삭제] 영역 자체가 disabled + 안내 문구.                                                          |

### 5-2. 멤버 한도 초과 (UC-24, BR-32)

| 조건                                                    | 처리                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 활성 조직 `plan`의 `max_members` 한도 도달 후 초대 시도 | 409 + `error_code='MEMBER_LIMIT_EXCEEDED'` + 모달 "현재 플랜의 멤버 한도({한도}명)에 도달했습니다." + [플랜 업그레이드 →] CTA → `/billing`. |

### 5-3. 마지막 admin 강등 시도 (UC-25)

| 조건                                                               | 처리                                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 조직의 admin이 1명뿐인데 본인 또는 해당 admin을 member로 강등 요청 | 400 + `error_code='LAST_ADMIN'` + 인라인 에러 "마지막 관리자는 강등할 수 없습니다 · 먼저 다른 멤버를 admin으로 승격하세요". |

### 5-4. soft-deleted 조직에서 쓰기 액션 시도

| 조건                                                                      | 처리                                                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deleted_at IS NOT NULL` 조직이 활성 컨텍스트일 때 멤버 초대·역할 변경 등 | 403 + `error_code='ORGANIZATION_DELETED'` + 페이지 상단 amber 배너 영구 노출 "이 조직은 N일 후 영구 삭제됩니다 · [복원하기]". 모든 쓰기 버튼 disabled + 툴팁. |

### 5-5. 30일 grace 경과 후 복원 시도 (UC-27)

| 조건                                                                         | 처리                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 사용자가 30일 경과 후에도 URL을 기억하고 복원 시도 (이미 cron이 hard delete) | 404 + "삭제된 조직을 복원할 수 없습니다." + `/org`로 리다이렉트. |

### 5-6. Clerk Webhook 일시 장애 (UC-23·24·25)

| 조건                                             | 처리                                                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk API 호출 성공했으나 Webhook DB 동기화 실패 | Clerk svix가 24시간 동안 자동 재시도. 그동안 사용자는 새로고침 시 UI에 반영 안 될 수 있음 → 다음 진입 시 자동 동기화. 운영자에게는 `webhook_events` 미수신 알림 트리거 (Phase 3 범위 외 — `SystemAdmin`이 모니터링). |

### 5-7. Personal Org 자동 생성 실패 (4-1, 보상 트랜잭션 — v1.4.1)

| 조건                                                                                      | 처리                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.created` Webhook 처리 중 Clerk Org 생성·DB INSERT 실패                              | 다음 `/dashboard` 진입 시 미들웨어가 `default_organization_id IS NULL` 감지 → 보상 트랜잭션으로 Personal Org 재시도 생성 (4-1과 **동일 advisory_lock 키** 사용으로 Webhook 재처리와 직렬화). Clerk 호출은 동일 `idempotency_key`로 기존 org 반환 가능 → 안전 재시도. 재시도도 실패하면 500 + 운영자 알림. |
| Webhook 처리와 미들웨어 보상이 **동시 진입** (가입 직후 즉시 페이지 진입 시 1~2초 윈도우) | advisory_lock으로 둘 중 하나만 진행 → 다른 쪽은 락 해제 후 단계 4 재확인에서 기존 행 발견 → 중복 INSERT 없이 종료. DB 부분 unique index가 최종 안전망                                                                                                                                                     |

---

## 6. 사후 조건

| UC                | DB 변경                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC-23 (조직 생성) | `organizations` INSERT (1행, `is_personal=false`, `plan='free'`) + `organization_members` INSERT (1행, role='admin') + `users.default_organization_id` UPDATE                                                                      |
| UC-24 (초대 발송) | Clerk Invitations 1건 발송 (DB 즉시 변경 없음 — 수락 후 Webhook으로 `organization_members` INSERT)                                                                                                                                 |
| UC-24 (초대 수락) | `organization_members` INSERT (1행, role=초대 시 지정, invited_by=초대자)                                                                                                                                                          |
| UC-25 (역할 변경) | `organization_members.role` UPDATE (Clerk 역할 동기화 후)                                                                                                                                                                          |
| UC-25 (멤버 제거) | `organization_members` DELETE (1행) — 해당 멤버가 생성한 콘텐츠·지침·Agent는 보존 (조직 소유)                                                                                                                                      |
| UC-26 (조직 삭제) | `organizations.deleted_at = now()` UPDATE (hard delete 아님) + 해당 조직의 `subscriptions.canceled_at·status='canceled'` UPDATE + `agent_jobs.is_active=false` UPDATE + 활성 컨텍스트였다면 `users.default_organization_id` 재설정 |
| UC-27 (조직 복원) | `organizations.deleted_at = NULL` UPDATE                                                                                                                                                                                           |
| (30일 cron 경과)  | `/api/cron/org/purge` 실행 → `organizations` DELETE → CASCADE로 `organization_members`·`contents`·`guidelines`·`agent_jobs`·`agent_runs`·`subscriptions`·`orders`·`payments` 전부 삭제 + Clerk Organization 삭제 동기화            |

---

## 7. UI/UX 고려사항

- **공통 UI 패턴**: [usecase-common.md §4](usecase-common.md#4-공통-ui-패턴-common-ui-patterns) 참조
- **모달·페이지 영역 정의**: [IA.md §6](../IA.md) `/org/**` 섹션
- **모션 정의**: [IA.md §7](../IA.md#7-인터랙션-패턴)

**조직 삭제 강화 AlertDialog (UC-26, BR-31)**

```
[제목] 정말 삭제하시겠습니까?
[본문] 삭제 후 30일 내에는 복원 가능합니다.
       30일 경과 시 이 조직의 모든 콘텐츠·지침·Agent·결제 이력이 영구 삭제됩니다.

       확인을 위해 조직 slug를 정확히 입력해주세요:
       [{slug} 표시]
       [____________________] ← 텍스트 인풋
[버튼] [취소]  [삭제하기]  ← slug 일치 시에만 활성
```

**조직 복원 AlertDialog (UC-27)**

```
[제목] 조직을 복원하시겠습니까?
[본문] '{name}'을(를) 복원합니다.
       콘텐츠·지침·Agent는 즉시 복구되지만,
       취소된 구독은 자동 재활성화되지 않습니다.
[버튼] [취소]  [복원하기]
```

**Personal Org 보호 안내 (UC-24·26 비활성 영역)**

| 위치                                          | 표시 내용                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/org/[id]/members` 헤더 (`is_personal=true`) | [+ 멤버 초대] 버튼 disabled + 툴팁 "Personal Org는 멤버 초대가 불가능합니다."            |
| `/org/[id]` 위험 영역 (`is_personal=true`)    | 영역 전체 회색 + 안내 "Personal Org는 삭제할 수 없습니다. 계정 삭제 시 자동 정리됩니다." |

**Soft-deleted 조직 배너 (5-4)**

| 위치                                             | 표시 내용                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 모든 페이지 상단 (활성 조직이 soft-deleted일 때) | amber 배너 영구 노출 — "이 조직은 {YYYY-MM-DD}에 영구 삭제됩니다 (N일 남음) · [복원하기]" |
| 쓰기 액션 (`/guidelines/new` 등)                 | 버튼 disabled + 툴팁 "삭제 예정 조직에서는 새 작업을 만들 수 없습니다."                   |

**Sidebar caption (활성 조직 컨텍스트 가시화)**

| 조직 타입          | caption                                                |
| ------------------ | ------------------------------------------------------ |
| `is_personal=true` | "이곳에서 작성한 지침·콘텐츠는 본인만 볼 수 있습니다"  |
| 일반 조직 (active) | "조직 내 모든 멤버가 지침·콘텐츠를 공유합니다" (BR-34) |
| soft-deleted       | (배너로 대체, caption 미표시)                          |

---

## 8. 데이터 요구사항

### API 엔드포인트 ([TRD §3-4](../TRD.md#3-4-api-설계) 단일 정의 참조)

| 메서드   | 엔드포인트                         | 용도                                            |
| -------- | ---------------------------------- | ----------------------------------------------- |
| `GET`    | `/api/org`                         | 내가 속한 조직 목록 (UC 진입점)                 |
| `POST`   | `/api/org`                         | UC-23 조직 생성                                 |
| `GET`    | `/api/org/:id`                     | UC-25·26 진입 시 조직 메타 조회                 |
| `PATCH`  | `/api/org/:id`                     | 조직명·slug 수정                                |
| `DELETE` | `/api/org/:id`                     | UC-26 soft delete                               |
| `POST`   | `/api/org/:id/restore`             | UC-27 복원 (※ 본 UC 추가, TRD §3-4에 등록 필요) |
| `GET`    | `/api/org/:id/members`             | UC-24·25 멤버 표                                |
| `POST`   | `/api/org/:id/members/invitations` | UC-24 초대 발송                                 |
| `PATCH`  | `/api/org/:id/members/:userId`     | UC-25 역할 변경                                 |
| `DELETE` | `/api/org/:id/members/:userId`     | UC-25 멤버 제거                                 |

### 입력·출력 스키마

- 모든 요청·응답 스키마는 **[TRD §3-4](../TRD.md#3-4-api-설계) "Phase 3 — 조직(팀) 관리 스키마"** 단일 정의를 따른다.
- 본 문서는 비즈니스 흐름·UX 규칙만 정의하고 스키마는 중복 정의하지 않는다 (SSOT).

---

## 9. 보안 및 권한

| 항목              | 내용                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 인증              | 전 엔드포인트 Clerk JWT 검증 필수 ([usecase-common BR-01·05](usecase-common.md#2-1-인증·권한-규칙))                                                          |
| 역할 검증         | `withOrganization` + `withAdminRole` 미들웨어 ([TRD §3-5](../TRD.md#3-5-인증-및-권한-관리)) — Member는 UC-23(자기 조직 생성)만 허용, UC-24~27은 Admin만 허용 |
| Personal Org 보호 | BR-31에 정의된 정책을 백엔드 미들웨어로 강제 — UI disabled에만 의존하지 않음                                                                                 |
| Soft delete 가드  | `deleted_at IS NOT NULL` 조직에서 쓰기 액션은 미들웨어가 일괄 차단 (5-4)                                                                                     |
| Webhook 신뢰성    | Clerk svix 서명 검증 + `webhook_events.event_id` UNIQUE 멱등성 (BR-37)                                                                                       |
| 마지막 admin 검증 | UC-25 강등 요청 시 서버에서 조직의 admin 수 카운트 후 1명이면 거부 (Race condition 대비 트랜잭션 SELECT FOR UPDATE)                                          |
