# 구현 진행 상태 — Phase 3 조직(팀) 관리 (UC-23~27)

> 시작일: 2026-05-18 | 완료일: 2026-05-18 | 참조: docs/usecase/08-usecase-조직관리.md

---

## 단계별 진행 상태

### 1단계: DB 마이그레이션 (0004) — 스키마 확장

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1-01 | schema.ts — guidelines.organization_id, created_by 추가 | ✅ | |
| 1-02 | schema.ts — contents.organization_id 추가 | ✅ | |
| 1-03 | pnpm drizzle-kit generate | ✅ | 사용자 실행 완료 |
| 1-04 | pnpm drizzle-kit migrate | ✅ | 사용자 실행 완료 |

---

### 2단계: Clerk Webhook 핸들러 확장

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 2-01 | user.created → Personal Org 자동 생성 로직 추가 | ✅ | ON CONFLICT DO NOTHING |
| 2-02 | organizationMembership.created → organization_members INSERT | ✅ | |
| 2-03 | organizationMembership.deleted → organization_members DELETE | ✅ | |

---

### 3단계: 백엔드 미들웨어 + API

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 3-01 | with-organization.ts 미들웨어 | ✅ | URL :id → clerkOrgId → default_org 3단계 폴백 |
| 3-02 | with-admin-role.ts 미들웨어 | ✅ | |
| 3-03 | GET /api/org — 내 조직 목록 | ✅ | member_count, is_default, role 포함 |
| 3-04 | POST /api/org — 조직 생성 (UC-23) | ✅ | Clerk Org 생성 + DB transaction |
| 3-05 | GET /api/org/:id — 조직 단건 조회 | ✅ | |
| 3-06 | PATCH /api/org/:id — 조직 설정 수정 | ✅ | Clerk + DB 동기화 |
| 3-07 | DELETE /api/org/:id — soft delete (UC-26) | ✅ | deleted_at = now(), Personal Org 보호 |
| 3-08 | POST /api/org/:id/restore — 복원 (UC-27) | ✅ | 30일 grace 검증 |
| 3-09 | GET /api/org/:id/members — 멤버 목록 | ✅ | Clerk pending invitations 포함 |
| 3-10 | POST /api/org/:id/members/invitations — 초대 (UC-24) | ✅ | Free=1/Pro=3 제한 |
| 3-11 | PATCH /api/org/:id/members/:userId — 역할 변경 (UC-25) | ✅ | LAST_ADMIN 검증 |
| 3-12 | DELETE /api/org/:id/members/:userId — 멤버 제거 (UC-25) | ✅ | Clerk + DB 동기화 |
| 3-13 | hono/index.ts에 org route 등록 | ✅ | |

---

### 4단계: 기존 API 수정 (organization_id 필터 적용)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 4-01 | GET /api/guidelines → organization_id 필터 | ✅ | null org_id 백필 폴백 포함 |
| 4-02 | POST /api/guidelines → organization_id, created_by 설정 | ✅ | |
| 4-03 | DELETE /api/guidelines/:id → 조직 소유권 검증 | ✅ | |
| 4-04 | GET /api/history → organization_id 필터 | ✅ | null org_id 백필 폴백 포함 |
| 4-05 | GET/PUT/DELETE /api/history/:id → 조직 소유권 검증 | ✅ | |
| 4-06 | POST /api/generate → organization_id 설정 | ✅ | contents 테이블 |

---

### 5단계: 일회성 부트스트랩 엔드포인트

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 5-01 | POST /api/admin/bootstrap-orgs 엔드포인트 | ✅ | x-bootstrap-secret 헤더 보호 |
| 5-02 | 부트스트랩 실행 | ✅ | 사용자 실행 완료 |

---

### 6단계: 사이드바 확장

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 6-01 | OrgSwitcher 컴포넌트 | ✅ | useAuth().orgId, setActive() |
| 6-02 | sidebar.tsx — OrgSwitcher + caption 추가 | ✅ | is_personal / 일반 / soft-deleted 분기 |
| 6-03 | sidebar.tsx — org:admin 전용 메뉴 (조직 설정, 결제·플랜) | ✅ | |
| 6-04 | soft-deleted 조직 amber 배너 | ✅ | DashboardLayout 상단, DeletedOrgBanner 컴포넌트 |

---

### 7단계: 프론트엔드 페이지 4개

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 7-01 | /org — 조직 목록 페이지 | ✅ | Framer Motion 카드, 전환/관리/복원 |
| 7-02 | /org/new — 조직 생성 페이지 (UC-23) | ✅ | auto-slug, react-hook-form |
| 7-03 | /org/[id] — 조직 설정 (일반탭 + 위험영역) | ✅ | slug 확인 삭제 모달 |
| 7-04 | /org/[id]/members — 멤버 관리 (UC-24·25) | ✅ | 초대 Dialog, 역할 Select, 제거 AlertDialog |

---

## 현재 진행 단계

```
✅ 1단계: DB 마이그레이션 스키마 확장 — 완료
✅ 2단계: Clerk Webhook 확장 — 완료
✅ 3단계: 백엔드 미들웨어 + API — 완료
✅ 4단계: 기존 API 수정 — 완료
✅ 5단계: 부트스트랩 엔드포인트 — 완료
✅ 6단계: 사이드바 확장 — 완료
✅ 7단계: 프론트엔드 페이지 — 완료
```

**Phase 3 전체 완료**

---

## 핵심 결정사항 (구현 기준)

| 항목 | 결정 |
|------|------|
| `/api/org/:id`의 `:id` | DB `organizations.id` (UUID) |
| auth().orgId null 처리 | DB `default_organization_id` fallback, OrgSwitcher가 setActive() 강제 |
| guidelines user_id | 유지 (작성자), organization_id 별도 추가 (소유 조직) |
| Personal Org 중복 방지 | `ON CONFLICT DO NOTHING` + DB unique index |
| withOrganization 우선순위 | URL `:id` 파라미터 → clerkOrgId → default_organization_id |
| 사용자 액션 | 마이그레이션 + 부트스트랩 실행 완료 |
