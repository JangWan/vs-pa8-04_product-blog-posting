# 빌링 Phase 6 — 레거시 `plan` 컬럼 전면 제거

> 작성일: 2026-05-20 | 전 단계: docs/Imple/progress-status-09.빌링-DB-재설계.md (Phase 5)

---

## 0. Phase 6 목표

Phase 5에서 `plan_product_id` 컬럼을 추가하고 두 컬럼을 **병행 유지**했다.  
Phase 6은 레거시 `plan` 계열 컬럼을 **완전히 제거**하고, 모든 로직을 `plan_products` 테이블 기반으로 전환한다.

### 해결할 기술 부채

| 문제 | 원인 | 해결 |
|------|------|------|
| 플랜 한도가 코드 상수 `PLANS`에 이중 관리 | Phase 5에서 DB 이관 미완 | `PLANS` 상수 제거, `plan_products` JOIN |
| `subscriptions.plan` 중복 유지 | Phase 5 호환성 유지 | `plan_product_id` 컬럼 추가 후 DROP |
| `override_*` 필드로 업그레이드 복잡도 증가 | 일할 업그레이드 임시 패치 | `plan_product_id` 교체 방식으로 단순화 |
| `scheduled_plan` 문자열 vs `pending_plan_product_id` FK 병행 | Phase 5 미룸 | `pending_plan_product_id` 단일화 |

---

## 1. 제거 대상 컬럼 목록

### subscriptions (8개 컬럼 제거 + 1개 추가)

| 컬럼 | 방향 | 대체 |
|------|------|------|
| `plan_product_id` | **추가** | 신규 (플랜 상품 FK) |
| `plan` | DROP | `plan_product_id` → `plan_products.plan_code` |
| `scheduled_plan` | DROP | `pending_plan_product_id` (Phase 5에서 이미 추가됨) |
| `override_generations` | DROP | `plan_product_id` 교체로 대체 |
| `override_translations` | DROP | 동일 |
| `override_agent_runs` | DROP | 동일 |
| `upgraded_from` | DROP | `subscription_history` 이벤트로 대체 |
| `upgraded_at` | DROP | 동일 |

### organizations (1개 컬럼 제거)

| 컬럼 | 방향 | 비고 |
|------|------|------|
| `plan` | DROP | `plan_product_id`는 Phase 5에서 이미 추가됨 |

### order_items (1개 컬럼 제거)

| 컬럼 | 방향 | 비고 |
|------|------|------|
| `plan_code` | DROP | `plan_product_id`는 Phase 5에서 이미 추가됨 |

---

## 2. 서비스 로직 변경 목록

### service.ts

| 함수 | 변경 내용 |
|------|-----------|
| `syncOrgPlan(orgId, planCode)` | `organizations.plan` 갱신 제거, `plan_product_id`만 갱신. 시그니처 `planCode: PlanCode` 유지 (내부에서 plan_products 조회) |
| `resolveEffectiveLimits(orgId)` | `org.plan` / `PLANS[plan]` 참조 제거 → `plan_product_id` FK JOIN으로 한도 조회 |
| `validateInviteCapacity(orgId)` | `org.plan === PLAN_CODE.FREE` → `plan_products.plan_code === 'free'` / `plan_products.max_members` 기반 |
| `activateSubscription()` | `orderItems.plan_product_id` 읽기, `subscriptions.plan_product_id` 저장, `plan` 컬럼 갱신 제거 |
| `upgradeSubscription()` | `override_*` 삭제 → `subscriptions.plan_product_id`를 MAX 상품 ID로 UPDATE. `upgraded_from/upgraded_at` 삭제. 가격은 plan_products DB 조회 |
| `scheduleDowngrade()` | `scheduled_plan: PLAN_CODE.PRO` → `pending_plan_product_id: <pro_product_id>` |
| `cancelScheduledDowngrade()` | `scheduled_plan: null` → `pending_plan_product_id: null` |
| `updateBillingKey()` | `scheduled_plan` / `override_*` / `upgraded_*` 상속 코드 삭제, `pending_plan_product_id` 상속으로 교체 |

### cron/tick (route.ts)

| 변경 항목 | 현재 | 변경 후 |
|-----------|------|---------|
| 플랜 가격·이름 조회 | `PLANS[effectivePlanCode]` 상수 | `plan_products` DB 조회 |
| 다운그레이드 판단 | `sub.scheduled_plan !== null` | `sub.pending_plan_product_id !== null` |
| 다운그레이드 적용 | `plan: effectivePlanCode`, `scheduled_plan: null` | `plan_product_id: newProductId`, `pending_plan_product_id: null` |
| override 초기화 | `override_*: null`, `upgraded_*: null` | 해당 컬럼 없어짐 (코드 삭제) |

### constants.ts

| 항목 | 변경 |
|------|------|
| `PLANS` 상수 | 제거 (plan_products 테이블로 완전 이관) |
| `PlanCode` 타입 | 유지 (API 요청 검증용으로 계속 필요) |

### billing/route.ts

| 엔드포인트 | 변경 |
|-----------|------|
| GET /subscription | `plan` 문자열 → `plan_code` (plan_products JOIN) + `plan_product_id` 반환 |

---

## 3. 핵심 설계 결정

### 3-1. `upgradeSubscription()` — override 제거 방식

**기존 방식 (Phase 5까지)**
```
Pro 구독 → 일할 결제 → override_generations = 남은Gen * 4
resolveEffectiveLimits()가 override_* 우선 적용
```

**Phase 6 방식**
```
Pro 구독 → 일할 결제 → subscriptions.plan_product_id = MAX 상품 ID
resolveEffectiveLimits()가 plan_product_id JOIN → MAX 한도 자동 적용
```

장점: override_* 필드 불필요. 한도 계산 로직 단일화.  
비고: 일할 비례 결제 금액 계산에만 `plan_products.price` 두 번 조회 (pro, max).

### 3-2. `syncOrgPlan()` 시그니처

파라미터를 `planCode: PlanCode`로 유지. 내부에서 `plan_products` 조회 후 `plan_product_id`만 갱신.  
호출부 (service.ts, cron/tick, webhook) 변경 없음.

### 3-3. `resolveEffectiveLimits()` — override_* 없이

override_* 컬럼이 사라지면:
- 개인 org: `organizations.plan_product_id` → plan_products JOIN
- 팀 org: `subscriptions.plan_product_id` → plan_products JOIN
- canceled/suspended → 0 반환 (변경 없음)

---

## 4. 마이그레이션 전략

### 4-1. 실행 순서 (코드 먼저, DROP 나중)

```
1. schema.ts — subscriptions.plan_product_id 추가 + 레거시 컬럼 제거
2. service.ts 전면 수정 (plan_product_id 기반)
3. cron/tick 수정
4. route.ts 정렬
5. pnpm drizzle-kit generate  ← 사용자 직접 실행
6. 백필 SQL 실행              ← 사용자 직접 실행 (Neon Console)
7. pnpm drizzle-kit migrate   ← 사용자 직접 실행
8. pnpm type-check            ← 검증
```

### 4-2. 백필 SQL

```sql
-- subscriptions.plan_product_id 채우기
UPDATE subscriptions s
SET plan_product_id = pp.id
FROM plan_products pp,
     organizations org
WHERE s.organization_id = org.id
  AND pp.plan_code = s.plan
  AND pp.team_type = CASE WHEN org.is_default THEN 'personal' ELSE 'team' END
  AND s.plan_product_id IS NULL;
```

---

## 5. 구현 체크리스트

### A. DB 스키마 (schema.ts)

| # | 항목 | 상태 |
|---|------|------|
| A-1 | `subscriptions.plan_product_id` 추가 (FK → plan_products) | ✅ |
| A-2 | `subscriptions.plan` 제거 | ✅ |
| A-3 | `subscriptions.scheduled_plan` 제거 | ✅ |
| A-4 | `subscriptions.override_generations/translations/agent_runs` 제거 (3개) | ✅ |
| A-5 | `subscriptions.upgraded_from`, `upgraded_at` 제거 | ✅ |
| A-6 | `organizations.plan` 제거 | ✅ |
| A-7 | `order_items.plan_code` 제거 | ✅ |

### B. 서비스 로직 (service.ts)

| # | 항목 | 상태 |
|---|------|------|
| B-1 | `syncOrgPlan()` — `plan` 갱신 제거, `plan_product_id`만 갱신 | ✅ |
| B-2 | `resolveEffectiveLimits()` — plan_products JOIN 기반 재작성 | ✅ |
| B-3 | `validateInviteCapacity()` — plan_products JOIN 기반 재작성 | ✅ |
| B-4 | `activateSubscription()` — `plan_product_id` 저장, `plan` 컬럼 제거 | ✅ |
| B-5 | `upgradeSubscription()` — override_* 제거, `plan_product_id` 교체 방식 | ✅ |
| B-6 | `scheduleDowngrade()` — `pending_plan_product_id` 사용 | ✅ |
| B-7 | `cancelScheduledDowngrade()` — `pending_plan_product_id: null` | ✅ |
| B-8 | `updateBillingKey()` — 레거시 필드 상속 코드 삭제 | ✅ |
| B-9 | `PLANS` 상수 제거 (constants.ts) | ✅ |

### C. cron/tick

| # | 항목 | 상태 |
|---|------|------|
| C-1 | `plan_products` DB 조회로 가격·이름 대체 (`PLANS` 상수 제거) | ✅ |
| C-2 | 다운그레이드 판단: `pending_plan_product_id` 기반 | ✅ |
| C-3 | 다운그레이드 적용: `plan_product_id` 교체, `pending_plan_product_id: null` | ✅ |
| C-4 | `override_*`, `upgraded_*` 초기화 코드 삭제 | ✅ |
| C-5 | `plan_code` in orderItems insert → `plan_product_id` 사용 | ✅ |

### D. API route (billing/route.ts)

| # | 항목 | 상태 |
|---|------|------|
| D-1 | GET /subscription — `plan` 문자열 → `plan_code` (JOIN) + `plan_product_id` 반환 | ✅ |

### E. 마이그레이션 & 검증

| # | 항목 | 상태 |
|---|------|------|
| E-1 | `pnpm drizzle-kit generate` | ✅ |
| E-2 | 백필 SQL 실행 (Neon Console) | ✅ |
| E-3 | `pnpm drizzle-kit migrate` | ✅ |
| E-4 | `pnpm type-check` 통과 | ✅ |
| E-5 | `docs/Imple/progress-status.md` 갱신 | ✅ |

---

## 6. 영향 범위 파일 목록

```
수정:
  src/db/schema.ts
  src/features/billing/backend/service.ts
  src/features/billing/backend/constants.ts
  src/features/billing/backend/route.ts
  src/app/api/cron/billing/tick/route.ts

신규 (drizzle 자동 생성):
  src/db/migrations/0011_*.sql
  src/db/migrations/meta/0011_snapshot.json
  src/db/migrations/meta/_journal.json
```
