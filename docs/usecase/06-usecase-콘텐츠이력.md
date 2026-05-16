# Usecase — 콘텐츠 이력 관리 (Phase 2)
> UC-15~19 | 작성일: 2026-05-17 | 참조: [PRD.md](../PRD.md) · [IA.md](../IA.md) · [TRD.md](../TRD.md) · [usecase-common.md](usecase-common.md)

---

## 1. 개요

| UC | 기능명 | 한 줄 설명 | 관련 URL |
|----|--------|---------|---------|
| UC-15 | 이력 상세 조회 | 생성된 콘텐츠 한 건의 본문·메타·번역 탭을 확인하고 액션(편집·번역·버전·삭제)을 진입한다 | `/history/[id]` |
| UC-16 | 버전 목록·미리보기 | 콘텐츠의 모든 버전 스냅샷 목록과 각 버전의 미리보기 Drawer를 본다 | `/history/[id]/versions` |
| UC-17 | 버전 수동 스냅샷 | 현재 본문을 새 버전으로 즉시 저장한다 | `/history/[id]/versions` (POST 버튼) |
| UC-18 | 버전 복원 | 특정 버전의 본문으로 현재 콘텐츠를 되돌린다 (복원 직전 본문은 자동 스냅샷) | `/history/[id]/versions` |
| UC-19 | 두 버전 비교 | 두 버전을 Split/Unified Diff로 비교하고 그 자리에서 복원한다 | `/history/[id]/versions/compare?from=A&to=B` |

**관련 행위자**: `User`, `System` (Hono API · Neon DB)  
**[PRD](../PRD.md) 매핑**: [추가 제안 기능 §4](../PRD.md#4-추가-제안-기능-향후-로드맵) "콘텐츠 이력 관리"  
**[TRD](../TRD.md) 매핑**: [§3-3](../TRD.md#3-3-데이터베이스-설계-방향) `content_versions` 테이블 / [§3-4](../TRD.md#3-4-api-설계) `/api/contents/:id/versions/**` 5개 엔드포인트

---

## 2. 사전 조건

- **공통 사전 조건**: [usecase-common.md §5](usecase-common.md#5-공통-사전-조건-common-preconditions) 참조 (PC-01~04)
- **공통 데이터 접근 조건**: PC-05 (콘텐츠 존재) + PC-06 (콘텐츠 `user_id` == 현재 `userId`)
- **UC-17·18 추가 조건**:
  - BR-20 — 스냅샷할 본문이 100KB 이하
  - UC-18은 대상 `version_no`가 콘텐츠에 실제 존재해야 함

---

## 3. 정상 흐름

### UC-15 — 이력 상세 조회

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | `/history` 목록에서 콘텐츠 카드 클릭 → `/history/[id]` 이동. |
| 2 | 시스템 | `GET /api/history/:id` 호출 (소유권 검증 PC-06). 로딩 중 스켈레톤 표시. |
| 3 | 시스템 | 헤더 렌더링: 주제·생성일·지침명·원문 언어 Badge (`source_lang`). |
| 4 | 시스템 | `GET /api/contents/:id/translations` 병렬 호출하여 탭 구성: |
| | | • "원문 ({source_lang 표기})" 탭 — 항상 활성, 본문은 마크다운 렌더링 |
| | | • 그 외 지원 언어 탭 (BR-22: `ko`/`en` 중 원문 외) — 번역 상태에 따라 본문 또는 Empty State |
| 5 | 시스템 | 우상단 액션 노출: [번역 모달 열기 → UC-20] [버전 이력 보기 → UC-16] [편집 → `/generate/[id]`] [복사] [삭제(휴지통 아이콘)] |
| 6 | `User` | 탭 전환·액션 진입으로 후속 UC로 분기. |

### UC-16 — 버전 목록·미리보기

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 이력 상세에서 "버전 이력 보기" 클릭 → `/history/[id]/versions`. |
| 2 | 시스템 | `GET /api/contents/:id/versions?limit=30` 호출. 로딩 중 카드 스켈레톤 5개. |
| 3 | 시스템 | 버전 카드 타임라인 렌더링 (최신 → 오래된 순): |
| | | • `v3` Badge (version_no) |
| | | • 생성일·글자수·직전 대비 ±N자 (`char_diff`) |
| | | • `is_current=true`인 버전에 "현재" Badge (Sage Green) |
| | | • 카드 액션: [미리보기] [복원] [비교 대상으로 선택] |
| 4 | `User` | 특정 카드의 [미리보기] 클릭. |
| 5 | 시스템 | `GET /api/contents/:id/versions/:no` 호출. 우측에서 Drawer 슬라이드 인 ([IA §7](../IA.md#7-인터랙션-패턴) Motion 정의). |
| 6 | 시스템 | Drawer 내부: 버전 메타 + 마크다운 렌더링 + [복원 → UC-18] [닫기]. |
| 7 | 시스템 | 30개 초과 시 무한스크롤 (`next_cursor`로 다음 페이지 요청). 50개 초과 시 가상 스크롤 적용 ([TRD §3-1](../TRD.md#3-1-프론트엔드) 라이브러리 참조). |

### UC-17 — 버전 수동 스냅샷

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 버전 목록 페이지 또는 에디터에서 "현재 본문을 버전으로 저장" 버튼 클릭. |
| 2 | 시스템 | 버튼 비활성화 + 스피너. `POST /api/contents/:id/versions` 호출 (요청 본문 없음). |
| 3 | 시스템 | 서버: 현재 `contents.body`를 그대로 새 `version_no`로 INSERT. BR-20 (100KB 초과) 위반 시 400 반환 → 분기 5-2. |
| 4 | 시스템 | 직전 버전과 본문이 완전 동일하면 서버는 409 반환 → 분기 5-3 (중복 스냅샷 방지). |
| 5 | 시스템 | 201 응답 시 목록 상단에 신규 카드 추가 (낙관적 업데이트). "버전이 저장되었습니다." 성공 토스트 ([usecase-common §4-3](usecase-common.md#4-3-성공-피드백)). |

### UC-18 — 버전 복원

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 버전 카드 또는 미리보기 Drawer에서 [복원] 클릭. |
| 2 | 시스템 | shadcn/ui `<AlertDialog>` 표시 (BR-19 안전장치 안내 포함). |
| 3 | `User` | "복원" 버튼 클릭. |
| 4 | 시스템 | `POST /api/contents/:id/versions/:no/restore` 호출. 서버 측 트랜잭션: |
| | | (a) 현재 `contents.body`·`seo_meta`를 새 `version_no`로 INSERT (BR-19) |
| | | (b) 대상 버전의 `snapshot_body`·`snapshot_seo_meta`를 `contents`에 UPDATE |
| | | (c) `contents.updated_at` 갱신 |
| 5 | 시스템 | 200 응답: `{ restored_from_version_no, new_current_version_no, updated_at }`. |
| 6 | 시스템 | 목록 갱신: "현재" Badge가 복원된 버전으로 이동. 새로 저장된 안전장치 버전이 최상단에 표시. "버전 v{N}으로 복원되었습니다. 직전 본문은 새 버전으로 저장되었습니다." 성공 토스트. |

### UC-19 — 두 버전 비교

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 버전 목록에서 카드 [비교 대상으로 선택] 클릭 (2개까지). |
| 2 | 시스템 | 하단 floating bar 표시: 선택된 버전 칩 + [선택 해제] [비교하기 →]. |
| 3 | `User` | [비교하기] 클릭 → `/history/[id]/versions/compare?from=A&to=B` 이동. |
| 4 | 시스템 | `GET /api/contents/:id/versions/diff?from=A&to=B` 호출. |
| 5 | 시스템 | Diff Viewer 렌더링 ([TRD §3-1](../TRD.md#3-1-프론트엔드) 라이브러리 참조): |
| | | • 기본: Split View (좌 `from` / 우 `to`, 추가=녹·삭제=적, [IA §7](../IA.md#7-인터랙션-패턴) 색상 규칙) |
| | | • [Unified View] 토글로 인라인 모드 전환 |
| | | • 메타 비교 카드: 좌우 SEO `title`·`description`·`keywords` 대비 |
| 6 | 시스템 | 액션 영역: [from(v{A})으로 복원 → UC-18] [to(v{B})로 복원 → UC-18] [목록으로]. |

---

## 4. 대안 흐름

### 4-1. 이력 상세에서 삭제 진행 (UC-15 분기)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 이력 상세 우상단 휴지통 아이콘 클릭. |
| 2 | 시스템 | `<AlertDialog>` 표시 ([usecase-common §4-4](usecase-common.md#4-4-확인-다이얼로그-alertdialog) 패턴 + BR-24 연쇄 안내): 제목 "정말 삭제하시겠습니까?" / 본문 "이력을 삭제하면 모든 버전(`content_versions`)과 번역본(`content_translations`)도 함께 영구 삭제됩니다." / 버튼 [취소] [삭제(destructive)]. |
| 3 | `User` | "삭제" 클릭. |
| 4 | 시스템 | `DELETE /api/history/:id` 호출. 서버: `contents` DELETE → CASCADE로 `content_versions`·`content_translations` 자동 삭제 (BR-24). |
| 5 | 시스템 | `/history` 목록으로 리다이렉트. "이력이 삭제되었습니다." 성공 토스트. |

### 4-2. 버전 0개 — Empty State (UC-16)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | `GET /api/contents/:id/versions` 응답 `data: []` 확인. [usecase-common §4-5](usecase-common.md#4-5-empty-state-패턴) 정의대로 Empty State 렌더링: "아직 저장된 버전이 없습니다. 본문을 편집하면 자동으로 버전이 쌓입니다." (BR-18 안내) |
| | | + [지금 버전으로 저장하기] CTA → UC-17 트리거 |

### 4-3. 비교 대상 1개만 선택한 상태 (UC-19)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | floating bar의 [비교하기] 버튼 비활성화 + "비교할 버전 1개를 더 선택해주세요." 인라인 안내. |

### 4-4. 복원 확인 다이얼로그에서 "취소" 클릭 (UC-18)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | `<AlertDialog>` "취소" 버튼 클릭. |
| 2 | 시스템 | 다이얼로그 닫힘. DB 변경 없음. 목록 유지. |

---

## 5. 예외 흐름

- **공통 예외** (네트워크·세션 만료·403·404·500): [usecase-common.md §3](usecase-common.md#3-공통-예외-처리-common-exception-handling) 참조

### 5-1. 타인 콘텐츠 ID로 직접 접근 (UC-15·16·19)

| 조건 | 처리 |
|------|------|
| `contents.user_id` ≠ 현재 `userId` | [usecase-common §3-1](usecase-common.md#3-1-예외-처리-일람) — 404 처리 (BR-04). 보안상 403 대신 404로 응답하여 ID 존재 여부 노출 방지. |

### 5-2. 본문 100KB 초과 (UC-17, BR-20)

| 조건 | 처리 |
|------|------|
| `snapshot_body` 길이 > 100KB | 서버 400 반환 + 메시지 "본문이 너무 깁니다. 100KB(약 5만자) 이하로 분할해주세요." → 토스트 (error) + 스냅샷 미생성. |

### 5-3. 직전 버전과 본문 완전 동일 (UC-17)

| 조건 | 처리 |
|------|------|
| 직전 `snapshot_body` == 현재 `body` | 서버 409 반환 → "이미 동일한 본문으로 저장된 버전이 있습니다." warning 토스트 ([usecase-common §4-2](usecase-common.md#4-2-에러-메시지-표시-기준)). 신규 카드 생성 안 함. |

### 5-4. 복원 대상 버전이 이미 현재 본문 (UC-18)

| 조건 | 처리 |
|------|------|
| 대상 `version_no`의 `snapshot_body` == 현재 `body` | 서버 409 반환 → "이미 해당 버전 상태입니다." warning 토스트 ([usecase-common §4-3](usecase-common.md#4-3-성공-피드백)). DB 변경 없음. |

### 5-5. diff 파라미터 누락 또는 동일 버전 (UC-19)

| 조건 | 처리 |
|------|------|
| `from` 또는 `to` 누락 | 400 → "비교할 두 버전을 모두 선택해주세요." 토스트 + 버전 목록으로 자동 복귀. |
| `from == to` | 400 → "동일한 버전끼리는 비교할 수 없습니다." 토스트. |

---

## 6. 사후 조건

| UC | DB 변경 |
|----|---------|
| UC-15 (조회) | 변경 없음 |
| UC-15 분기 (삭제, 4-1) | `contents` DELETE + CASCADE로 `content_versions`·`content_translations` 전체 삭제 (BR-24) |
| UC-16 (조회·미리보기) | 변경 없음 |
| UC-17 (수동 스냅샷) | `content_versions` INSERT: `content_id`, `version_no`(직전+1), `snapshot_body`, `snapshot_seo_meta`, `created_at` |
| UC-18 (복원) | (1) `content_versions` INSERT (BR-19 안전장치 버전) + (2) `contents` UPDATE (`body`, `seo_meta`, `updated_at`) — 단일 트랜잭션 |
| UC-19 (비교) | 변경 없음 |

---

## 7. UI/UX 고려사항

- **공통 UI 패턴**: [usecase-common.md §4](usecase-common.md#4-공통-ui-패턴-common-ui-patterns) 참조

**이력 상세 (`/history/[id]`)**

| 요소 | 스펙 |
|------|------|
| 헤더 | 주제(H1) + 메타 줄 (생성일·지침명·`source_lang` Badge). Whisper Border 하단. |
| 본문/번역 탭 | shadcn/ui `<Tabs>`. 탭 라벨: "원문 (한국어)" · "영어". 번역 없는 탭은 [번역하기] CTA만 표시 (Empty State, [usecase-common §4-5](usecase-common.md#4-5-empty-state-패턴)). |
| 본문 렌더 | 마크다운 → HTML (`react-markdown` 등 — [TRD §3-1](../TRD.md#3-1-프론트엔드) 참조). 읽기 전용. |
| 우상단 액션 | [편집] [복사] [번역] [버전 이력 보기] [삭제] — Ghost 버튼 5개. |
| 휴지통 아이콘 | Lucide `<Trash2>`, destructive 색상. AlertDialog 트리거. |

**버전 목록 (`/history/[id]/versions`)**

| 요소 | 스펙 |
|------|------|
| Breadcrumb | `생성 이력 / {주제 말줄임} / 버전 이력` |
| 버전 카드 | 1열 리스트. 좌측: `v{N}` Badge + "현재" Badge(해당 시). 중앙: 생성일·글자수·`char_diff`. 우측: [미리보기] [복원] [비교 선택]. |
| Diff 표기 색 | `char_diff > 0` → Sage Green / `< 0` → Warm Red. 절댓값과 부호 같이 표기 (`+312` / `-58`). |
| floating bar | 비교 선택 2개 이상일 때 화면 하단 sticky. Sage Green 배경. |
| 가상 스크롤 | 50개 이상 시 적용 ([TRD §3-1](../TRD.md#3-1-프론트엔드) 라이브러리 참조). |
| Drawer (미리보기) | shadcn/ui `<Sheet side="right">`. 너비 `max-w-2xl`. 본문 마크다운 + [복원] [닫기]. |

**복원 확인 AlertDialog (UC-18)**

```
[제목] 정말 이 버전으로 복원하시겠습니까?
[본문] 현재 본문은 새 버전으로 자동 저장됩니다.
       복원 후에도 직전 상태로 다시 되돌릴 수 있습니다.
[버튼] [취소]  [복원]
```

**삭제 확인 AlertDialog (UC-15 분기, BR-24)**

```
[제목] 정말 삭제하시겠습니까?
[본문] 이력을 삭제하면 모든 버전(N개)과 번역본(N개)이
       함께 영구 삭제됩니다.
[버튼] [취소]  [삭제]
```

**버전 비교 (`/history/[id]/versions/compare`)**

| 요소 | 스펙 |
|------|------|
| 헤더 | Breadcrumb + 비교 표기 (`v2 ↔ v5`) |
| 모드 토글 | [Split View / Unified View] segmented control. 기본 Split. |
| Diff Viewer | [TRD §3-1](../TRD.md#3-1-프론트엔드) 라이브러리 사용. 색상은 [IA §7](../IA.md#7-인터랙션-패턴) Diff Viewer 표현 참조. |
| 메타 비교 | 좌우 2-column 카드 (title·description·keywords) — keywords는 chip 단위 추가·삭제 색상. |
| 하단 액션 | [v{A}로 복원] [v{B}로 복원] [목록으로] |

---

## 8. 데이터 요구사항

### API 엔드포인트 ([TRD §3-4](../TRD.md#3-4-api-설계) 단일 정의 참조)

| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| `GET` | `/api/contents/:id/versions` | UC-16 목록 |
| `GET` | `/api/contents/:id/versions/:no` | UC-16 미리보기 |
| `POST` | `/api/contents/:id/versions` | UC-17 수동 스냅샷 |
| `POST` | `/api/contents/:id/versions/:no/restore` | UC-18 복원 |
| `GET` | `/api/contents/:id/versions/diff?from=A&to=B` | UC-19 비교 |
| `DELETE` | `/api/history/:id` | UC-15 분기 4-1 삭제 (CASCADE) |

### 입력·출력 스키마

- 모든 요청·응답 스키마는 **[TRD §3-4](../TRD.md#3-4-api-설계) "Phase 2 — 콘텐츠 이력 관리 스키마"** 단일 정의를 따른다.
- 본 문서는 비즈니스 흐름·UX 규칙만 정의하고 스키마는 중복 정의하지 않는다 (SSOT).

---

## 9. 보안 및 권한

| 항목 | 내용 |
|------|------|
| 접근 권한 | `User` 전용 (Clerk 미들웨어 보호) |
| 데이터 소유권 | `/api/contents/:id/versions/**` 모든 엔드포인트는 Hono 미들웨어에서 `contents.user_id == userId` 검증 (BR-04 + [TRD §5](../TRD.md#5-보안-요구사항) 소유자 검증). 불일치 시 404 응답 (ID 노출 방지). |
| 본문 크기 제한 | BR-20 — 서버 측 100KB 검증. 클라이언트는 입력 단계에서 글자 수 카운터로 사전 안내. |
| 복원 안전장치 | BR-19 — 트랜잭션 내에서 (a) 직전 본문 스냅샷 → (b) 복원 순서로 처리. 중간 실패 시 전체 롤백. |
| 삭제 연쇄 | BR-24 — DB 외래키 `ON DELETE CASCADE`로 처리. 애플리케이션 레벨 추가 정리 불필요. |
| Diff 응답 크기 | 두 본문 합산 200KB 초과 시 경고 (대용량 렌더 성능). 클라이언트는 가상 스크롤 옵션 활성화. |
