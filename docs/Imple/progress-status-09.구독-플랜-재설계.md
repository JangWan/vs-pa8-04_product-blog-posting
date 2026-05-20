# 구독·플랜 재설계 — Phase 4 (구독 주체 개편 + 3티어 플랜)

> 작성일: 2026-05-19 | 참조: docs/Imple/progress-status-09.결제.md · docs/Imple/progress-status-09.결제-빌링전환.md

---

## 1. 재설계 배경

### 기존 구현의 구조적 문제

| 문제 | 현상 | 원인 |
|------|------|------|
| 구독 주체 불명확 | 사용자 A 결제 → 팀원 B도 동일 혜택 | `subscriptions.organization_id` 기준, 조직 단위 플랜 |
| 개인/팀 플랜 미분리 | 단일 `pro` 플랜만 존재 | 팀 플랜 별도 관리 불가 |
| 빌링키 cron 버그 🔴 | 정기결제 100% 실패 | `customerKey: sub.organization_id` (wrong) |
| billingKey 로그 노출 🔴 | `payment_logs.response_body`에 평문 저장 | 마스킹 미적용 |
| 구독 이력 미관리 | 재구독 시 기존 이력 덮어씀 | UNIQUE(organization_id) 전체 적용 |

---

## 2. 핵심 아키텍처 결정

### 2-1. 구독 주체

```
개인 구독 = personal_org(is_personal=true) 에 대한 subscriptions row
팀 구독   = team_org(is_personal=false)   에 대한 subscriptions row

→ subscriptions.organization_id 하나로 통일 (subscriber_type 불필요)
→ is_personal 플래그로 개인/팀 자동 구분
→ 코드 2배 없음: getCustomerKey(orgId) 한 곳에서만 분기
```

### 2-2. 플랜 3티어 확정

| 코드 | 이름 | 가격 | 생성 | 번역 | Agent | 최대 멤버 |
|------|------|------|------|------|-------|---------|
| `free` | Free | ₩0 | 10회/월 | 5회/월 | **0회** | 1명 |
| `pro` | Pro | ₩29,000 | 100회/월 | 50회/월 | 30회/월 | 3명 |
| `max` | MAX | ₩58,000 | 400회/월 | 200회/월 | 120회/월 | 무제한 |

```
Pro: 개인 org 또는 소규모 팀 org (max 3명) 공용
MAX: 팀 org 전용, 무제한 멤버, 4배 한도

개인 org → Pro만 선택 가능
팀   org → Pro 또는 MAX 선택 가능
```

### 2-3. 혜택 결정 규칙

```
[디폴트 팀 — is_personal=true]
  org.plan = 'free'          → Free 한도 (10/5/0)
  org.plan = 'pro'           → 개인 Pro 한도 (100/50/30)

[유료 팀 — is_personal=false]
  org.plan IN ('pro','max')  → 팀 구독 plan 코드 기준 한도 (Pro 또는 MAX)
  org.plan = 'free'          → 0 한도 (구독 없음 = 혜택 없음)
```

**비즈니스 의도**: 팀 협업 혜택은 유료 구독 필수. 디폴트 팀은 사용자 개인 플랜 한도 그대로 사용.  
member_count는 quota 결정에 미사용 → 초대 캡 검증에만 사용.

### 2-4. 취소 및 플랜 변경 정책

```
[기본 원칙]
  한도를 1회라도 사용한 구독 기간은 무조건 구독 기간까지 사용해야 함.
  (usage = 0인 경우에만 즉시 취소/변경 허용)

[취소]
  즉시 취소(cancel-immediate): usage 전부 0일 때만 → 전액 환불, 즉시 종료
  해지 예약(cancel):           cancel_scheduled_at 설정 → 기간 만료 후 취소

[플랜 업그레이드: Pro → MAX]
  즉시 업그레이드 (일할 정산)
  추가 비용  = floor((58000 - 29000) / 30 * 남은_일수)
  남은 한도  = (plan_limit - used_count) * 4  (카테고리별)
  next_billing_at 유지 (원래 날짜 그대로, 다음 달 MAX 가격 청구)
  → subscriptions.scheduled_plan 불필요 (즉시 plan='max'로 변경)
  → override 한도를 subscriptions에 저장 (이번 기간만 유효)

[플랜 다운그레이드: MAX → Pro]
  즉시 적용 불가, 현재 기간 만료 후 다음 결제 시 적용
  subscriptions.scheduled_plan = 'pro' 설정
  현재 기간: MAX 한도 그대로 유지
  다음 결제: Pro 가격(29,000) 청구 + Pro 한도 적용 + scheduled_plan 초기화
```

### 2-5. 팀 개념 (디폴트 팀 vs 유료 팀)

```
[디폴트 팀 — 사용자 생성 시 자동 생성]
  is_personal = true
  역할: 사용자 자신의 무료/Pro 플랜 한도를 사용하는 개인 워크스페이스
  초대: 불가 (validateInviteCapacity → is_personal=true → 차단)
  팀 구독: 없음. 사용자의 개인 구독이 곧 이 공간의 플랜.
  quota: 사용자 개인 구독 플랜 한도 (free 또는 pro)

[유료 팀 — 사용자가 팀 생성 후 추가 생성]
  is_personal = false
  역할: Pro/MAX 구독을 통해 초대한 사용자들과 한도를 공유하는 협업 워크스페이스
  초대: 팀 구독 플랜의 max_members 이내 (Pro=3명, MAX=무제한)
  팀 구독: Pro(₩29,000) 또는 MAX(₩58,000) 선택 필수
  quota: 팀 구독 플랜 한도 (구독 없으면 0 — 개인 플랜 한도 사용 불가)
  공유 풀: 팀 전체가 하나의 한도 풀 공유 (멤버별 분리 없음)
```

---

## 3. DB 스키마 변경 (최종 확정)

### 3-1. subscriptions 테이블

```sql
-- UNIQUE(organization_id) 전체 제거 → 부분 인덱스로 교체
ALTER TABLE subscriptions
  DROP CONSTRAINT subscriptions_organization_id_unique;

CREATE UNIQUE INDEX idx_sub_one_active_per_org
  ON subscriptions(organization_id)
  WHERE status IN ('active', 'past_due');
-- 의미: active/past_due는 조직당 1개만, canceled 이력은 무제한 허용

-- 신규 컬럼
ALTER TABLE subscriptions
  ADD COLUMN customer_key          TEXT,                    -- Toss customerKey 역정규화 (cron 효율화)
  ADD COLUMN payer_user_id         TEXT,                    -- 현재 결제 등록자 user_id
  ADD COLUMN payer_warning         BOOLEAN NOT NULL DEFAULT FALSE,  -- 결제자 탈퇴 배너 플래그
  ADD COLUMN org_deleted_at        TIMESTAMPTZ,             -- 조직 soft-delete 시각 (복구 추적)
  ADD COLUMN scheduled_plan        TEXT,                    -- 다운그레이드 예약 (MAX→Pro 시 'pro')
  ADD COLUMN upgraded_from         TEXT,                    -- 업그레이드 전 플랜 코드 (Pro→MAX 추적)
  ADD COLUMN upgraded_at           TIMESTAMPTZ,             -- 업그레이드 시각
  ADD COLUMN override_generations  INTEGER,                 -- 업그레이드 후 이번 기간 한도 오버라이드
  ADD COLUMN override_translations INTEGER,                 -- 업그레이드 후 이번 기간 한도 오버라이드
  ADD COLUMN override_agent_runs   INTEGER;                 -- 업그레이드 후 이번 기간 한도 오버라이드
```

**컬럼 의미**:
- `customer_key`: 빌링키와 쌍을 이루는 Toss customerKey. cron이 JOIN 없이 직접 사용
- `payer_user_id`: 카드를 등록한 사용자. 탈퇴 경고 및 결제 책임 추적
- `payer_warning`: 결제자가 팀을 탈퇴했을 때 true → 팀 billing 페이지 경고 배너
- `org_deleted_at`: 조직 soft-delete 시 기록 → cron 결제 차단 + 복구 감지
- `scheduled_plan`: 다음 결제 시 적용할 플랜 코드. MAX→Pro 다운그레이드 예약 시 'pro' 저장. 다음 결제 성공 후 NULL로 초기화
- `upgraded_from`: Pro→MAX 업그레이드 전 플랜 코드. 이력 추적 및 오버라이드 한도 계산 기준
- `upgraded_at`: 업그레이드 시각. NULL이면 업그레이드 없음
- `override_generations/translations/agent_runs`: Pro→MAX 업그레이드 후 현재 기간에만 적용하는 한도. NULL이면 플랜 기본값 사용. 다음 결제 사이클 시작 시 NULL로 초기화

### 3-2. organizations 테이블

```sql
ALTER TABLE organizations
  ADD COLUMN payment_customer_key TEXT,    -- 팀 구독용 Toss customerKey (UUID)
  ADD COLUMN member_count INTEGER NOT NULL DEFAULT 1;  -- 초대 캡 + 혜택 결정용

-- member_count 기존 데이터 보정
UPDATE organizations o
SET member_count = (
  SELECT COUNT(*) FROM organization_members om
  WHERE om.organization_id = o.id
);
```

### 3-3. subscription_status_history 테이블 (신규)

```sql
CREATE TABLE subscription_status_history (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      UUID NOT NULL REFERENCES subscriptions(id),
  from_status          VARCHAR(20),          -- NULL = 최초 생성
  to_status            VARCHAR(20) NOT NULL,
  billing_key_changed  BOOLEAN NOT NULL DEFAULT FALSE,
  from_payer_user_id   TEXT,
  to_payer_user_id     TEXT,
  changed_by           TEXT NOT NULL,        -- user_id | 'cron' | 'webhook' | 'system'
  reason               VARCHAR(50) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**reason 허용값 정의**:

| reason | 발생 시점 |
|--------|---------|
| `initial_activation` | 최초 구독 활성화 |
| `payment_success` | 정기결제 성공 |
| `payment_fail_permanent` | 영구 결제 실패 → past_due |
| `payment_method_update` | 결제 방법 변경 (billingKey 교체) |
| `cancel_scheduled` | 해지 예약 |
| `cancel_immediate` | 즉시 취소 (usage=0) |
| `finalized_cancel` | 기간 만료 후 최종 취소 |
| `org_soft_delete` | 조직 soft-delete → billingKey 소거 |
| `org_restore` | 조직 복구 → org_deleted_at 해제 |
| `org_hard_delete` | 조직 hard-delete → 완전 취소 |
| `user_delete` | 사용자 삭제 → 개인 구독 해지 예약 |
| `payer_left` | 결제자 팀 탈퇴 → payer_warning=true |

### 3-4. plans 시드 데이터

```sql
UPDATE plans SET name='Free',  price=0,     max_members=1,    generations_per_month=10,  translations_per_month=5,   agent_runs_per_month=0   WHERE code='free';
UPDATE plans SET name='Pro',   price=29000, max_members=3,    generations_per_month=100, translations_per_month=50,  agent_runs_per_month=30  WHERE code='pro';

DELETE FROM plans WHERE code IN ('pro_team', 'team');
INSERT INTO plans (code, name, price, max_members, generations_per_month, translations_per_month, agent_runs_per_month)
VALUES ('max', 'MAX', 58000, NULL, 400, 200, 120)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, price=EXCLUDED.price, max_members=EXCLUDED.max_members,
  generations_per_month=EXCLUDED.generations_per_month,
  translations_per_month=EXCLUDED.translations_per_month,
  agent_runs_per_month=EXCLUDED.agent_runs_per_month;
```

### 3-5. subscription_status_history reason 추가

기존 reason 허용값에 아래 추가:

| reason | 발생 시점 |
|--------|---------|
| `plan_upgraded` | Pro → MAX 즉시 업그레이드 |
| `downgrade_scheduled` | MAX → Pro 다운그레이드 예약 |
| `downgrade_applied` | 다음 결제 시 다운그레이드 적용 |

### 3-6. orders.kind enum 확장

```
기존: 'new_subscription' | 'recurring' | 'plan_change'
추가: 'payment_method_update' | 'plan_upgrade'
```

- `plan_upgrade`: Pro→MAX 업그레이드 즉시 추가 결제 건. amount = floor((58000-29000)/30 * 남은_일수)

---

## 4. Business Rules (전체)

### BR-P1: 개인 구독 ↔ 팀 구독 독립성

```
개인 Pro  + 팀 Free → 팀 컨텍스트: Free 한도 적용 (개인 Pro 미전이)
개인 Free + 팀 Pro  → 팀 컨텍스트: Pro 한도 적용
현재 선택된 org 컨텍스트 기준으로 플랜 및 quota 결정
```

### BR-P2: 팀 멤버 초대 조건

```
팀 org.plan = 'free'           → 초대 불가 (max_members=1 초과 불가)
팀 org.plan = 'pro'            → max 3명까지 초대 가능
팀 org.plan = 'max' (=pro)     → 무제한 초대 가능
초대자의 개인 플랜은 무관
```

### BR-P3: max_members = 초대 캡 (강제 퇴출 없음)

```
Pro 팀(max 3명) → 구독 취소 → Free 팀
기존 멤버: 강제 퇴출 없음 (grandfather clause)
단, 새 초대 불가 (free 팀 = 초대 차단)
Free 다인 팀 quota = 0 (혜택 없음) → 자연스럽게 멤버 이탈 유도
```

### BR-P4: customerKey 발급 전략

```
개인 org 구독 체크아웃: users.payment_customer_key  (기존)
팀   org 구독 체크아웃: organizations.payment_customer_key (신규)

팀 customerKey로 등록된 billingKey = 팀 소유
→ 결제자가 탈퇴해도 billingKey는 팀에 귀속
→ 다음 정기결제는 계속 진행됨 (팀 관리자가 변경/취소 책임)
```

### BR-P5: 결제 가능 조건 (cron 게이팅)

```sql
status = 'active'
AND billing_key_encrypted IS NOT NULL   -- 빌링키 물리적 존재
AND org_deleted_at IS NULL              -- 조직 삭제 중 아님
AND next_billing_at <= now()
```

### BR-P6: 조직 Soft-Delete 시 구독 처리

```
조직 soft-delete →
  1. subscriptions.billing_key_encrypted = NULL (DB에서 즉시 소거)
  2. subscriptions.org_deleted_at = now()
  3. Toss 측 빌링키 파기는 hard-delete 시점에 수행
  4. org.plan은 'pro' 유지 (복구 가능성 보존)
  ※ 결제는 물리적으로 불가능해짐 (billing_key = NULL)
```

### BR-P7: 조직 복구 시 구독 처리

```
조직 복구 →
  1. organizations.deleted_at = NULL
  2. subscriptions.org_deleted_at = NULL
  3. billing_key_encrypted는 NULL 유지 (복구 후 결제 미등록 상태)
  4. UI: "결제 방법을 재등록하세요" 안내
  5. 결제 방법 재등록 시: next_billing_at = 재등록일 + 1개월 (소급 없음)
```

### BR-P8: 조직 Hard-Delete 시 구독 처리

```
조직 hard-delete (30일 grace 경과 cron) →
  1. Toss DELETE /billing/authorizations/{billingKey} (Toss 측 완전 파기)
  2. subscriptions.status = 'canceled', canceled_at = now()
  3. organizations.plan = 'free'
  환불 없음
```

### BR-P9: 결제자 팀 탈퇴 처리 (A-2)

```
탈퇴 요청 시 payer_user_id === 탈퇴자 확인:
  → 경고 모달: "카드가 {next_billing_at}에 재청구됩니다."
  → 선택: [탈퇴] [취소]
  → 탈퇴 확정:
      subscriptions.payer_warning = true
      팀 관리자 알림: "{next_billing_at}까지 결제 방법 변경 필요"
  → 구독 취소는 팀 관리자만 가능 (탈퇴한 결제자는 취소 불가)
```

### BR-P10: 사용자 삭제 처리

```
Step 1. 비-personal 팀 관리자 체크
  - 다른 관리자 없는 팀 존재 → 차단 ("관리자 이전 또는 팀 삭제 후 탈퇴")
  - 혼자인 팀 → 팀 soft-delete (BR-P6 적용)

Step 2. 개인 구독 해지 예약
  - active 구독 → cancel_scheduled_at = now()
  - next_billing_at = NULL (다음 청구 없음)
  - 현재 기간(current_period_end)까지 혜택 유지

Step 3. 팀 결제자 통보
  - payer_user_id === 삭제 사용자인 팀 구독 → payer_warning = true
  - 해당 팀 관리자 알림 발송

Step 4. 팀원 제거 → 팀 구독 영향 없음

Step 5. personal_org soft-delete → Clerk user delete
```

### BR-P11: 팀 삭제 시 Pro 플랜 즉시 종료

```
팀 삭제 = 구독 즉시 종료 (환불 없음)
  - billingKey DB 소거 (BR-P6)
  - 다음 정기결제 자동 차단 (BR-P5 게이팅)
  - 조직 30일 soft-delete grace는 데이터 복구용으로 유지
```

### BR-P12: Agent UI 처리 (Free plan)

```
Free plan agent_runs_per_month = 0
→ Agent 메뉴 UI는 표시
→ 실행 시도 → "Pro 플랜에서만 사용 가능" 업그레이드 모달
```

### BR-P13: Pro → MAX 업그레이드 규칙

```
조건: status='active', plan='pro', billing_key IS NOT NULL
      (개인 org 또는 팀 org 모두 허용)

처리 순서:
  1. 남은_일수 = CEIL((next_billing_at - now()) / 86400000)
  2. 추가_비용 = floor((58000 - 29000) / 30 * 남은_일수)   ← 소수점 버림
  3. 추가_비용으로 billing_key 즉시 청구 (orders.kind='plan_upgrade')
  4. 카테고리별 오버라이드 한도 계산 및 저장:
       override_generations  = (100 - used_generations)  * 4
       override_translations = (50  - used_translations) * 4
       override_agent_runs   = (30  - used_agent_runs)   * 4
       (음수 방지: MAX(계산값, 0))
  5. subscriptions.plan = 'max'
  6. subscriptions.upgraded_from = 'pro'
  7. subscriptions.upgraded_at = now()
  8. next_billing_at 유지 (변경 없음) → 다음 결제 시 58,000원 청구
  9. history: reason='plan_upgraded'

추가_비용이 0원인 경우 (기간 마지막 날 등):
  → 결제 생략, 나머지 처리(4~9)는 동일 진행
```

### BR-P14: MAX → Pro 다운그레이드 규칙

```
조건: status='active', plan='max', billing_key IS NOT NULL

처리:
  1. subscriptions.scheduled_plan = 'pro'
  2. 현재 기간: MAX 한도 그대로 유지 (override 컬럼 유지)
  3. next_billing_at 유지 (변경 없음)
  4. history: reason='downgrade_scheduled'

cron billing/tick 에서 결제 성공 시 scheduled_plan 처리:
  → if scheduled_plan IS NOT NULL:
      subscriptions.plan = scheduled_plan           ('pro')
      subscriptions.scheduled_plan = NULL
      subscriptions.upgraded_from = NULL
      subscriptions.upgraded_at = NULL
      subscriptions.override_* = NULL              (한도 초기화)
      history: reason='downgrade_applied'

다운그레이드 취소:
  → subscriptions.scheduled_plan = NULL 만으로 복원
```

### BR-P15: 디폴트 팀 초대 차단

```
is_personal=true 인 org에 대한 모든 초대 시도 → 즉시 차단
  → HTTP 400: "개인 워크스페이스에는 멤버를 초대할 수 없습니다."
  → 플랜·멤버 수 무관하게 하드 차단
```

---

## 5. 구독 상태 전체 매트릭스

| status | billing_key | org_deleted_at | payer_warning | cancel_scheduled_at | scheduled_plan | upgraded_from | 명칭 | 결제 가능 |
|--------|-------------|----------------|---------------|---------------------|----------------|---------------|------|-----------|
| active | 있음 | NULL | false | NULL | NULL | NULL | **정상 (Pro)** | ✅ |
| active | 있음 | NULL | false | NULL | NULL | 'pro' | **업그레이드 완료 (MAX)** | ✅ (한도: override 적용) |
| active | 있음 | NULL | false | NULL | 'pro' | 'pro' | **다운그레이드 예약 (MAX→Pro)** | ✅ (현재: MAX 한도) |
| active | 있음 | NULL | true | NULL | - | - | **결제자 탈퇴 경고** | ✅ (청구 계속) |
| active | 있음 | NULL | - | NOT NULL | - | - | **해지 예약** | ✅ |
| active | NULL | NOT NULL | - | - | - | - | **조직 삭제 중** | ❌ |
| active | NULL | NULL | - | - | - | - | **결제 미등록** (복구 후) | ❌ |
| past_due | 있음 | NULL | - | - | - | - | **결제 실패 Grace** | ⚠️ |
| past_due | NULL | NOT NULL | - | - | - | - | **실패+삭제 중** | ❌ |
| canceled | NULL | any | - | - | - | - | **취소 완료** (이력 보존) | ❌ |

---

## 6. 주요 플로우

### 6-1. 팀 Soft-Delete → 복구 → Hard-Delete

```
[팀 삭제 요청]
    │
    ├─ active 구독 존재?
    │    → billing_key_encrypted = NULL  (결제 즉시 차단)
    │    → org_deleted_at = now()
    │    → history: reason='org_soft_delete'
    │    → org.plan은 'pro' 유지 (복구용)
    │
    └─ organizations.deleted_at = now()  (30일 soft-delete)

[30일 이내 복구]
    → organizations.deleted_at = NULL
    → subscriptions.org_deleted_at = NULL
    → billing_key는 NULL 유지 → UI: "결제 방법 재등록" 안내
    → history: reason='org_restore'

[30일 경과 hard-delete cron]
    → Toss DELETE /billing/authorizations/{customerKey 기반}
    → subscriptions.status = 'canceled'
    → organizations.plan = 'free'
    → org hard delete
    → history: reason='org_hard_delete'
```

### 6-2. 결제 방법 변경 (신규 플로우)

```
트리거: 팀 복구 후 재등록 | 결제자 탈퇴 후 관리자 카드 교체

POST /api/billing/subscription/payment-method/init
    → kind='payment_method_update' order 생성
    → customerKey (org.payment_customer_key) 반환

/billing/checkout?mode=update-payment-method
    → requestBillingAuth (동일 org customerKey)
    → 새 authKey → POST /activate (kind='payment_method_update')
    → 기존 subscription row 업데이트:
        billing_key_encrypted = 새 billingKey
        payer_user_id = 현재 사용자
        payer_warning = false
        next_billing_at = now() + 1개월  (소급 없음)
        current_period_end = now() + 1개월
    → history: reason='payment_method_update', billing_key_changed=true
    → 새 row 생성 안 함 (기존 row 갱신)
```

### 6-3. 구독 취소 후 재구독 (이력 보존)

```
[1차 구독]  subscription row 1: status=canceled, billing_key=NULL
[재구독]    subscription row 2: status=active,   billing_key=새 키

→ row 1의 결제 이력: orders WHERE subscription_id = row1.id
→ row 2의 결제 이력: orders WHERE subscription_id = row2.id
→ billing 페이지: 현재 구독 + 이전 구독 이력 전부 조회 가능
```

### 6-4. 멤버 수 변화 → 혜택 즉시 반영

```
Pro 팀(3명) → 구독 취소 → Free(3명) → 혜택 0 (다인 free)
    │
    │ 멤버 2명 자발 탈퇴
    ▼
Free(1명) → 개인 free 혜택 즉시 적용 (member_count ≤ 1)
    │
    │ Pro 재구독
    ▼
Pro(1명) → 멤버 초대 가능 (max 3명까지)
```

### 6-5. Pro → MAX 업그레이드 플로우

```
[사용자: 업그레이드 요청]
    │
    ├─ 조건 검증
    │    → status='active' AND plan='pro' AND billing_key IS NOT NULL
    │    → 실패 시: 400 (업그레이드 불가 상태)
    │
    ├─ 추가 비용 계산
    │    남은_일수 = CEIL((next_billing_at - now()) / 86400000)
    │    추가_비용 = floor(29000 / 30 * 남은_일수)
    │
    ├─ [추가_비용 > 0] 즉시 청구
    │    POST /billing/{billingKey}
    │      amount: 추가_비용
    │      orderName: 'MAX 플랜 업그레이드 (잔여 기간)'
    │    → 성공: order 저장 (kind='plan_upgrade')
    │    → 실패: 업그레이드 중단 (구독 상태 변경 없음)
    │
    ├─ override 한도 계산
    │    used = 현재 이번 달 사용량 조회
    │    override_generations  = MAX((100 - used.generations)  * 4, 0)
    │    override_translations = MAX((50  - used.translations) * 4, 0)
    │    override_agent_runs   = MAX((30  - used.agent_runs)   * 4, 0)
    │
    ├─ subscriptions 업데이트
    │    plan = 'max'
    │    upgraded_from = 'pro', upgraded_at = now()
    │    override_* = 위 계산값
    │    next_billing_at 유지
    │
    ├─ syncOrgPlan() → org.plan='pro' 유지 (max도 pro tier이므로 변경 없음)
    │
    └─ history: reason='plan_upgraded'

[다음 결제 사이클: next_billing_at 도달]
    → 정기결제 58,000원 청구 (MAX 가격)
    → override_* = NULL (한도 초기화, 이제 MAX 기본값 400/200/120 적용)
    → upgraded_from = NULL, upgraded_at = NULL
```

### 6-6. MAX → Pro 다운그레이드 예약 플로우

```
[사용자: 다운그레이드 요청]
    │
    ├─ 조건 검증
    │    → status='active' AND plan='max'
    │    → 실패 시: 400
    │
    ├─ subscriptions.scheduled_plan = 'pro'
    │    (현재 기간 변경 없음: MAX 한도 그대로)
    │
    └─ history: reason='downgrade_scheduled'

[다음 결제 사이클: billing/tick]
    → 정기결제 29,000원 청구 (Pro 가격 — scheduled_plan 기반)
    → 성공 시:
        plan = 'pro'
        scheduled_plan = NULL
        upgraded_from = NULL, upgraded_at = NULL
        override_* = NULL
        history: reason='downgrade_applied'
    → 실패 시: 일반 결제 실패 플로우 동일 (past_due 처리)

[사용자: 다운그레이드 취소]
    → subscriptions.scheduled_plan = NULL
    → UI: "다운그레이드 예약이 취소되었습니다."
```

---

## 7. 코드 아키텍처

### 7-1. 핵심 함수 목록

```typescript
// 단일 분기점: customerKey 조회
getOrCreateCustomerKey(orgId: string, db: DB): Promise<string>
  // is_personal=true  → users.payment_customer_key
  // is_personal=false → organizations.payment_customer_key

// 플랜 혜택 결정 (모든 quota 체크가 이 함수 경유)
resolveEffectiveLimits(orgId: string, db: DB): Promise<UsageLimits>
  // is_personal=true, plan='free'   → free 한도 (10/5/0)
  // is_personal=true, plan='pro'    → pro 한도 (100/50/30)
  // is_personal=false, plan='free'  → {0, 0, 0} (구독 필수)
  // is_personal=false, plan='pro'   → 활성 구독 plan 기준
  //   + override_* NOT NULL이면 override 값 사용 (업그레이드 기간 한도)

// Pro→MAX 즉시 업그레이드
upgradeSubscription(orgId: string, userId: string, db: DB): Promise<void>
  // 1. 조건 검증 (active, plan='pro', billing_key IS NOT NULL)
  // 2. 남은 일수 계산 → 추가 비용 → Toss 즉시 청구
  // 3. 현재 사용량 조회 → override 한도 계산 (남은량 * 4)
  // 4. subscriptions 업데이트 (plan, upgraded_from, upgraded_at, override_*)
  // 5. recordSubscriptionHistory(reason='plan_upgraded')

// MAX→Pro 다운그레이드 예약
scheduleDowngrade(orgId: string, db: DB): Promise<void>
  // 조건: status='active', plan='max'
  // subscriptions.scheduled_plan = 'pro'
  // recordSubscriptionHistory(reason='downgrade_scheduled')

// 다운그레이드 예약 취소
cancelScheduledDowngrade(orgId: string, db: DB): Promise<void>
  // subscriptions.scheduled_plan = NULL

// 구독 상태 → org.plan 동기화 (모든 상태 변경 후 호출 필수)
syncOrgPlan(orgId: string, newStatus: string, db: DB): Promise<void>
  // 'active' → org.plan='pro' / 그 외 → org.plan='free'

// 구독 상태 이력 기록
recordSubscriptionHistory(params: HistoryParams, db: DB): Promise<void>

// 팀 초대 캡 검증
validateInviteCapacity(orgId: string, db: DB): Promise<void>
  // is_personal → 차단
  // plan='free' → 차단
  // plan='pro'|'max' → max_members 체크
```

### 7-2. 체크아웃 플랜 자동 선택

```typescript
// checkout API: 현재 org 기반 자동 결정
const planCode = org.is_personal ? 'pro'           // 개인 → Pro만
               : selectedPlan;                      // 팀 → Pro 또는 MAX 선택 UI

// MAX 플랜 개인 org 차단
if (org.is_personal && body.plan === 'max') {
  return c.json({ error: '개인 워크스페이스는 MAX 플랜을 구독할 수 없습니다.' }, 400);
}
```

### 7-3. cron billing/tick 결제 게이팅

```typescript
const dueSubscriptions = await db.select().from(subscriptions)
  .where(and(
    eq(subscriptions.status, 'active'),
    isNotNull(subscriptions.billing_key_encrypted),  // 빌링키 존재
    isNull(subscriptions.org_deleted_at),            // 조직 삭제 중 아님
    lte(subscriptions.next_billing_at, new Date()),
  ));

// customerKey는 subscriptions.customer_key에서 직접 사용 (JOIN 불필요)
// scheduled_plan 있으면 해당 플랜 가격으로 청구 (다운그레이드 시)
for (const sub of dueSubscriptions) {
  const billingKey = decrypt(sub.billing_key_encrypted);
  const effectivePlan = sub.scheduled_plan ?? sub.plan;
  const amount = (await getPlanDef(effectivePlan, db)).price;

  // 결제 성공 후 처리:
  // if (sub.scheduled_plan) {
  //   → plan = scheduled_plan, scheduled_plan = NULL
  //   → upgraded_from = NULL, upgraded_at = NULL, override_* = NULL
  //   → recordHistory(reason='downgrade_applied')
  // } else {
  //   → override_* = NULL  (업그레이드 기간 한도 초기화, 새 사이클)
  // }
  // tossRequest('POST', `/billing/${billingKey}`, { customerKey: sub.customer_key, amount, ... })
}
```

### 7-4. member_count 원자적 갱신

```typescript
// 팀원 가입 시
await db.update(organizations)
  .set({ member_count: sql`member_count + 1` })
  .where(eq(organizations.id, orgId));

// 팀원 탈퇴/추방 시
await db.update(organizations)
  .set({ member_count: sql`GREATEST(member_count - 1, 0)` })
  .where(eq(organizations.id, orgId));
```

---

## 8. 신규 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/billing/subscription/payment-method/init` | 결제 방법 변경 주문 생성 |
| (기존 activate 재사용) | `/api/billing/orders/:orderId/activate` | kind='payment_method_update'일 때 billingKey만 교체 |
| POST | `/api/billing/subscription/upgrade` | Pro → MAX 즉시 업그레이드 (추가 비용 계산 + 즉시 청구) |
| POST | `/api/billing/subscription/downgrade` | MAX → Pro 다운그레이드 예약 (scheduled_plan 설정) |
| DELETE | `/api/billing/subscription/downgrade` | 다운그레이드 예약 취소 (scheduled_plan = NULL) |

---

## 9. 프론트엔드 변경

### billing/page.tsx 뷰 분기 (업데이트)

```typescript
// 디폴트 팀(is_personal) vs 유료 팀 분리 우선 판단
const effectiveState =
  org.is_personal
    ? org.plan === 'pro' && sub?.plan === 'max' ? 'pro_max'
      : org.plan === 'pro'                      ? 'pro_personal'
      :                                           'free_solo'
    : org.plan === 'pro' && sub?.plan === 'max' ? 'team_max'
      : org.plan === 'pro'                      ? 'team_pro'
      :                                           'team_free';
```

| 뷰 | 표시 내용 |
|----|---------|
| `pro_personal` | Pro 구독 현황, 100/50/30 한도 바, **MAX 업그레이드 버튼**, 해지 예약 버튼 |
| `pro_max` | MAX 구독 현황, override 한도 바 (업그레이드 기간) or 400/200/120, **Pro 다운그레이드 예약 버튼**, 결제 이력 |
| `free_solo` | Free 한도 표시, Pro 업그레이드 CTA |
| `team_pro` | 팀 Pro 구독 현황, **MAX 업그레이드 버튼**, 해지 예약 |
| `team_max` | 팀 MAX 구독 현황, 한도 바 (공유 풀), **Pro 다운그레이드 예약 버튼** |
| `team_free` | "구독이 필요합니다" 안내, Pro/MAX 구독 CTA |
| `free_multi` | "현재 혜택 없음" 안내, 강한 업그레이드 CTA, 팀원 현황 |

### 팀 체크아웃 플랜 선택 UI

```
┌──────────────────────┐  ┌──────────────────────┐
│         Pro           │  │         MAX           │
│     ₩29,000/월        │  │     ₩58,000/월        │
├──────────────────────┤  ├──────────────────────┤
│ 생성  100회/월        │  │ 생성  400회/월        │
│ 번역   50회/월        │  │ 번역  200회/월        │
│ Agent  30회/월        │  │ Agent 120회/월        │
│ 최대 3명              │  │ 멤버 무제한           │
└──────────────────────┘  └──────────────────────┘
  [Pro 시작하기]            [MAX 시작하기]
※ 한도는 팀원 공유 풀
```

### 신규 UI 컴포넌트

| 컴포넌트 | 위치 | 설명 |
|---------|------|------|
| 결제자 탈퇴 경고 배너 | billing/page.tsx | `payer_warning=true` 시 노출 |
| 팀 탈퇴 경고 모달 | org/leave-modal.tsx | payer_user_id === 본인이면 노출 |
| 사용자/팀 삭제 경고 모달 | delete-modal.tsx | pro 구독 중 경고 |
| Agent 업그레이드 모달 | agent/upgrade-modal.tsx | free plan Agent 실행 시 |
| 결제 방법 변경 UI | billing/checkout (update mode) | 팀 복구 후 or 결제자 변경 |

---

## 10. 구현 단계 진행 상태

### Phase A — 즉시 버그 수정 🔴

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| A-01 | cron customerKey 버그 수정: `sub.organization_id` → `sub.customer_key` | `src/app/api/cron/billing/tick/route.ts` | ✅ |
| A-02 | billingKey 로그 마스킹: `BILLING_KEY_ISSUE_RES` 응답에서 billingKey 제거 | `src/lib/toss.ts` | ✅ |
| A-03 | `src/lib/constants.ts` 중앙 enum 파일 신규 (Java enum 패턴) | `src/lib/constants.ts` | ✅ |

### Phase B — DB 마이그레이션

| # | 항목 | 상태 |
|---|------|------|
| B-01 | schema.ts — subscriptions: 9개 컬럼 추가 + UNIQUE→부분 인덱스 변경 | ✅ |
| B-02 | schema.ts — organizations: payment_customer_key + member_count 추가 | ✅ |
| B-03 | schema.ts — subscription_status_history 테이블 신규 | ✅ |
| B-04 | schema.ts — orders.kind enum 확장 (constants.ts에 반영) | ✅ |
| B-05 | billing/backend/constants.ts — MAX 플랜 추가, PLANS 수치 업데이트 | ✅ |
| B-06 | `pnpm drizzle-kit generate` | ✅ 사용자 실행 완료 |
| B-07 | `pnpm drizzle-kit migrate` | ✅ 사용자 실행 완료 |
| B-08 | plans 시드 데이터 실행 | ✅ 사용자 실행 완료 |
| B-09 | member_count 기존 데이터 보정 쿼리 실행 | ✅ 사용자 실행 완료 |

### Phase C — 서비스 레이어

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| C-01 | `getOrCreateCustomerKey()` 개인/팀 분기 | `service.ts` | ✅ |
| C-02 | `resolveEffectiveLimits()` 신규 | `service.ts` | ✅ |
| C-03 | `syncOrgPlan()` 통합 (모든 상태 변경 후 호출) | `service.ts` | ✅ |
| C-04 | `recordSubscriptionHistory()` 신규 | `service.ts` | ✅ |
| C-05 | `validateInviteCapacity()` 신규 | `service.ts` | ✅ |
| C-06 | `activateSubscription()`: customer_key, payer_user_id 저장 추가 | `service.ts` | ✅ |
| C-07 | activate 엔드포인트: payerUserId 전달 | `route.ts` | ✅ |
| C-08 | 체크아웃 API: `getOrCreateCustomerKey` 교체, plan에 'max' 허용 | `route.ts` | ✅ |
| C-09 | `payment-method/init` 엔드포인트 신규 | `route.ts` | ✅ |
| C-10 | 모든 상태 변경 함수에 `recordSubscriptionHistory()` 추가 | `service.ts` | ✅ |
| C-11 | `upgradeSubscription()`: 추가 비용 계산 + 즉시 청구 + override 한도 저장 | `service.ts` | ✅ |
| C-12 | `scheduleDowngrade()` / `cancelScheduledDowngrade()` | `service.ts` | ✅ |
| C-13 | cron billing/tick: scheduled_plan 기반 가격 청구 + 결제 후 override_* 초기화 | `tick/route.ts` | ✅ |
| C-14 | upgrade/downgrade API 엔드포인트 3개 신규 | `route.ts` | ✅ |
| C-15 | `resolveEffectiveLimits()`: is_personal 분기 + override_* 우선 적용 | `service.ts` | ✅ |

### Phase D — 팀 생애주기

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| D-01 | 팀 soft-delete: billing_key=NULL + org_deleted_at 설정 + 이력 기록 | `organizations/backend/route.ts` | ✅ |
| D-02 | 팀 복구: org_deleted_at=NULL (billing_key는 NULL 유지) + 이력 기록 | `organizations/backend/route.ts` | ✅ |
| D-03 | 팀 hard-delete cron: org_deleted_at 30일 경과 구독 canceled 완결 + history | `finalize-canceled` cron | ✅ |
| D-04 | billing/tick: 결제 게이팅 조건 업데이트 (`org_deleted_at IS NULL`) | `tick/route.ts` | ✅ |

### Phase E — 사용자/팀원 생애주기

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| E-01 | 사용자 삭제: 팀 관리자 이전 체크 (혼자인 팀 auto soft-delete) | `app/api/user/route.ts` | ✅ |
| E-02 | 사용자 삭제: 개인 구독 cancel_scheduled + personal org soft-delete | `app/api/user/route.ts` | ✅ |
| E-03 | 사용자 삭제: 팀 결제자 payer_warning=true + history(PAYER_LEFT) | `app/api/user/route.ts` | ✅ |
| E-04 | 팀 탈퇴: POST /org/:id/leave + webhook payer_warning + user.deleted webhook | `org/route.ts` + `webhooks/clerk` | ✅ |
| E-05 | 팀원 가입: member_count +1 원자적 갱신 | `webhooks/clerk/route.ts` | ✅ |
| E-06 | 팀원 탈퇴/추방: member_count -1 원자적 갱신 | `webhooks/clerk/route.ts` | ✅ |

### Phase F — 팀 초대 제어

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| F-01 | `validateInviteCapacity()` 초대 API에 연결 (personal/free/max_members 통합) | `organizations/backend/route.ts` | ✅ |
| F-02 | 팀 org 개인 org invite 시도 차단 (validateInviteCapacity 내 처리) | `organizations/backend/route.ts` | ✅ |

### Phase G — quota 체크 통합

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| G-01 | `/api/billing/usage` → `resolveEffectiveLimits()` 사용 (override_* 반영) | `billing/backend/route.ts` | ✅ |
| G-02 | 콘텐츠 생성 API → `checkQuota` + `incrementQuota` (스트림 전 체크, 성공 후 증가) | `generate/backend/route.ts` | ✅ |
| G-03 | 번역 API → `checkQuota` + `incrementQuota` (스트림 전 체크, 성공 후 증가) | `translations/backend/route.ts` | ✅ |
| G-04 | Agent API → quota 체크 (Agent route 미구현, 추후 연동) | - | ⏳ |

### Phase H — 프론트엔드

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| H-01 | billing/page.tsx: 6가지 뷰 분기 (pro_personal/pro_max/free_solo/team_pro/team_max/team_free) | billing/page.tsx | ✅ |
| H-02 | 팀 체크아웃: Pro vs MAX 비교 선택 UI | checkout/page.tsx | ✅ |
| H-03 | 체크아웃: mode=update-payment-method 분기 | checkout/page.tsx | ✅ |
| H-04 | suspended 배너 컴포넌트 (past-due-banner.tsx 확장) | past-due-banner.tsx | ✅ |
| H-05 | 팀 탈퇴 경고 모달 (결제자) | org/[id]/page.tsx 위험 영역 탭 통합 | ✅ |
| H-06 | 사용자/팀 삭제 경고 모달 | account-info-tab.tsx — DELETE /api/user 연동 | ✅ |
| H-07 | Agent 업그레이드 유도 모달 | features/billing/components/agent-upgrade-modal.tsx | ✅ |
| H-08 | use-billing.ts: useUpgradeToMax, useScheduleDowngrade, useCancelScheduledDowngrade 훅 추가 | use-billing.ts | ✅ |
| H-09 | 사이드바: team_free "구독 없음" 배지 (is_personal=false, plan='free') | sidebar.tsx | ✅ |
| H-10 | billing/page.tsx: MAX 업그레이드 버튼 + 업그레이드 확인 모달 (추가 비용 표시) | billing/page.tsx | ✅ |
| H-11 | billing/page.tsx: Pro 다운그레이드 예약 버튼 + 예약 현황 배지 + 취소 버튼 | billing/page.tsx | ✅ |
| H-12 | billing/page.tsx: team_free 뷰 (구독 CTA) | billing/page.tsx | ✅ |

---

## 11. 변경 파일 전체 목록

```
신규 마이그레이션 파일 (drizzle generate 후 생성)
src/db/schema.ts

src/features/billing/backend/service.ts      (핵심 함수 전체 재작성)
src/features/billing/backend/route.ts        (엔드포인트 추가)
src/features/billing/backend/constants.ts    ('max' 플랜 추가)
src/features/billing/hooks/use-billing.ts    (useUpdatePaymentMethod 추가)

src/lib/toss.ts                              (billingKey 마스킹)

src/app/api/cron/billing/tick/route.ts       (customerKey 버그 수정 + 게이팅)
src/app/api/cron/billing/finalize-canceled/route.ts  (org hard-delete 연동)
src/app/api/orgs/[orgId]/route.ts            (soft-delete/restore 구독 처리)
src/app/api/orgs/[orgId]/members/route.ts    (member_count 동기화)
src/app/api/user/route.ts (or Clerk webhook) (사용자 삭제 처리)

src/app/(dashboard)/billing/page.tsx
src/app/(dashboard)/billing/checkout/page.tsx
src/components/layout/sidebar.tsx
src/components/layout/past-due-banner.tsx    (payer_warning 배너 확장)
src/components/org/leave-modal.tsx           (신규)
src/components/user/delete-modal.tsx         (신규)
src/components/agent/upgrade-modal.tsx       (신규)
```

---

## 12. 사용자 액션 필요 항목

구현 후 사용자가 직접 실행해야 하는 항목:

```bash
# B-06: 마이그레이션 파일 생성
pnpm drizzle-kit generate

# B-07: 마이그레이션 실행
pnpm drizzle-kit migrate

# B-08: plans 시드 데이터 (Neon 콘솔 또는 psql)
-- (문서 §3-4의 SQL 실행)

# B-09: member_count 기존 데이터 보정
UPDATE organizations o
SET member_count = (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id);
```
