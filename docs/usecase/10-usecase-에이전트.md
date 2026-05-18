# Usecase — AI Agent 자동화 (Phase 3)
> UC-34~37 | 작성일: 2026-05-17 | 참조: [PRD.md](../PRD.md) · [IA.md](../IA.md) · [TRD.md](../TRD.md) · [SRS.md](../SRS.md) · [usecase-common.md](usecase-common.md)

---

## 1. 개요

| UC | 기능명 | 한 줄 설명 | 관련 URL/액션 |
|----|--------|---------|-------------|
| UC-34 | Agent 생성·설정 | 주제 공급 방식·지침·실행 주기를 정의하여 새 Agent를 등록한다 | `/agents/new` |
| UC-35 | Agent 즉시 실행 | 스케줄을 기다리지 않고 수동으로 Agent를 트리거한다 | `/agents/[id]` [즉시 실행] |
| UC-36 | Agent 자동 실행 (cron, v1.4.1) | **Upstash QStash**가 15분마다 디스패처를 호출하여 도래한 Agent를 실행한다 | cron — 사용자 인지 없음 |
| UC-37 | 도구 호출 트레이스 조회 | 한 Agent 실행의 모든 Function Calling 도구 호출을 시간순으로 본다 | `/agents/[id]/runs/[runId]` |

**관련 행위자**: `Admin` (UC-34 생성·관리), `Member` (UC-35·37 실행·조회), `System` (Upstash QStash Schedule · Gemini Function Calling · DB)  
**[PRD](../PRD.md) 매핑**: [추가 제안 기능 §4](../PRD.md#4-추가-제안-기능-향후-로드맵) "AI Agent 자동화"  
**[SRS](../SRS.md) 매핑**: §2 AI Agent 자동화 (Tool Calling 시스템·3단계 파이프라인·Agent 전용 도구 3종) + BR-33 (cron 최소 1시간)  
**[TRD](../TRD.md) 매핑**: [§3-3](../TRD.md#3-3-데이터베이스-설계-방향) `agent_jobs`·`agent_runs`·`agent_topic_sources`·`agent_tools`·`agent_tool_calls`·`platform_credentials` / [§3-4](../TRD.md#3-4-api-설계) `/api/agents/**` 9개 엔드포인트 + `/api/cron/agents/tick` / Function Calling 시스템 프롬프트

> **Agent 핵심 아키텍처**: Gemini Function Calling API + `agent_tools` 레지스트리(topic_picker · content_writer · platform_publisher). LLM이 컨텍스트를 받고 자율적으로 도구를 선택·호출하며, 각 호출은 `agent_tool_calls`에 한 행씩 기록되어 UI 트레이스로 노출됨.  
> **발행 연동(`platform_publisher`)은 Phase 3.5 분리** — Phase 3에서는 스키마·UI placeholder만, 실제 호출은 `dry_run=true`로 검증만 수행.

---

## 2. 사전 조건

- **공통 사전 조건**: [usecase-common.md §5](usecase-common.md#5-공통-사전-조건-common-preconditions) 참조 (PC-01~04)
- **공통 권한**: 활성 조직의 `plan`이 Pro 이상 (Free=`max_agents=0`, BR-32). Free 플랜은 `/agents` 진입 시 업그레이드 안내만 표시.
- **UC-34**: `Admin` 역할일 것. 현재 Agent 수가 `max_agents` 미만일 것.
- **UC-35**: `Member` 이상. 대상 Agent가 `is_active=true`이고 동일 Agent에 status='running'·'pending'인 run이 없을 것 (동시 실행 차단).
- **UC-36 (cron)**: `agent_jobs.is_active=true` && `next_run_at <= now()` 인 job 존재.
- **UC-37**: `Member` 이상. 대상 `agent_run`이 본인 조직 소속일 것.

---

## 3. 정상 흐름

### UC-34 — Agent 생성·설정

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/agents` → [+ 새 Agent 만들기] 클릭. |
| 2 | 시스템 | `/agents/new` 페이지 진입. 폼 영역 표시: ① 이름(최대 80자) ② 주제 공급 방식(Tabs: `직접 풀` / `키워드 확장`) ③ 적용 지침 Dropdown(조직 공용 지침 목록, BR-34) ④ 출력 언어 RadioGroup(ko/en) ⑤ 실행 주기 위젯(react-js-cron + cronstrue 한글 해석 + 다음 5회 미리보기) ⑥ 발행 연동 Accordion(Phase 3.5 placeholder, disabled) ⑦ 사용 도구 미리보기(GET /api/agents/tools 결과 표시 — read-only 3개 카드) ⑧ 활성화 토글(기본 ON). |
| 3 | `Admin` | 주제 공급: `직접 풀` 선택 시 Textarea에 1줄=1주제 입력(1~100개, 카운터 표시) / `키워드 확장` 선택 시 TagInput으로 시드 1~10개. |
| 4 | `Admin` | 실행 주기 입력. cronstrue가 "매일 오전 9시에" 같은 한글 해석을 실시간 표시. BR-33 검증: 분 단위 와일드카드(`*`) 또는 최소 1시간 미만이면 인라인 에러 + [생성] 버튼 비활성. |
| 5 | `Admin` | [생성] 클릭. |
| 6 | 시스템 | `POST /api/agents { name, topic_source, guideline_id, target_lang, cron_expression, is_active }`. 서버: ① `max_agents` 한도 검증 → 초과 시 402 ② BR-33 cron 재검증 ③ `agent_jobs` INSERT + `next_run_at` 계산(cron 파서) ④ `manual_pool` 타입이면 `agent_topic_sources` 다중 INSERT (`consumed_at=NULL`). |
| 7 | 시스템 | 응답 수신 → "Agent '{name}'이(가) 생성되었습니다." 토스트 → `/agents/[id]`로 리다이렉트. 다음 실행 카운트다운 시작. |

### UC-35 — Agent 즉시 실행 (수동 트리거)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Member` | `/agents/[id]` → [즉시 실행] 클릭. |
| 2 | 시스템 | 선택적 `<Dialog>` 안내: "이번 달 quota 남음: N회 · 실행에 1~3분 소요됩니다 · [실행] [취소]". (※ 한도 0이면 5-1 분기) |
| 3 | `Member` | [실행]. |
| 4 | 시스템 | `POST /api/agents/:id/run`. 서버: ① `usage_quotas` 한도 검증 → 초과 시 402 ② 동일 agent에 status='running' 또는 'pending' run 존재 시 409 ③ `agent_runs` INSERT(`triggered_by='manual'`, `triggered_by_user_id=현재 User`, `status='pending'`) → 즉시 비동기 워커로 위임(Function Calling 루프, §3 UC-36 단계 3과 동일). |
| 5 | 시스템 | "Agent 실행을 시작했습니다 · 완료까지 1~3분 소요됩니다." 토스트 + 사용자를 `/agents/[id]/runs/[runId]`로 자동 이동(트레이스 SSE 구독). |
| 6 | `Member` | 트레이스 페이지에서 도구 호출 카드가 순서대로 append되는 것을 실시간 관찰 (UC-37 흐름과 자연 연계). |

### UC-36 — Agent 자동 실행 (cron, Function Calling 루프)

> 사용자 인지 없는 백엔드 시나리오. 실패·성공은 `/agents/[id]/runs`에서 사후 확인.

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | Upstash QStash | Schedule **15분 통일** (v1.4.1 — `QSTASH_AGENTS_TICK_CRON=*/15 * * * *`) `/api/cron/agents/tick` 호출. 헤더 `Upstash-Signature` JWT + `Upstash-Message-Id` 멱등성. |
| 1' | `System` | `webhook_events.event_id = Upstash-Message-Id` UPSERT (중복 시 즉시 200, BR-37) + `cron_runs` INSERT (cron_code='agents_tick', status='running'). |
| 2 | `System` | `agent_jobs WHERE is_active=true AND next_run_at <= now() AND organization NOT deleted` SELECT FOR UPDATE SKIP LOCKED LIMIT `AGENT_MAX_CONCURRENT_RUNS`(5). |
| 3 | `System` (각 job) | ① `usage_quotas` 한도 검증 → 초과 시 `agent_runs` INSERT(`status='failed'`, `error_code='QUOTA_EXCEEDED'`) 후 종료 ② 정상 → `agent_runs` INSERT(`status='pending'` → 즉시 `'running'` 전환). |
| 4 | `System` (Function Calling 루프 시작) | Gemini API에 시스템 프롬프트 + `functionDeclarations`(agent_tools에서 `is_enabled=true`인 도구만) 전달. 컨텍스트로 `topic_source`·`guideline_id`·`target_lang`·`publish_target`·최근 30개 `selected_topic` 동봉. |
| 5 | `System` (LLM 응답 분기) | **functionCall**: ① `agent_tool_calls` INSERT(`sequence_no`, `tool_code`, `arguments`, `status='pending'`) ② `function_schema`로 arguments Zod 검증 ③ 매핑된 도구 실행 (3-1·3-2·3-3 참조) ④ 결과로 `agent_tool_calls` UPDATE(`result`, `status='success'\|'failed'`, `duration_ms`) ⑤ PII·시크릿 마스킹 필터 적용 후 functionResponse로 LLM에 결과 반환 ⑥ `AGENT_MAX_TOOL_CALLS_PER_RUN`(10) 초과 시 종료(5-3). **final text**(예: "완료"): 루프 종료. |
| 6 | `System` (성공 분기) | content_writer 도구가 1회 호출되어 `contents` INSERT 완료 → `agent_runs.status='completed'`·`generated_content_id` 채움·`finished_at=now()`·`selected_topic` 기록(topic_picker 결과 또는 manual_pool에서 소비된 주제). `agent_jobs.last_run_at=now()`·`next_run_at`=cron 다음 시각. `usage_quotas.agent_runs_used` += 1. |
| 7 | `System` (실패 분기) | `agent_runs.status='failed'`·`error_code` 기록(예: `GEMINI_RATE_LIMIT`·`TOOL_CALL_FAILED`·`TOOL_CALL_LIMIT_EXCEEDED`·`RUN_TIMEOUT`·`TOPIC_POOL_EXHAUSTED`). 재시도 없음 — 다음 스케줄에서 자연 재시도. `agent_jobs.next_run_at`은 정상 갱신(실패도 한 번의 실행으로 카운트). |

#### 3-1. 도구: `topic_picker` (시드 키워드 → 신규 주제 1개)

- **호출 조건**: `agent_jobs.topic_source.type='keyword_expansion'`인 경우 LLM이 자율 호출
- **arguments**: `{ seed_keywords: string[], recent_topics: string[] }` (recent_topics는 서버가 자동 주입하여 LLM 입력 컨텍스트에서 차감)
- **서버 처리**: 별도 Gemini 호출(시스템 프롬프트 — TRD §3-4 "Gemini 주제 발굴 프롬프트")로 long-tail 주제 1개 생성
- **result**: `{ topic: string, rationale: string }`
- **manual_pool 타입의 경우**: LLM이 이 도구를 호출하지 않음 → 서버가 사전에 `agent_topic_sources WHERE consumed_at IS NULL ORDER BY created_at LIMIT 1`로 선택해 컨텍스트에 직접 주입. 모두 소진되면 `TOPIC_POOL_EXHAUSTED` 실패

#### 3-2. 도구: `content_writer` (주제·지침 → 블로그 본문)

- **호출 조건**: 모든 실행에서 정확히 1회 (중복 호출 시 두 번째 호출은 거부 + `agent_tool_calls.status='failed'`)
- **arguments**: `{ topic: string, guideline_id: string | null, target_lang: 'ko'|'en' }`
- **서버 처리**: 기존 `/api/generate/stream` 파이프라인을 내부 함수로 직접 호출 (HTTP 재호출 안 함). 결과 마크다운으로 `contents` INSERT
- **result**: `{ content_id: string, body_preview: string, seo_meta: object }`

#### 3-3. 도구: `platform_publisher` (외부 플랫폼 Draft 전송, Phase 3.5 placeholder)

- **호출 조건**: `agent_jobs.publish_target IS NOT NULL`이고 LLM이 자율 호출
- **arguments**: `{ content_id: string, platform: 'hashnode'|'medium', publication_id?: string, draft_only: boolean }`
- **Phase 3 동작**: 서버가 강제로 `dry_run=true` 처리 — 실제 외부 API 호출 없이 검증만 수행. `result: { status: 'dry_run_skipped', reason: 'phase_3.5 release pending' }`
- **agent_tools.is_enabled=false** 상태이므로 LLM 컨텍스트에 노출되지 않음(`functionDeclarations`에서 제외). 사용자가 publish_target을 설정해도 Phase 3에서는 호출 없이 종료

### UC-37 — 도구 호출 트레이스 조회

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Member` | `/agents/[id]/runs` 표에서 행 클릭 → `/agents/[id]/runs/[runId]`. |
| 2 | 시스템 | `GET /api/agents/:id/runs/:runId` 호출 → 메타 정보(시각·트리거·상태·소요시간·도구 호출 수) + `tool_calls` 인라인 응답(최대 20건). |
| 3 | 시스템 | 트레이스 영역 렌더링: sequence_no ASC 순으로 카드 표시. 각 카드: [도구 아이콘 🎯/✍️/🚀] tool_code · 상태 뱃지(✅success/❌failed/🌫️skipped) · duration_ms · [arguments 토글] [result 토글] (모노스페이스 코드블록). |
| 4 | 시스템 (실행 중인 경우) | `agent_runs.status='running'`이면 자동으로 `GET .../tool-calls` SSE 구독 시작 → 각 도구 호출 종료 시 새 카드 실시간 append. 종료 청크 `[DONE]` 수신 시 SSE 종료 + 결과 영역(생성 콘텐츠 미리보기) 표시. |
| 5 | `Member` (성공 분기) | "결과" 영역에 [에디터로 열기] → `/generate/[id]` 클릭하면 생성된 콘텐츠를 열어 직접 편집 가능. |
| 6 | `Member` (실패 분기) | 실패 도구 카드가 빨간 보더로 강조. error_message 코드블록 펼침. [재시도] 버튼 클릭 시 UC-35 흐름 재진입(수동 트리거). |

---

## 4. 대안 흐름

### 4-1. 활성화 토글 OFF (UC-34 사후)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/agents/[id]` 또는 `/agents` 카드에서 활성화 토글 OFF. |
| 2 | 시스템 | `PATCH /api/agents/:id { is_active: false }`. `next_run_at=NULL`로 설정 → cron이 디스패처에서 제외. 즉시 실행(UC-35)은 여전히 가능. |

### 4-2. Agent 수정 (UC-34 사후, `Admin`)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/agents/[id]` → [수정] (또는 카드 더보기 메뉴). |
| 2 | 시스템 | `/agents/[id]/edit` 또는 모달 폼 (UC-34 동일 폼, prefill). |
| 3 | `Admin` | 변경 후 [저장]. |
| 4 | 시스템 | `PATCH /api/agents/:id { ... }`. cron_expression 변경 시 `next_run_at` 재계산. |

### 4-3. Agent 삭제 (`Admin`)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | [삭제] 클릭. |
| 2 | 시스템 | `<AlertDialog>`: "Agent '{name}'을 삭제하시겠습니까? · 실행 이력은 30일 보관 후 자동 삭제됩니다." |
| 3 | `Admin` | [삭제]. |
| 4 | 시스템 | `DELETE /api/agents/:id`. `agent_jobs` DELETE → CASCADE로 `agent_topic_sources`·`agent_tool_calls` 함께 삭제. `agent_runs`는 유지(30일 보관 후 별도 cron이 정리). 생성된 `contents`는 보존. |

### 4-4. 주제 풀에 추가 (manual_pool 타입, `Admin`)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/agents/[id]` → 주제 풀 현황에서 [주제 추가] (manual_pool만 노출). |
| 2 | `Admin` | 모달에서 추가 주제 입력 (1~N개, 기존 + 신규 합쳐 100개 한도). |
| 3 | 시스템 | `POST /api/agents/:id/topics`(※ TRD §3-4 추가 등록 필요)로 `agent_topic_sources` 다중 INSERT. |

---

## 5. 예외 흐름

- **공통 예외** (네트워크·세션 만료·403·404·500): [usecase-common.md §3](usecase-common.md#3-공통-예외-처리-common-exception-handling) 참조

### 5-1. Quota 초과 (UC-35·UC-36)

| 조건 | 처리 |
|------|------|
| 즉시 실행(UC-35) 요청 시 `usage_quotas.agent_runs_used >= limit` | 402 + `error_code='QUOTA_EXCEEDED'` + 모달 "이번 달 Agent 실행 한도를 모두 사용했습니다." + [업그레이드 →] CTA → `/billing` |
| 자동 실행(UC-36)에서 한도 초과 | `agent_runs` INSERT(`status='failed'`, `error_code='QUOTA_EXCEEDED'`) — 사용자에게 별도 알림 없음, Agent 상세에서만 확인 가능. 다음 결제 주기 전까지 동일 Agent의 후속 스케줄은 자동 skip |

### 5-2. 동시 실행 충돌 (UC-35)

| 조건 | 처리 |
|------|------|
| 동일 Agent에 status='running' 또는 'pending'인 run 존재 시 신규 즉시 실행 요청 | 409 + `error_code='RUN_IN_PROGRESS'` + 토스트 "이미 실행 중입니다 · 완료 후 다시 시도해주세요" + [현재 실행 보기 →] 트레이스 페이지로 이동 |

### 5-3. Function Calling 무한 루프·타임아웃 (UC-36)

| 조건 | 처리 |
|------|------|
| `AGENT_MAX_TOOL_CALLS_PER_RUN`(10) 초과 | 즉시 종료 + `error_code='TOOL_CALL_LIMIT_EXCEEDED'`. 마지막 도구 호출까지 트레이스 보존 |
| `AGENT_RUN_TIMEOUT_MS`(3분) 초과 | 즉시 종료 + `error_code='RUN_TIMEOUT'`. 진행 중이던 도구 호출은 `status='failed'`·`error_message='run timeout'` 기록 |

### 5-4. 주제 풀 소진 (UC-36, manual_pool)

| 조건 | 처리 |
|------|------|
| `agent_topic_sources WHERE consumed_at IS NULL`이 0건 | `agent_runs.status='failed'`·`error_code='TOPIC_POOL_EXHAUSTED'`. Agent 상세 페이지 상단에 amber 배너 "주제 풀이 소진되었습니다 · [주제 추가]" + 다음 스케줄도 동일 실패 반복 (자동 비활성화 X — 사용자가 추가하거나 키워드 확장 타입으로 변경 결정) |

### 5-5. content_writer 중복 호출 (UC-36, LLM 오작동 방어)

| 조건 | 처리 |
|------|------|
| LLM이 content_writer를 2회 이상 호출 시도 | 두 번째 호출부터 서버가 거부 → `agent_tool_calls.status='failed'`·`error_message='duplicate_content_writer_call'` 기록 → LLM에 functionResponse로 거부 사유 반환 → LLM이 final text로 종료하면 정상, 계속 시도하면 5-3 한도로 자연 종료 |

### 5-6. Gemini API Rate Limit (UC-36, content_writer 또는 topic_picker)

| 조건 | 처리 |
|------|------|
| Gemini 429 발생 | 해당 도구 호출 `status='failed'`·`error_message='gemini_rate_limit'`. LLM에 functionResponse로 에러 반환 → LLM이 재시도하면 다시 429 가능성 → 5-3 한도 또는 final text 종료로 자연 마무리. 최종적으로 content_writer 성공 안 한 경우 `agent_runs.status='failed'`·`error_code='GEMINI_RATE_LIMIT'` |

### 5-7. 도구 schema 위반 arguments (UC-36)

| 조건 | 처리 |
|------|------|
| LLM이 `function_schema`와 다른 형식으로 arguments 전달 | Zod 검증 실패 → 도구 실행 안 함 → `agent_tool_calls.status='failed'`·`error_message='invalid_arguments: {detail}'` → LLM에 functionResponse로 schema 안내 반환 (LLM이 자가 수정) |

### 5-8. soft-deleted 조직의 Agent (UC-35·36)

| 조건 | 처리 |
|------|------|
| Agent 소속 조직이 `deleted_at IS NOT NULL` | cron 디스패처가 SELECT 단계에서 제외 (UC-36 단계 2 조건). 사용자가 grace 진입 후 즉시 실행 시도 시 403 + "삭제 예정 조직에서는 실행할 수 없습니다" |

### 5-9. 발행 연동 잘못된 사용 (UC-36, Phase 3 한정)

| 조건 | 처리 |
|------|------|
| `publish_target.draft_only=false` 시도 | 서버가 강제로 `draft_only=true`로 덮어씀 (Phase 3.5 출시 전까지). 사용자가 UI로 변경하려 해도 disabled |
| `platform_publisher` 도구가 LLM에 노출됨 | `agent_tools.is_enabled=false` 상태에서는 `functionDeclarations`에서 제외되므로 LLM이 호출 불가 |

---

## 6. 사후 조건

| UC | DB 변경 |
|----|---------|
| UC-34 | `agent_jobs` INSERT(1행) + manual_pool이면 `agent_topic_sources` N행 INSERT |
| UC-35 | `agent_runs` INSERT(`triggered_by='manual'`, `triggered_by_user_id`, `status='pending'`→`'running'`) |
| UC-36 (정상) | `agent_runs` INSERT + `agent_tool_calls` N행(도구 호출당 1행) + `contents` INSERT(content_writer 결과) + `agent_jobs.last_run_at`·`next_run_at` UPDATE + `usage_quotas.agent_runs_used` += 1 + (manual_pool이면) `agent_topic_sources.consumed_at`·`agent_run_id` UPDATE |
| UC-36 (실패) | `agent_runs.status='failed'`·`error_code` 기록 + 부분적으로 진행된 `agent_tool_calls` 보존 + `agent_jobs.next_run_at` 정상 갱신(실패도 1회 실행으로 카운트) |
| UC-37 | 변경 없음 (조회만) |
| 4-2 (수정) | `agent_jobs` UPDATE + cron 변경 시 `next_run_at` 재계산 |
| 4-3 (삭제) | `agent_jobs` DELETE → CASCADE로 `agent_topic_sources`·`agent_tool_calls` 삭제. `agent_runs`·`contents`는 보존 |
| 4-4 (주제 추가) | `agent_topic_sources` N행 INSERT |

---

## 7. UI/UX 고려사항

- **페이지 영역**: [IA.md §6](../IA.md) `/agents/**` 섹션
- **모달 패턴**: [usecase-common.md §4-4](usecase-common.md#4-4-확인-다이얼로그-alertdialog)

**Agent 카드 (`/agents`)**

| 요소 | 표시 |
|------|------|
| 헤더 | 이름 + 활성 토글 + 액션 메뉴(⋯ admin만) |
| cron 해석 | "매일 오전 9시에" (cronstrue) + 다음 실행: "2시간 14분 후" |
| 최근 실행 | 상태 뱃지(✅/❌) + "5분 전" + 생성 콘텐츠 링크 또는 error_code |
| 액션 | [상세] / [즉시 실행] (member 이상) / [수정·삭제] (admin만) |

**Function Calling 트레이스 카드 (UC-37 핵심 UX)**

```
┌─────────────────────────────────────────────────────────┐
│  #1  🎯 topic_picker          ✅ success    340ms       │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ▸ arguments  (클릭 펼침)                            ││
│  │ ▸ result     (클릭 펼침)                            ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  #2  ✍️ content_writer        ✅ success    18.2s       │
│  ...                                                    │
├─────────────────────────────────────────────────────────┤
│  #3  🚀 platform_publisher    🌫️ skipped (Phase 3.5)   │
│  ▸ "Phase 3.5 출시 예정 — 지금은 dry-run으로만 검증"     │
└─────────────────────────────────────────────────────────┘
```

| 요소 | 스펙 |
|------|------|
| 컴포넌트 | shadcn/ui `<Card>` 세로 스택. 카드 간 간격 8px. |
| 도구 아이콘 | topic_picker `<Target>` / content_writer `<PenLine>` / platform_publisher `<Rocket>` (Lucide) |
| 상태 뱃지 | success=Sage Green / failed=red / skipped=warm-gray + 옅은 hatching |
| 인자·결과 토글 | `<Collapsible>` + 모노스페이스 코드블록 (구문 강조 없음, JSON.stringify(., null, 2)) |
| 실패 카드 | border 2px solid red + 상단에 error_message |
| 실행 중 placeholder | "도구를 선택하고 있습니다..." (spinner) — SSE로 새 카드 들어오면 fade-in 애니메이션 |
| 모바일 | 카드 폭 100%, 인자·결과 토글은 기본 닫힘 |

**Agent 삭제 AlertDialog (4-3)**

```
[제목] Agent를 삭제하시겠습니까?
[본문] '{name}'을(를) 삭제합니다.
       실행 이력(agent_runs)은 30일간 보관 후 자동 삭제됩니다.
       이미 생성된 콘텐츠는 보존됩니다.
[버튼] [취소]  [삭제]
```

**플랜 한도 초과 모달 (5-1, BR-32)**

```
[제목] Agent 실행 한도를 모두 사용했습니다
[본문] 이번 달 Agent 실행: {used}/{limit}회
       (사용량 차트 시각화)
       다음 결제일({reset_at})에 자동으로 리셋됩니다.
[액션] [플랜 업그레이드 →]  [닫기]
```

---

## 8. 데이터 요구사항

### API 엔드포인트 ([TRD §3-4](../TRD.md#3-4-api-설계) 단일 정의 참조)

| 메서드 | 엔드포인트 | UC |
|--------|-----------|-----|
| `GET` | `/api/agents` | `/agents` 진입 |
| `POST` | `/api/agents` | UC-34 |
| `GET` | `/api/agents/:id` | `/agents/[id]` |
| `PATCH` | `/api/agents/:id` | 4-1·4-2 |
| `DELETE` | `/api/agents/:id` | 4-3 |
| `POST` | `/api/agents/:id/run` | UC-35 |
| `GET` | `/api/agents/:id/runs` | 실행 이력 표 |
| `GET` | `/api/agents/:id/runs/:runId` | UC-37 정적 조회 |
| `GET` | `/api/agents/:id/runs/:runId/tool-calls` | UC-37 SSE 스트리밍 |
| `GET` | `/api/agents/tools` | UC-34 도구 미리보기 |
| `POST` | `/api/agents/:id/topics` | 4-4 주제 추가 (※ TRD §3-4 추가 등록 필요) |
| `POST` | `/api/cron/agents/tick` | UC-36 디스패처 |

### 입력·출력 스키마

- 모든 요청·응답 스키마는 **[TRD §3-4](../TRD.md#3-4-api-설계) "Phase 3 — AI Agent 자동화 스키마"** 단일 정의를 따른다.
- Function Calling 시스템 프롬프트·도구별 입출력 명세는 **[TRD §3-4](../TRD.md#3-4-api-설계) "Phase 3 — Agent Function Calling 시스템 프롬프트"** 및 "표준 도구 3개 명세" 참조.

---

## 9. 보안 및 권한

| 항목 | 내용 |
|------|------|
| 인증 | 전 엔드포인트 Clerk JWT 검증 + cron은 **QStash JWT 서명 검증** (`@upstash/qstash` Receiver, v1.4) |
| 역할 검증 | UC-34·4-2·4-3는 `withAdminRole`, UC-35·37은 `withOrganization`(member 이상). cron은 인증 무관(Bearer만) |
| Quota 검증 | UC-35·36 모두 `withOrgQuota` 미들웨어로 BR-32 한도 검증 (402 응답) |
| cron 무한 루프 방지 | `AGENT_MAX_TOOL_CALLS_PER_RUN`(10) + `AGENT_RUN_TIMEOUT_MS`(3분) 가드 (BR-33 보완) |
| 동시 실행 한도 | `AGENT_MAX_CONCURRENT_RUNS`(5) — cron tick당 처리 수 제한 (서버리스 함수 한도 고려) |
| 프롬프트 인젝션 방어 | `seed_keywords`·`initial_topics` 입력 길이 제한 + 이스케이프. LLM에 전달되는 모든 사용자 입력은 system/user 메시지 분리 |
| Function Calling 결과 검증 | LLM이 호출한 `arguments`는 `function_schema`로 Zod 검증 후 실행 |
| **마스킹 이원화 정책 (v1.4.1)** | 도구 실행 결과를 두 경로로 분기 — ① **LLM functionResponse: 원본 그대로 전달** (Agent가 다음 도구 호출에 ID·메타 필요) ② **`agent_tool_calls.result` 저장: 마스킹 적용본** (UI 트레이스에 사용자 노출). 분류 표는 아래 참조 |
| Phase 3.5 격리 | `platform_publisher`는 `agent_tools.is_enabled=false`이므로 LLM 컨텍스트에 노출 안 됨. 사용자 publish_target 설정도 `draft_only=true` 강제 |
| 도구 호출 권한 격리 | content_writer는 활성 조직의 `guidelines`만 접근 가능 (BR-34 조직 공용). 다른 조직의 guideline_id 전달 시 404 |
| Soft-deleted 조직 격리 | cron 디스패처 SELECT 단계에서 `deleted_at IS NULL` 조건으로 제외 (5-8) |

**마스킹 이원화 분류 표 (v1.4.1)**

| 분류 | 예시 필드 | LLM functionResponse | `agent_tool_calls.result` (UI 노출) |
|------|---------|---------------------|-----------------------------------|
| 비밀 아닌 비즈니스 식별자 | `content_id`, `order_id`, `plan`, `status`, `error_code`, `topic`, `rationale` | 원본 유지 | 원본 유지 |
| PII (UI에만 마스킹) | `customer_email`, `phone`, `customer_name` | 원본 유지 (Agent 추론용) | 부분 마스킹 (`kim@*****.com`) |
| 시크릿 (UI에만 마스킹) | `access_token`, `billing_key`, `payment_key`, `card_number_last_4` | 원본 유지 (Agent가 next step 결정 시 필요한 경우) | 부분 마스킹 (`sk_***`, `tok_***`) |
| 양쪽 마스킹 (절대 비공개) | `card_cvv`, `password`, `private_key` | 마스킹 (`***`) | 마스킹 (`***`) + 코드 리뷰 alert |

> 도구 구현 가이드: 도구 함수가 두 가지 반환 객체를 동시에 생성하도록 권장 — `{ forLLM: object, forTrace: object }`. 서버는 `forLLM`을 functionResponse로 전달하고 `forTrace`를 `agent_tool_calls.result`에 저장. 단순 구조의 도구는 한 객체 반환 후 마스킹 함수 통과 가능.
