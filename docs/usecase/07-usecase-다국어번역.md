# Usecase — 다국어 자동 번역 (Phase 2)
> UC-20~22 | 작성일: 2026-05-17 | 참조: [PRD.md](../PRD.md) · [IA.md](../IA.md) · [TRD.md](../TRD.md) · [usecase-common.md](usecase-common.md)

---

## 1. 개요

| UC | 기능명 | 한 줄 설명 | 관련 URL/액션 |
|----|--------|---------|-------------|
| UC-20 | 번역 생성 (스트리밍) | 원문 콘텐츠를 한국어↔영어로 AI 번역하여 저장한다 (모달 + 실시간 청크 표시) | `/history/[id]` 번역 모달 |
| UC-21 | 번역 조회·재생성 | 저장된 번역본을 탭으로 보고, 필요 시 `force=true`로 재번역한다 | `/history/[id]` 번역 탭 |
| UC-22 | 번역 삭제 | 특정 언어 번역본을 영구 삭제한다 | `/history/[id]` 번역 탭 액션 |

**관련 행위자**: `User`, `System` (Hono API · Gemini API · Neon DB)  
**[PRD](../PRD.md) 매핑**: [추가 제안 기능 §4](../PRD.md#4-추가-제안-기능-향후-로드맵) "다국어 자동 번역"  
**[TRD](../TRD.md) 매핑**: [§3-3](../TRD.md#3-3-데이터베이스-설계-방향) `content_translations` 테이블 / [§3-4](../TRD.md#3-4-api-설계) `/api/contents/:id/translations/**` 4개 엔드포인트  
**지원 언어 ([BR-22](usecase-common.md#2-공통-비즈니스-규칙-common-business-rules))**: 한국어(`ko`) · 영어(`en`) 두 가지만

---

## 2. 사전 조건

- **공통 사전 조건**: [usecase-common.md §5](usecase-common.md#5-공통-사전-조건-common-preconditions) 참조 (PC-01~04)
- **데이터 접근 조건**: PC-05 (콘텐츠 존재) + PC-06 (콘텐츠 `user_id` == 현재 `userId`)
- **UC-20 추가 조건**:
  - 원문(`contents.body`)이 비어 있지 않을 것
  - 선택한 `target_lang`이 원문 `source_lang`과 다를 것 (BR-22)
  - Gemini API quota 잔량이 있을 것 (없으면 5-2 분기)

---

## 3. 정상 흐름

### UC-20 — 번역 생성 (스트리밍)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | `/history/[id]`(또는 `/generate/[id]`)에서 [번역] 버튼 클릭. |
| 2 | 시스템 | `LocalStorage["translation_quota_notice_seen"]` 확인 (BR-21): |
| | | • 미설정(첫 시도) → quota 안내 모달 1회 노출 → 사용자 [확인] 시 플래그 저장 후 다음 단계 진행 |
| | | • 이미 설정 → 곧바로 다음 단계 |
| 3 | 시스템 | 번역 모달 오픈 (shadcn/ui `<Dialog>`, Framer Motion 등장 — [IA §7](../IA.md#7-인터랙션-패턴) 참조). 좌측: 원문 미리보기(읽기 전용), 우측: 빈 영역. 헤더: 원문 언어 Badge + 번역 언어 Dropdown. |
| 4 | 시스템 | Dropdown 옵션 구성: BR-22에 따라 `ko`·`en` 중 `source_lang`과 다른 항목만 활성. 동일 언어는 disabled + 툴팁 "원문 언어로는 번역할 수 없습니다." |
| 5 | `User` | 번역 언어 선택 → [번역 시작] 클릭. |
| 6 | 시스템 | `POST /api/contents/:id/translations/stream` 요청 (`{ target_lang, force: false }`). 기존 `completed` 행 존재 시 409 → 분기 4-1로. |
| 7 | 시스템 | 서버: `content_translations`에 행 UPSERT (`status='streaming'`). Gemini API에 시스템 프롬프트 + 원문 전송. |
| 8 | 시스템 | 응답 ReadableStream을 모달 우측 영역에 청크 단위로 append (실시간 렌더, [IA §7](../IA.md#7-인터랙션-패턴) 번역 스트리밍 정의 참조). |
| 9 | 시스템 | 마지막 청크 `[DONE]{"translationId":"...","seo_meta":{...}}` 수신 → 서버는 `translated_body`·`translated_seo_meta`·`status='completed'` UPDATE. |
| 10 | 시스템 | 클라이언트는 TanStack Query 캐시 invalidate (`['translations', contentId]`). 모달 내부 "{언어명} 번역이 완료되었습니다." 토스트 ([usecase-common §4-3](usecase-common.md#4-3-성공-피드백)). 모달 3초 후 자동 닫힘 (Framer Motion 페이드아웃). |
| 11 | 시스템 | `/history/[id]` 번역 탭에 해당 언어 활성화 — UC-21 흐름으로 자연 연계. |

### UC-21 — 번역 조회·재생성

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 이력 상세에서 번역 탭(예: "영어") 클릭. |
| 2 | 시스템 | `GET /api/contents/:id/translations/:lang` 호출 (TanStack Query `staleTime: 무한` — [TRD §6](../TRD.md#6-성능-요구사항) 참조). |
| 3 | 시스템 | 본문 영역에 마크다운 렌더링 + 메타 정보 (생성일·마지막 수정일·번역 SEO `title`). |
| 4 | 시스템 | 액션 노출: [번역본 복사] [마크다운 다운로드] [다시 번역(재생성)] [번역 삭제 → UC-22]. |
| 5 | `User` | [다시 번역] 클릭. |
| 6 | 시스템 | `<AlertDialog>` 표시 (BR-23): 제목 "기존 번역본을 덮어쓸까요?" / 본문 "현재 영어 번역본이 새 번역으로 교체됩니다. 되돌릴 수 없습니다." / 버튼 [취소] [덮어쓰기(destructive)]. |
| 7 | `User` | [덮어쓰기] 클릭. |
| 8 | 시스템 | UC-20 단계 6에 진입하되 요청 본문 `{ target_lang, force: true }`로 호출. 이후 스트리밍 → 완료 흐름 동일. |

### UC-22 — 번역 삭제

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 번역 탭에서 [번역 삭제] 휴지통 클릭. |
| 2 | 시스템 | `<AlertDialog>` ([usecase-common §4-4](usecase-common.md#4-4-확인-다이얼로그-alertdialog)): 제목 "정말 삭제하시겠습니까?" / 본문 "이 번역본을 삭제하면 복구할 수 없습니다." / 버튼 [취소] [삭제(destructive)]. |
| 3 | `User` | [삭제] 클릭. |
| 4 | 시스템 | `DELETE /api/contents/:id/translations/:lang` 호출. 서버: `content_translations` 행 DELETE. 200 응답. |
| 5 | 시스템 | TanStack Query 캐시 invalidate. 탭 라벨 옆의 본문은 Empty State로 전환 ([usecase-common §4-5](usecase-common.md#4-5-empty-state-패턴) — "{언어명} 번역본이 없습니다." + [번역하기] CTA). "번역본이 삭제되었습니다." 성공 토스트. |

---

## 4. 대안 흐름

### 4-1. 동일 언어 번역본 이미 존재 — 409 응답 (UC-20)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | 서버 409 응답: `{ error: "already_exists", existing: { status, updated_at } }`. |
| 2 | 시스템 | `<AlertDialog>` 표시: "이미 {언어명} 번역본이 있습니다. 덮어쓸까요?" + [취소] [덮어쓰기]. |
| 3 | `User` | [덮어쓰기] → UC-21 단계 8과 동일 흐름 (`force=true` 재요청). |
| | | [취소] → 모달 유지 (사용자가 다른 언어로 변경 가능). |

### 4-2. 번역 quota 안내 모달에서 [확인] (BR-21, UC-20 단계 2)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | shadcn/ui `<Dialog>` 표시 (AlertDialog 아님): 제목 "잠시만요" / 본문 "번역도 AI 생성 횟수에 포함됩니다. 무료 티어 한도가 빠르게 소진될 수 있어요." / 버튼 [확인]. |
| 2 | `User` | [확인] 클릭. |
| 3 | 시스템 | `LocalStorage["translation_quota_notice_seen"] = "true"` 저장. 모달 닫힘 → 번역 모달로 진행. |

### 4-3. 번역 탭에서 본문이 아직 없는 경우 (UC-21 → UC-20 진입)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | 해당 언어의 `content_translations` 행이 없음. Empty State 렌더링 ([usecase-common §4-5](usecase-common.md#4-5-empty-state-패턴)): "{언어명} 번역본이 없습니다." + [번역하기] CTA. |
| 2 | `User` | [번역하기] 클릭 → 번역 모달 오픈 (`target_lang` 사전 선택된 상태로) → UC-20 단계 3부터 진행. |

---

## 5. 예외 흐름

- **공통 예외** (네트워크·세션 만료·403·404·500): [usecase-common.md §3](usecase-common.md#3-공통-예외-처리-common-exception-handling) 참조

### 5-1. 타인 콘텐츠 ID로 번역 시도 (UC-20·21·22)

| 조건 | 처리 |
|------|------|
| `contents.user_id` ≠ 현재 `userId` | 404 응답 (BR-04 + [TRD §5](../TRD.md#5-보안-요구사항) 소유자 검증). 보안상 403 대신 404 — ID 존재 노출 방지. |

### 5-2. Gemini API Rate Limit 초과 (UC-20)

| 조건 | 처리 |
|------|------|
| 스트리밍 시작 전 429 | "AI 서비스가 잠시 혼잡합니다. 1분 후 다시 시도해주세요." warning 토스트 (생성 API와 동일 메시지, [usecase-common §3-1](usecase-common.md#3-1-예외-처리-일람) / [TRD §7](../TRD.md#7-외부-연동)) + 모달 유지 + [재시도] 버튼. |
| 스트리밍 도중 단절 | 서버는 `content_translations.status='failed'` UPDATE + `error_message`에 사유 기록. 클라이언트는 모달 내부 에러 영역 표시 + [다시 번역(force=true)] 버튼. |

### 5-3. 번역 결과가 마크다운 구조를 손상시킨 경우 (UC-20)

| 조건 | 처리 |
|------|------|
| 마크다운 파싱 오류 감지 (코드블록 미닫힘 등) | 서버: 본문은 그대로 저장하되 응답에 `warning: "markdown_structure_warning"` 추가. 클라이언트 토스트 (warning): "번역본의 마크다운 구조가 일부 손상되었을 수 있습니다. 확인 후 [다시 번역]을 시도해주세요." |

### 5-4. 원문과 동일 언어 선택 시도 (UC-20)

| 조건 | 처리 |
|------|------|
| Dropdown disabled 상태에서 강제 요청 (URL 직접 호출 등) | 서버 400 + "원문 언어로는 번역할 수 없습니다." 메시지. 정상 UI에서는 도달 불가 (BR-22). |

### 5-5. 원문 본문 비어 있음 (UC-20)

| 조건 | 처리 |
|------|------|
| `contents.body` 길이 0 | 서버 400 + "원문이 비어 있어 번역할 수 없습니다." 토스트. 모달 자동 닫힘. |

---

## 6. 사후 조건

| UC | DB 변경 |
|----|---------|
| UC-20 (신규 번역 완료) | `content_translations` INSERT: `content_id`, `target_lang`, `translated_body`, `translated_seo_meta`, `status='completed'`, `created_at`, `updated_at` |
| UC-20 (스트리밍 단절) | `content_translations` UPDATE: `status='failed'`, `error_message`, `updated_at` |
| UC-21 (재번역 완료) | `content_translations` UPDATE: `translated_body`, `translated_seo_meta`, `status='completed'`, `updated_at` (기존 행 덮어쓰기, BR-23) |
| UC-21 (조회만) | 변경 없음 |
| UC-22 (삭제) | `content_translations` DELETE — 해당 `(content_id, target_lang)` 행 1건 |

> 부모 콘텐츠(`contents`) 삭제 시 CASCADE로 모든 번역본도 자동 삭제 (BR-24).

---

## 7. UI/UX 고려사항

- **공통 UI 패턴**: [usecase-common.md §4](usecase-common.md#4-공통-ui-패턴-common-ui-patterns) 참조
- **모션 정의**: IA.md §7 (번역 모달 등장 / 본문·번역 탭 전환 / 번역 스트리밍)

**번역 모달 (UC-20)**

| 요소 | 스펙 |
|------|------|
| 컴포넌트 | shadcn/ui `<Dialog>`. 너비 `max-w-4xl`, 높이 `max-h-[85vh]`. |
| 헤더 | 좌측: 원문 언어 Badge (Sage Green). 중앙: 번역 언어 Dropdown. 우측: 닫기(×). |
| 좌측 영역 | 원문 미리보기 (마크다운 렌더, 스크롤 가능). |
| 우측 영역 | 번역 결과 (스트리밍 중에는 청크 append). 미시작 시 placeholder: "번역 언어를 선택하고 [번역 시작]을 눌러주세요". |
| 푸터 | [취소] (Ghost) · [번역 시작] (Sage Green Primary) / 스트리밍 중에는 [중단] (destructive). |
| 스트리밍 인디케이터 | 우측 영역 상단에 spinner + "번역 중... ({언어명})" 텍스트. |
| 에러 영역 | 5-2 발생 시 우측 영역에 빨간 카드: "번역에 실패했습니다." + 사유 + [다시 번역] 버튼. |

**quota 안내 모달 (BR-21, 4-2)**

```
[제목] 잠시만요
[본문] 번역도 AI 생성 횟수에 포함됩니다.
       무료 티어 한도가 빠르게 소진될 수 있어요.
[버튼] [확인]
```

> `<Dialog>` 사용 — `<AlertDialog>` 아님(파괴적 작업 아닌 단순 안내). BR-21에 의해 사용자당 1회만 노출.

**번역 덮어쓰기 AlertDialog (UC-21, BR-23)**

```
[제목] 기존 번역본을 덮어쓸까요?
[본문] 현재 {언어명} 번역본이 새 번역으로 교체됩니다.
       되돌릴 수 없습니다.
[버튼] [취소]  [덮어쓰기]
```

**번역 삭제 AlertDialog (UC-22)**

```
[제목] 정말 삭제하시겠습니까?
[본문] 이 번역본을 삭제하면 복구할 수 없습니다.
[버튼] [취소]  [삭제]
```

**번역 탭 액션 영역 (UC-21)**

| 요소 | 스펙 |
|------|------|
| 액션 정렬 | 본문 우상단 floating bar. 모바일은 본문 하단 sticky. |
| [번역본 복사] | Lucide `<Copy>` 아이콘. 클릭 시 "클립보드에 복사되었습니다." 토스트 ([usecase-common §4-3](usecase-common.md#4-3-성공-피드백) — 04 참조 동일 메시지 재사용). |
| [마크다운 다운로드] | 파일명 규칙: `YYYY-MM-DD-{slug}-{lang}.md` (BR-15 확장 — 원본 파일명에 `-{lang}` suffix). 예: `2026-05-17-nextjs-saas-후기-en.md`. |
| [다시 번역] | Ghost. AlertDialog 후 force=true. |
| [번역 삭제] | Ghost + destructive 색상. 휴지통 아이콘. |

---

## 8. 데이터 요구사항

### API 엔드포인트 ([TRD §3-4](../TRD.md#3-4-api-설계) 단일 정의 참조)

| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| `POST` | `/api/contents/:id/translations/stream` | UC-20·21 (force 분기) |
| `GET` | `/api/contents/:id/translations` | 이력 상세 탭 구성 (UC-15에서 호출) |
| `GET` | `/api/contents/:id/translations/:lang` | UC-21 본문 조회 |
| `DELETE` | `/api/contents/:id/translations/:lang` | UC-22 삭제 |

### 지원 언어 (BR-22)

| 코드 | 표시명 (UI) | 마크다운 다운로드 suffix |
|------|------------|--------------------------|
| `ko` | 한국어 | `-ko` |
| `en` | English (영어) | `-en` |

### 입력·출력 스키마

- 모든 요청·응답 스키마는 **[TRD §3-4](../TRD.md#3-4-api-설계) "Phase 2 — 다국어 번역 스키마"** 단일 정의를 따른다.
- Gemini 번역 프롬프트 본문은 **[TRD §3-4](../TRD.md#3-4-api-설계) "Phase 2 — Gemini 번역 프롬프트 가이드"** 참조.
- 본 문서는 비즈니스 흐름·UX 규칙만 정의하고 스키마는 중복 정의하지 않는다 (SSOT).

---

## 9. 보안 및 권한

| 항목 | 내용 |
|------|------|
| 접근 권한 | `User` 전용 (Clerk 미들웨어 보호) |
| 데이터 소유권 | `/api/contents/:id/translations/**` 모든 엔드포인트는 Hono 미들웨어에서 `contents.user_id == userId` 검증 (BR-04 + [TRD §5](../TRD.md#5-보안-요구사항)). 불일치 시 404. |
| AI 데이터 정책 | BR-09 적용 — 번역 요청 시 원문 전체가 Gemini로 전송됨. 개인정보 포함 금지 약관 명시 + BR-21로 사용자에게 1회 안내. |
| API 키 보호 | `GOOGLE_GENAI_API_KEY`는 서버에서만 사용 (Gemini 호출은 Hono 라우터 내부). 클라이언트 노출 절대 금지. |
| Rate Limit 격리 | 번역 quota는 콘텐츠 생성 quota와 동일 풀을 공유 ([TRD §7](../TRD.md#7-외부-연동)). 사용자 1인당 동시 번역 1건만 허용 (서버 측 `status='streaming'` 행이 있으면 신규 요청 409). |
| XSS 방지 | 번역 결과는 마크다운으로 렌더링 (HTML 직접 삽입 금지, BR-08). |
| 캐시 정책 | TanStack Query `staleTime: 무한` ([TRD §6](../TRD.md#6-성능-요구사항)) — `force=true` 재번역 시에만 명시 invalidate. 불변 데이터로 취급. |
