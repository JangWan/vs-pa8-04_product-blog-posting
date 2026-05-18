# 구현 진행 상태 — UC-23~27 조직 관리 (Phase 3)

> 시작일: 2026-05-18  
> 참조: docs/usecase/08-usecase-조직관리.md · docs/BR-조직관리.md · docs/TRD.md §3-3

---

## 사전 완료 사항

- ✅ Clerk Organizations 활성화
- ✅ Upstash QStash 프로젝트 생성 + 3개 시크릿 발급
- ✅ .env.local 환경변수 추가

---

## 구현 진행 상황

### 단계 1: DB 마이그레이션

| #   | 항목                                       | 상태       | 비고                                                                   |
| --- | ------------------------------------------ | ---------- | ---------------------------------------------------------------------- |
| 1-1 | `organizations` 테이블 Drizzle 스키마 정의 | 🔄 진행 중 | clerk_org_id, name, slug, owner_user_id, plan, is_personal, deleted_at |
| 1-2 | `organization_members` 테이블 Drizzle 정의 | ⏳ 대기    | organization_id, user_id, role, invited_by, joined_at                  |
| 1-3 | `users` 테이블 컬럼 추가                   | ⏳ 대기    | default_organization_id                                                |
| 1-4 | 마이그레이션 생성                          | ⏳ 대기    | `pnpm drizzle-kit generate` (사용자 실행)                              |
| 1-5 | 마이그레이션 실행                          | ⏳ 대기    | `pnpm drizzle-kit push` (사용자 실행)                                  |

### 단계 2: Clerk Webhook 확장

| #   | 항목                                  | 상태    | 비고                                    |
| --- | ------------------------------------- | ------- | --------------------------------------- |
| 2-1 | organization.created 이벤트 핸들러    | ⏳ 대기 | Clerk Org → organizations INSERT        |
| 2-2 | organizationMembership.created 핸들러 | ⏳ 대기 | organization_members INSERT             |
| 2-3 | organizationMembership.updated 핸들러 | ⏳ 대기 | organization_members UPDATE (role 변경) |
| 2-4 | organizationMembership.deleted 핸들러 | ⏳ 대기 | organization_members DELETE             |
| 2-5 | 멱등성 검증 (webhook_events)          | ⏳ 대기 | event_id UNIQUE                         |

### 단계 3: 백엔드 API

| #    | 메서드 | 엔드포인트                         | 상태    | UC                 |
| ---- | ------ | ---------------------------------- | ------- | ------------------ |
| 3-1  | GET    | `/api/org`                         | ⏳ 대기 | 진입점             |
| 3-2  | POST   | `/api/org`                         | ⏳ 대기 | UC-23 조직 생성    |
| 3-3  | GET    | `/api/org/:id`                     | ⏳ 대기 | 메타 조회          |
| 3-4  | PATCH  | `/api/org/:id`                     | ⏳ 대기 | 수정               |
| 3-5  | DELETE | `/api/org/:id`                     | ⏳ 대기 | UC-26 soft delete  |
| 3-6  | POST   | `/api/org/:id/restore`             | ⏳ 대기 | UC-27 복원         |
| 3-7  | GET    | `/api/org/:id/members`             | ⏳ 대기 | UC-24·25 멤버 목록 |
| 3-8  | POST   | `/api/org/:id/members/invitations` | ⏳ 대기 | UC-24 초대         |
| 3-9  | PATCH  | `/api/org/:id/members/:userId`     | ⏳ 대기 | UC-25 역할 변경    |
| 3-10 | DELETE | `/api/org/:id/members/:userId`     | ⏳ 대기 | UC-25 멤버 제거    |

### 단계 4: 미들웨어

| #   | 항목                         | 상태    | 비고                |
| --- | ---------------------------- | ------- | ------------------- |
| 4-1 | withOrganization 미들웨어    | ⏳ 대기 | 활성 조직 검증      |
| 4-2 | withAdminRole 미들웨어       | ⏳ 대기 | org:admin 역할 검증 |
| 4-3 | Personal Org 보호 (API 레벨) | ⏳ 대기 | 멤버 초대·삭제 차단 |

### 단계 5: 프론트엔드 페이지

| #   | URL                 | 상태    | 페이지명  | UC              |
| --- | ------------------- | ------- | --------- | --------------- |
| 5-1 | `/org`              | ⏳ 대기 | 조직 목록 | 진입점          |
| 5-2 | `/org/new`          | ⏳ 대기 | 조직 생성 | UC-23           |
| 5-3 | `/org/[id]`         | ⏳ 대기 | 조직 설정 | UC-26 위험 영역 |
| 5-4 | `/org/[id]/members` | ⏳ 대기 | 멤버 관리 | UC-24·25        |

### 단계 6: 프론트엔드 컴포넌트

| #   | 컴포넌트          | 상태    | 비고                  |
| --- | ----------------- | ------- | --------------------- |
| 6-1 | OrganizationCard  | ⏳ 대기 | 조직 카드 (목록용)    |
| 6-2 | OrganizationForm  | ⏳ 대기 | 생성/수정 폼          |
| 6-3 | MemberTable       | ⏳ 대기 | 멤버 표               |
| 6-4 | MemberInviteModal | ⏳ 대기 | 초대 모달             |
| 6-5 | DeleteOrgDialog   | ⏳ 대기 | 삭제 확인 (slug 입력) |
| 6-6 | RestoreOrgDialog  | ⏳ 대기 | 복원 확인             |

### 단계 7: TanStack Query 훅

| #    | 훅                     | 상태    | 비고        |
| ---- | ---------------------- | ------- | ----------- |
| 7-1  | useOrganizations       | ⏳ 대기 | 목록 조회   |
| 7-2  | useOrganization        | ⏳ 대기 | 단건 조회   |
| 7-3  | useCreateOrganization  | ⏳ 대기 | 생성        |
| 7-4  | useUpdateOrganization  | ⏳ 대기 | 수정        |
| 7-5  | useDeleteOrganization  | ⏳ 대기 | soft delete |
| 7-6  | useRestoreOrganization | ⏳ 대기 | 복원        |
| 7-7  | useMembersList         | ⏳ 대기 | 멤버 목록   |
| 7-8  | useInviteMember        | ⏳ 대기 | 초대        |
| 7-9  | useUpdateMemberRole    | ⏳ 대기 | 역할 변경   |
| 7-10 | useRemoveMember        | ⏳ 대기 | 제거        |

### 단계 8: 통합 테스트

| #   | 항목                  | 상태    | 비고                  |
| --- | --------------------- | ------- | --------------------- |
| 8-1 | `pnpm type-check`     | ⏳ 대기 | TS 타입 검증          |
| 8-2 | `pnpm build`          | ⏳ 대기 | 프로덕션 빌드         |
| 8-3 | `pnpm lint`           | ⏳ 대기 | ESLint 검사           |
| 8-4 | 개발 서버 수동 테스트 | ⏳ 대기 | 조직 CRUD + 멤버 관리 |

---

## 주요 규칙 (BR-03 SSOT)

### 조직 생성 (UC-23)

- Clerk Organization API 호출 → clerk_org_id 획득
- `organizations` INSERT (is_personal=false, plan='free', owner_user_id=현재 User)
- `organization_members` INSERT (role='admin', invited_by=NULL)
- `users.default_organization_id` UPDATE
- `/dashboard` 리다이렉트

### 멤버 초대 (UC-24)

- 활성 조직의 plan별 멤버 한도 검증 (Free=1 / Pro=3)
- Clerk Invitations API 호출 → 이메일 발송
- Webhook 수신 → `organization_members` INSERT
- Personal Org는 초대 불가 (400 PERSONAL_ORG_PROTECTED)

### 역할 변경·제거 (UC-25)

- admin → member 강등 시 마지막 admin 검증
- 마지막 admin이면 400 (LAST_ADMIN)
- 멤버 제거 시 콘텐츠·지침·Agent는 보존 (조직 소유)

### 조직 삭제 (UC-26, soft delete 30일 grace)

- Personal Org는 삭제 불가 (400)
- `organizations.deleted_at = now()`
- 활성 구독 즉시 cancel
- active agent_jobs는 is_active=false
- slug 입력 확인 (강화된 확인 절차)
- 활성 조직이었다면 Personal Org로 전환

### 조직 복원 (UC-27)

- `deleted_at IS NOT NULL` && `deleted_at + 30일 > now()` 검증
- `organizations.deleted_at = NULL`
- 구독은 자동 재활성화 X (사용자 액션 필요)

### 데이터 격리

- 모든 API: `auth().orgId` 필터 필수
- 타인 조직의 데이터 접근 시 404

---

## 다음 즉시 실행 작업

1. ✅ 진행 상태 파일 생성 (`progress-status-08-조직관리.md`)
2. 🔄 **DB 스키마 정의** (`src/db/schema.ts`)
   - `organizations` 테이블
   - `organization_members` 테이블
   - `users.default_organization_id` 컬럼 추가
3. 🔄 **Clerk Webhook 확장** (`src/app/api/webhooks/clerk/route.ts`)
4. 🔄 **API 엔드포인트 구현** (`src/features/org/backend/route.ts`)
5. 🔄 **프론트엔드 UI** (페이지 + 컴포넌트 + 훅)
6. 🔄 **통합 테스트** (타입 검증 + 빌드 + 수동 테스트)
