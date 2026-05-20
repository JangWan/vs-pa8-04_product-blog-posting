# 빌링 DB 재설계 — Phase 5 (플랜 상품화 + 구독 이력 체계화)

> 작성일: 2026-05-20 | 참조: docs/Imple/progress-status-09.구독-플랜-재설계.md

---

## 0. 확정된 결정 사항

| 결정 항목                         | 선택                               | 근거                                          |
| ----------------------------- | -------------------------------- | ------------------------------------------- |
| Pro→MAX 업그레이드 `override_*` 대체 | **Phase 6으로 미룸**                 | override_* 제거 시 업그레이드 로직 전체 파손. 이번 스코프에서 유지 |
| `plan` 컬럼 제거 범위               | **plan 유지, plan_product_id만 추가** | 20+ 호출처 한번에 교체 위험. 두 컬럼 병행 후 Phase 6에서 DROP |
| `pending_plan_product_id` 추가  | **Phase 6으로 미룸**                 | `scheduled_plan` 유지. Phase 5는 신규 테이블 추가에 집중 |
| 기존 결제 이력 백필                   | **백필 포함**                        | 기존 사용자도 새 UI에서 이력 확인 가능해야 함                 |
| 빌링키 교체 동작 변경                  | **Phase 5 포함**                   | 설계 핵심 규칙. card_last4 역정규화와 함께 처리            |

---

## 1. Phase 5 / Phase 6 범위 분리

### Phase 5 (이번 구현) — 추가만, 기존 컬럼 제거 없음

```
신규 테이블:    plan_products, subscription_history
컬럼 추가:      subscriptions.card_last4, card_company
                organizations.plan_product_id
                usage_quotas.plan_product_id, *_limit
                orders.source
                order_items.plan_product_id
동작 변경:      updateBillingKey() → 새 subscription 행 생성 방식으로 변경
버그 수정:      cron next_billing_at 드리프트, GET /payments 메모리 필터
신규 엔드포인트: GET /plan-products, GET /subscription-history
UI 추가:        카드 정보 표시, 결제 이력 그룹화
백필:           기존 PAY_SUCCESS 주문 → subscription_history 역생성
```

### Phase 6 (다음 구현) — TODO 목록

```
[ ] subscriptions.plan           → plan_product_id로 전환 후 DROP
[ ] subscriptions.scheduled_plan → pending_plan_product_id로 교체 후 DROP
[ ] subscriptions.override_*     → upgrade 재설계 완료 후 DROP
[ ] subscriptions.upgraded_from, upgraded_at → DROP
[ ] organizations.plan           → plan_product_id로 전환 후 DROP
[ ] order_items.plan_code        → plan_product_id로 전환 후 DROP
[ ] Pro→MAX 즉시 업그레이드 재설계 (subscription_history 기반)
[ ] syncOrgPlan() 전면 교체: plan → plan_product_id
[ ] resolveEffectiveLimits() 재작성: plan_product_id JOIN 기반
[ ] validateInviteCapacity() 재작성: plan_product_id JOIN 기반
```

---

## 2. 재설계 목표 요약

| 문제 | 해결 |
|------|------|
| 플랜 가격·한도가 코드 상수에만 존재 | `plan_products` 테이블 DB화 |
| 결제 주기 이벤트 로그 없음 | `subscription_history` 신설 |
| 카드 정보 UI 표시 불가 | `card_last4`, `card_company` 역정규화 |
| 결제 한도가 결제 시점과 무관 | `usage_quotas`에 한도 스냅샷 저장 |
| 빌링키 교체 이력 추적 불가 | 교체 시 새 subscription 행 생성 |
| cron 정기결제 날짜 드리프트 🔴 | `current_period_end + 1개월` 수정 |
| GET /payments 전체 조회 후 메모리 필터 🔴 | SQL WHERE IN으로 수정 |

---

## 3. Phase A — DB 마이그레이션 SQL

> **실행 순서 엄수**: plan_products → (schema.ts 수정 후 drizzle generate) → subscription_history → 나머지 ALTER

### A-1. `plan_products` 테이블 생성

```sql
CREATE TABLE plan_products (
  id                      TEXT PRIMARY KEY,
  team_type               VARCHAR(20)    NOT NULL,  -- 'personal' | 'team'
  plan_code               VARCHAR(20)    NOT NULL,  -- 'free' | 'pro' | 'max'
  name                    TEXT           NOT NULL,
  price                   NUMERIC(12,0)  NOT NULL DEFAULT 0,
  max_members             INTEGER,                   -- NULL = 무제한
  generations_per_month   INTEGER        NOT NULL DEFAULT 0,
  translations_per_month  INTEGER        NOT NULL DEFAULT 0,
  agent_runs_per_month    INTEGER        NOT NULL DEFAULT 0,
  is_active               BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX plan_products_team_type_plan_code_uk
  ON plan_products (team_type, plan_code);
CREATE INDEX plan_products_is_active_idx
  ON plan_products (is_active);
```

### A-2. `plan_products` 초기 시드

```sql
INSERT INTO plan_products
  (id, team_type, plan_code, name, price, max_members,
   generations_per_month, translations_per_month, agent_runs_per_month)
VALUES
  -- 개인 플랜
  ('pp_personal_free', 'personal', 'free', 'Free',      0, 1,    10,   5,   0),
  ('pp_personal_pro',  'personal', 'pro',  'Pro',  29000, 1,   100,  50,  30),
  -- 팀 플랜
  ('pp_team_free',     'team',     'free', 'Free',      0, 1,    10,   5,   0),
  ('pp_team_pro',      'team',     'pro',  'Pro',  29000, 3,   100,  50,  30),
  ('pp_team_max',      'team',     'max',  'MAX',  58000, NULL, 400, 200, 120);
```

### A-3. `subscription_history` 테이블 생성

```sql
-- kind 값:
--   'activated'           — 신규 구독 첫 결제
--   'renewed'             — 정기 갱신 결제
--   'downgrade_scheduled' — 다운그레이드 예약 기록
--   'downgraded'          — 다음 결제 시 다운그레이드 확정 적용
--   'billing_key_replaced'— 빌링키 교체 (새 subscription 행 생성)
--   'resubscribed'        — 만료·해지 후 재구독
CREATE TABLE subscription_history (
  id                      TEXT          PRIMARY KEY,
  subscription_id         TEXT          NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  -- organization_id 역정규화: JOIN 없이 이력 조회 가능
  organization_id         TEXT          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind                    VARCHAR(30)   NOT NULL,
  plan_product_id         TEXT          REFERENCES plan_products(id) ON DELETE SET NULL,
  target_plan_product_id  TEXT          REFERENCES plan_products(id) ON DELETE SET NULL,
  period_start            TIMESTAMPTZ,
  period_end              TIMESTAMPTZ,
  next_billing_at         TIMESTAMPTZ,
  -- 단방향 FK만 유지 (order → history 역참조 없음, circular FK 방지)
  order_id                VARCHAR(64)   REFERENCES orders(id) ON DELETE SET NULL,
  changed_by              TEXT          NOT NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX subscription_history_subscription_id_idx
  ON subscription_history (subscription_id);
CREATE INDEX subscription_history_organization_id_idx
  ON subscription_history (organization_id);
CREATE INDEX subscription_history_kind_idx
  ON subscription_history (kind);
CREATE INDEX subscription_history_created_at_idx
  ON subscription_history (created_at DESC);
```

### A-4. `subscriptions` 컬럼 추가 (기존 컬럼 유지)

```sql
-- 카드 정보 역정규화 (결제 수단 변경 시 업데이트)
ALTER TABLE subscriptions
  ADD COLUMN card_last4              VARCHAR(4),
  ADD COLUMN card_company            TEXT,
  -- 다운그레이드 예약용 plan_product FK (Phase 6에서 scheduled_plan 대체)
  -- Phase 5에서는 추가만 해두고 실제 사용은 Phase 6에서 전환
  ADD COLUMN pending_plan_product_id TEXT REFERENCES plan_products(id) ON DELETE SET NULL;

-- ⚠️ plan, scheduled_plan, override_*, upgraded_from, upgraded_at 컬럼은 유지
```

### A-5. `organizations` 컬럼 추가 (plan 컬럼 유지)

```sql
ALTER TABLE organizations
  ADD COLUMN plan_product_id TEXT REFERENCES plan_products(id) ON DELETE SET NULL;

-- ⚠️ plan 컬럼 유지. Phase 6에서 전환 완료 후 DROP
```

### A-6. `usage_quotas` 컬럼 추가

```sql
ALTER TABLE usage_quotas
  ADD COLUMN plan_product_id       TEXT     REFERENCES plan_products(id) ON DELETE SET NULL,
  ADD COLUMN generations_limit     INTEGER,
  ADD COLUMN translations_limit    INTEGER,
  ADD COLUMN agent_runs_limit      INTEGER;
```

### A-7. `orders` 컬럼 추가 (subscription_id 유지)

```sql
-- source: 사용자 요청('user') vs cron 자동('cron') 구분
ALTER TABLE orders
  ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'user';

-- ⚠️ subscription_id 컬럼 유지 (circular FK 방지 목적으로 subscription_history_id 미추가)
-- ⚠️ Phase 6에서 subscription_id 제거 여부 재검토
```

### A-8. `order_items` 컬럼 추가 (plan_code 유지)

```sql
ALTER TABLE order_items
  ADD COLUMN plan_product_id TEXT REFERENCES plan_products(id) ON DELETE SET NULL;

-- ⚠️ plan_code 컬럼 유지. Phase 6에서 전환 완료 후 DROP
```

---

## 4. Phase A-9 — 데이터 백필 SQL

> ⚠️ 마이그레이션 적용 후 Neon Console 또는 psql에서 직접 실행. 실행 전 결과 확인 필수.

### A-9-1. `organizations.plan_product_id` 백필

```sql
UPDATE organizations o
SET plan_product_id = pp.id
FROM plan_products pp
WHERE pp.plan_code = o.plan
  AND pp.team_type = CASE WHEN o.is_default THEN 'personal' ELSE 'team' END
  AND o.deleted_at IS NULL;
```

### A-9-2. `subscriptions.card_last4`, `card_company` 백필

```sql
-- ⚠️ card.number는 마스킹된 전체 번호 → RIGHT(4)로 마지막 4자리만 추출
UPDATE subscriptions s
SET
  card_last4   = RIGHT(
    (SELECT p.raw_data->'card'->>'number'
     FROM payments p
     INNER JOIN orders o ON o.id = p.order_id
     WHERE o.organization_id = s.organization_id
       AND p.status = 'DONE'
     ORDER BY p.approved_at DESC
     LIMIT 1),
    4
  ),
  card_company = (
    SELECT p.raw_data->'card'->>'company'
    FROM payments p
    INNER JOIN orders o ON o.id = p.order_id
    WHERE o.organization_id = s.organization_id
      AND p.status = 'DONE'
    ORDER BY p.approved_at DESC
    LIMIT 1
  )
WHERE s.status NOT IN ('canceled');
```

### A-9-3. `order_items.plan_product_id` 백필

```sql
-- PostgreSQL UPDATE...FROM: 업데이트 대상 테이블(oi)은 FROM 절 JOIN에서 참조 불가
-- → 조인 테이블을 콤마로 나열하고 WHERE로 연결
UPDATE order_items oi
SET plan_product_id = pp.id
FROM orders o,
     organizations org,
     plan_products pp
WHERE oi.order_id = o.id
  AND o.organization_id = org.id
  AND pp.plan_code = oi.plan_code
  AND pp.team_type = CASE WHEN org.is_default THEN 'personal' ELSE 'team' END;
```

### A-9-4. `usage_quotas` 한도 스냅샷 백필

```sql
UPDATE usage_quotas uq
SET
  plan_product_id     = org.plan_product_id,
  generations_limit   = pp.generations_per_month,
  translations_limit  = pp.translations_per_month,
  agent_runs_limit    = pp.agent_runs_per_month
FROM organizations org
INNER JOIN plan_products pp ON pp.id = org.plan_product_id
WHERE uq.organization_id = org.id
  AND org.plan_product_id IS NOT NULL;
```

### A-9-5. `subscription_history` 기존 이력 백필

```sql
-- 기존 PAY_SUCCESS 주문에서 activated/renewed 이벤트 역생성
-- 첫 번째 PAY_SUCCESS = 'activated', 이후 = 'renewed'
WITH ranked_orders AS (
  SELECT
    o.id              AS order_id,
    o.organization_id,
    o.created_at,
    p.approved_at,
    oi.plan_product_id,
    s.id              AS subscription_id,
    ROW_NUMBER() OVER (PARTITION BY o.organization_id ORDER BY p.approved_at ASC) AS rn
  FROM orders o
  INNER JOIN payments p     ON p.order_id = o.id AND p.status = 'DONE'
  INNER JOIN order_items oi ON oi.order_id = o.id
  -- 가장 최근 구독 (canceled 포함 이력 중 첫 번째 매칭)
  LEFT JOIN LATERAL (
    SELECT id FROM subscriptions
    WHERE organization_id = o.organization_id
    ORDER BY created_at ASC
    LIMIT 1
  ) s ON TRUE
  WHERE o.status = 'PAY_SUCCESS'
)
INSERT INTO subscription_history
  (id, subscription_id, organization_id, kind, plan_product_id,
   period_start, period_end, order_id, changed_by, created_at)
SELECT
  gen_random_uuid()::TEXT,
  subscription_id,
  organization_id,
  CASE WHEN rn = 1 THEN 'activated' ELSE 'renewed' END,
  plan_product_id,
  approved_at                                        AS period_start,
  approved_at + INTERVAL '1 month'                   AS period_end,
  order_id,
  'backfill',
  approved_at
FROM ranked_orders
WHERE subscription_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

---

## 5. Phase B — Drizzle `schema.ts` 변경

### B-1. `planProducts` 테이블 추가

```typescript
export const planProducts = pgTable(
  "plan_products",
  {
    id: text("id").primaryKey(),
    team_type: varchar("team_type", { length: 20 }).notNull(),
    plan_code: varchar("plan_code", { length: 20 }).notNull(),
    name: text("name").notNull(),
    price: numeric("price", { precision: 12, scale: 0 }).notNull().default("0"),
    max_members: integer("max_members"),
    generations_per_month: integer("generations_per_month").notNull().default(0),
    translations_per_month: integer("translations_per_month").notNull().default(0),
    agent_runs_per_month: integer("agent_runs_per_month").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("plan_products_team_type_plan_code_uk").on(table.team_type, table.plan_code),
    index("plan_products_is_active_idx").on(table.is_active),
  ]
);
```

### B-2. `subscriptionHistory` 테이블 추가

```typescript
export const subscriptionHistory = pgTable(
  "subscription_history",
  {
    id: text("id").primaryKey(),
    subscription_id: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).notNull(),
    plan_product_id: text("plan_product_id")
      .references(() => planProducts.id, { onDelete: "set null" }),
    target_plan_product_id: text("target_plan_product_id")
      .references(() => planProducts.id, { onDelete: "set null" }),
    period_start: timestamp("period_start", { withTimezone: true }),
    period_end: timestamp("period_end", { withTimezone: true }),
    next_billing_at: timestamp("next_billing_at", { withTimezone: true }),
    order_id: varchar("order_id", { length: 64 })
      .references(() => orders.id, { onDelete: "set null" }),
    changed_by: text("changed_by").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("subscription_history_subscription_id_idx").on(table.subscription_id),
    index("subscription_history_organization_id_idx").on(table.organization_id),
    index("subscription_history_kind_idx").on(table.kind),
    index("subscription_history_created_at_idx").on(table.created_at),
  ]
);
```

### B-3. 기존 테이블 컬럼 추가

```typescript
// subscriptions: 카드 정보 + pending FK
card_last4: varchar("card_last4", { length: 4 }),
card_company: text("card_company"),
pending_plan_product_id: text("pending_plan_product_id")
  .references(() => planProducts.id, { onDelete: "set null" }),

// organizations: plan_product FK (plan 컬럼 유지)
plan_product_id: text("plan_product_id")
  .references(() => planProducts.id, { onDelete: "set null" }),

// usage_quotas: 한도 스냅샷
plan_product_id: text("plan_product_id")
  .references(() => planProducts.id, { onDelete: "set null" }),
generations_limit: integer("generations_limit"),
translations_limit: integer("translations_limit"),
agent_runs_limit: integer("agent_runs_limit"),

// orders: source
source: varchar("source", { length: 10 }).notNull().default("user"),

// order_items: plan_product FK (plan_code 컬럼 유지)
plan_product_id: text("plan_product_id")
  .references(() => planProducts.id, { onDelete: "set null" }),
```

### B-4. 타입 Export 추가

```typescript
export type PlanProduct = typeof planProducts.$inferSelect;
export type NewPlanProduct = typeof planProducts.$inferInsert;
export type SubscriptionHistory = typeof subscriptionHistory.$inferSelect;
export type NewSubscriptionHistory = typeof subscriptionHistory.$inferInsert;
```

---

## 6. Phase C — 백엔드 코드 변경

### C-1. `src/lib/constants.ts` — `SUBSCRIPTION_HISTORY_KIND` 추가

```typescript
export const SUBSCRIPTION_HISTORY_KIND = {
  ACTIVATED:            "activated",
  RENEWED:              "renewed",
  DOWNGRADE_SCHEDULED:  "downgrade_scheduled",
  DOWNGRADED:           "downgraded",
  BILLING_KEY_REPLACED: "billing_key_replaced",
  RESUBSCRIBED:         "resubscribed",
} as const;

export type SubscriptionHistoryKind =
  typeof SUBSCRIPTION_HISTORY_KIND[keyof typeof SUBSCRIPTION_HISTORY_KIND];
```

### C-2. `service.ts` — `recordBillingEvent` 함수 신설

```typescript
// subscription_history 이벤트 기록 (subscriptionStatusHistory와 별개)
export async function recordBillingEvent(params: {
  subscriptionId: string;
  organizationId: string;
  kind: SubscriptionHistoryKind;
  planProductId?: string | null;
  targetPlanProductId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  nextBillingAt?: Date | null;
  orderId?: string | null;
  changedBy: string;
}): Promise<void> {
  await db.insert(subscriptionHistory).values({
    id: crypto.randomUUID(),
    subscription_id: params.subscriptionId,
    organization_id: params.organizationId,
    kind: params.kind,
    plan_product_id: params.planProductId ?? null,
    target_plan_product_id: params.targetPlanProductId ?? null,
    period_start: params.periodStart ?? null,
    period_end: params.periodEnd ?? null,
    next_billing_at: params.nextBillingAt ?? null,
    order_id: params.orderId ?? null,
    changed_by: params.changedBy,
  });
}
```

### C-3. `service.ts` — `syncOrgPlan` — plan_product_id 동시 업데이트

```typescript
// Phase 5: plan과 plan_product_id 두 컬럼 모두 업데이트 (동기화 유지)
export async function syncOrgPlan(orgId: string, newPlan: PlanCode) {
  const isDefault = /* org 조회 */;
  const teamType = isDefault ? 'personal' : 'team';

  const [product] = await db.select({ id: planProducts.id })
    .from(planProducts)
    .where(and(
      eq(planProducts.plan_code, newPlan),
      eq(planProducts.team_type, teamType),
      eq(planProducts.is_active, true),
    ));

  await db.update(organizations)
    .set({
      plan: newPlan,                                    // 기존 컬럼 유지
      plan_product_id: product?.id ?? null,             // 신규 컬럼 동기화
    })
    .where(eq(organizations.id, orgId));
}
```

### C-4. `service.ts` — `updateBillingKey` 동작 변경 (핵심)

```
현재: 기존 subscription 행 UPDATE (billing_key_encrypted, customer_key 등)
변경: 기존 subscription → canceled + 새 subscription 행 INSERT

처리 대상:
  SUSPENDED: 새 subscription, next_billing_at = now + 1개월 (새 주기 시작)
  ACTIVE:    새 subscription, next_billing_at = 기존 값 상속 (주기 유지)
  PAST_DUE:  새 subscription, next_billing_at = 기존 값 상속
             (사용자가 "이전 기간 결제 포함" 선택 시 next_billing_at = now)

신규 subscription에 card_last4, card_company 함께 저장.
subscription_history 'billing_key_replaced' 이벤트 기록.
```

> ⚠️ 현재 `/subscription/payment-method/init` 엔드포인트가 SUSPENDED 상태만 허용하는데,
> ACTIVE 상태에서도 카드 변경이 가능하도록 제한 완화 필요.

### C-5. `service.ts` — `activateSubscription` — card_last4 추가 저장

```typescript
// 최초 구독 활성화 시 Toss 결제 응답에서 카드 정보 추출
// chargeResult.data.card.number의 마지막 4자리, card.company
await db.insert(subscriptions).values({
  ...
  card_last4: cardNumber ? cardNumber.slice(-4) : null,
  card_company: cardCompany ?? null,
});

// subscription_history 'activated' 이벤트 기록
await recordBillingEvent({
  subscriptionId: subId,
  organizationId: order.organization_id,
  kind: SUBSCRIPTION_HISTORY_KIND.ACTIVATED,
  planProductId: planProduct?.id ?? null,
  periodStart: now,
  periodEnd: periodEnd,
  nextBillingAt: periodEnd,
  orderId: orderId,
  changedBy: payerUserId ?? "system",
});
```

### C-6. `cron/tick` — 버그 수정 및 개선

#### (a) 🔴 next_billing_at 드리프트 수정

```typescript
// 현재 (버그): 실행 시점 기준 +1개월 → 매달 밀림
const nextBilling = new Date(now);
nextBilling.setMonth(nextBilling.getMonth() + 1);

// 수정: 구독 기간 종료일 기준 +1개월 → 날짜 고정
const nextBilling = new Date(sub.current_period_end!);
nextBilling.setMonth(nextBilling.getMonth() + 1);
```

#### (b) 결제 성공 시 `subscription_history` 'renewed' 기록

```typescript
await recordBillingEvent({
  subscriptionId: sub.id,
  organizationId: sub.organization_id,
  kind: isDowngrade
    ? SUBSCRIPTION_HISTORY_KIND.DOWNGRADED
    : SUBSCRIPTION_HISTORY_KIND.RENEWED,
  planProductId: planProduct?.id ?? null,
  periodStart: sub.current_period_end,    // 이전 period_end = 새 period_start
  periodEnd: nextBilling,
  nextBillingAt: nextBilling,
  orderId: orderId,
  changedBy: "cron",
});
```

#### (c) cron 생성 주문 `source = 'cron'` 설정

```typescript
db.insert(orders).values({
  ...
  source: "cron",   // 추가
})
```

### C-7. `route.ts` — 버그 수정 및 엔드포인트 추가

#### (a) 🔴 `GET /payments` 메모리 필터 수정

```typescript
// 현재 (버그):
const allPayments = await db.select().from(payments).orderBy(desc(payments.created_at));
const filtered = allPayments.filter((p) => orderIds.includes(p.order_id)).slice(0, 20);

// 수정: inArray 사용
import { inArray } from "drizzle-orm";
const filtered = await db
  .select()
  .from(payments)
  .where(inArray(payments.order_id, orderIds))
  .orderBy(desc(payments.created_at))
  .limit(20);
```

#### (b) `GET /plan-products` 엔드포인트 신설

```typescript
// 기존 GET /plans (PLANS 상수 반환) 유지하면서 추가
app.get("/plan-products", async (c) => {
  const teamType = c.req.query("team_type"); // 'personal' | 'team'
  const rows = await db.select().from(planProducts)
    .where(and(
      eq(planProducts.is_active, true),
      teamType ? eq(planProducts.team_type, teamType) : undefined,
    ))
    .orderBy(planProducts.team_type, planProducts.price);
  return c.json({ plan_products: rows });
});
```

#### (c) `GET /subscription-history` 엔드포인트 신설

```typescript
// organization_id 직접 필드 덕분에 JOIN 불필요
app.get("/subscription-history", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const history = await db.select()
    .from(subscriptionHistory)
    .where(eq(subscriptionHistory.organization_id, ctx.org.id))
    .orderBy(desc(subscriptionHistory.created_at))
    .limit(24); // 최근 24개 이벤트

  return c.json({ history });
});
```

#### (d) `GET /subscription` — card_last4, card_company 반환 추가

```typescript
// subscriptions 행에 직접 있으므로 raw_data 파싱 불필요
return c.json({
  subscription: {
    ...sub,
    card_display: sub.card_last4
      ? `${sub.card_company ?? "카드"} ****${sub.card_last4}`
      : null,
  },
  ...
});
```

#### (e) `POST /orders` — `source: 'user'` 명시

```typescript
db.insert(orders).values({
  ...
  source: "user",
})
```

---

## 7. Phase D — 프론트엔드 변경

### D-1. `/billing` — 카드 정보 표시

```
현재: "카드 등록됨 / 미등록"
변경: subscription.card_display 값 사용
     예: "신한카드 ****1234" | "미등록"
```

### D-2. `/billing` — 결제 이력 `subscription_history` 기반 그룹화

```
현재: payment 단건 목록
변경: GET /subscription-history 호출
     kind = 'activated' | 'renewed' → 결제 이벤트로 표시
     각 항목: 플랜명, period_start~period_end, 결제 금액
     kind = 'downgrade_scheduled' | 'billing_key_replaced' → 이벤트 알림으로 표시
```

### D-3. `/billing/checkout` — 플랜 상품 DB 조회

```
현재: PLANS 상수 하드코딩
변경: GET /plan-products?team_type=personal|team API 조회
     실패 시 PLANS 상수 fallback (하위 호환 유지)
```

### D-4. `/billing/payments` — 주문 컨텍스트·플랜명 표시

```
현재: payment 금액만 표시
변경: order → order_items → plan_product JOIN으로 플랜명 표시
```

---

## 8. 최종 구현 체크리스트

### Phase A: DB 마이그레이션 [사용자 직접 실행]

- [x] A-1 ~ A-8 schema.ts 수정 후 `pnpm drizzle-kit generate` (0010_worried_layla_miller.sql 생성 완료)
- [x] `pnpm drizzle-kit migrate` 실행 및 결과 확인
- [x] plan_products 시드 데이터 삽입 (A-2)
- [x] A-9-1 organizations 백필 SQL 실행
- [x] A-9-2 subscriptions 카드 정보 백필 SQL 실행
- [x] A-9-3 order_items plan_product_id 백필 SQL 실행 (PostgreSQL UPDATE...FROM 문법 수정 적용)
- [x] A-9-4 usage_quotas 한도 스냅샷 백필 SQL 실행
- [x] A-9-5 subscription_history 기존 이력 백필 SQL 실행

### Phase B: Drizzle 스키마 [코드 작업]

- [x] `planProducts` 테이블 추가
- [x] `subscriptionHistory` 테이블 추가
- [x] 기존 5개 테이블 컬럼 추가 (제거 없음)
- [x] 타입 export 추가
- [x] `pnpm type-check` 통과 확인

### Phase C: 백엔드 코드 [코드 작업]

- [x] C-1: `SUBSCRIPTION_HISTORY_KIND` 상수 추가 (src/lib/constants.ts + billing/backend/constants.ts re-export)
- [x] C-2: `recordBillingEvent()` 함수 신설 (service.ts)
- [x] C-3: `syncOrgPlan()` — plan_product_id 동시 업데이트 (service.ts)
- [x] C-4: `updateBillingKey()` — 새 subscription 행 생성 방식으로 변경 (service.ts)
         - SUSPENDED: 새 주기 시작
         - ACTIVE / PAST_DUE: 기존 next_billing_at 상속
         - `/payment-method/init` 엔드포인트 ACTIVE/PAST_DUE 상태도 허용으로 수정
- [x] C-5: `activateSubscription()` — card_last4/company 저장 + 'activated'/'resubscribed' 이벤트 기록 (service.ts)
- [x] C-6a: `cron/tick` — 🔴 next_billing_at 드리프트 버그 수정 (current_period_end 기준)
- [x] C-6b: `cron/tick` — 'renewed'/'downgraded' 이벤트 기록
- [x] C-6c: `cron/tick` — `source = 'cron'` 설정
- [x] C-7a: `route.ts` — 🔴 GET /payments 메모리 필터 수정 (inArray SQL)
- [x] C-7b: `route.ts` — GET /plan-products 엔드포인트 신설
- [x] C-7c: `route.ts` — GET /subscription-history 엔드포인트 신설
- [x] C-7d: `route.ts` — GET /subscription card_display 추가
- [x] C-7e: `route.ts` — POST /orders source: 'user' 명시

### Phase D: 프론트엔드 [코드 작업]

- [x] D-1: `/billing` 카드 정보 card_display 표시 (useSubscription 타입 + SubscriptionDashboard props 갱신)
- [x] D-2: `useSubscriptionHistory` 훅 + `SubscriptionHistoryItem` 타입 신설 (use-billing.ts)
- [x] D-2-UI: `/billing` PaymentHistoryCard → BillingEventCard (subscription_history 기반, kind별 아이콘/레이블)
- [x] D-3: `/billing/checkout` PlanSelector DB 조회 전환 — `usePlanProducts` 훅 + fallback 상수 패턴
- [x] D-4: `/billing/payments` 주문 컨텍스트 + 플랜명 표시 — order_kind/plan_code JOIN + buildOrderLabel()

---

## 9. Phase 6 TODO (다음 스코프)

```
[ ] subscriptions.plan 컬럼 DROP (plan_product_id로 전환 완료 확인 후)
[ ] subscriptions.scheduled_plan → pending_plan_product_id로 교체 후 DROP
[ ] subscriptions.override_*, upgraded_from, upgraded_at DROP
[ ] organizations.plan 컬럼 DROP
[ ] order_items.plan_code 컬럼 DROP
[ ] syncOrgPlan() 전면 교체: plan → plan_product_id만 업데이트
[ ] resolveEffectiveLimits() 재작성: plan_products JOIN 기반
[ ] validateInviteCapacity() 재작성: plan_products JOIN 기반
[ ] scheduleDowngrade() 재작성: pending_plan_product_id 기반
[ ] upgradeSubscription() 재설계: override_* 없이 subscription_history 기반
[ ] GET /plans 엔드포인트 제거 (GET /plan-products로 완전 대체)
```

---

## 10. 사용자 실행 명령어

```bash
# 1. schema.ts 수정 완료 후 마이그레이션 파일 생성
pnpm drizzle-kit generate

# 2. 마이그레이션 파일 내용 검토 후 적용
pnpm drizzle-kit migrate

# 3. 백필 SQL은 Neon Console에서 직접 실행 (A-9 섹션 참조)

# 4. 타입 체크
pnpm type-check
```
