# 구현 계획 (UC-15~19)

## 0. 사전 작업 — DB·라이브러리

| #   | 항목                                                                     | 비고                                       |
| --- | ------------------------------------------------------------------------ | ------------------------------------------ |
| 0-1 | `pnpm add react-diff-viewer-continued @tanstack/react-virtual`           | TRD §3-1 명시                              |
| 0-2 | `src/db/schema.ts` — `content_versions` 테이블 + `contents.source_lang` 컬럼 | TRD §3-3                                   |
| 0-3 | `src/db/migrations/0004_create_content_versions.sql`                     | `UNIQUE(content_id, version_no)` + CASCADE |
| 0-4 | `src/db/migrations/0006_add_source_lang_to_contents.sql`                 | 기본값 `'ko'`                              |
| 0-5 | 사용자 액션: `pnpm drizzle-kit push` 또는 마이그레이션 실행 안내         |                                            |

---

## 1. 백엔드 API

Hono — `src/features/history/backend/route.ts` 확장 + 신규 `content-versions`

| #   | 메서드 | 엔드포인트                                  | UC         | 비고                                          |
| --- | ------ | ------------------------------------------- | ---------- | --------------------------------------------- |
| 1-1 | GET    | `/api/history`                              | —          | 커서 페이지네이션 보강 (`?limit=20&cursor=`)  |
| 1-2 | DELETE | `/api/history/:id`                          | UC-15(4-1) | CASCADE 의존 (BR-24)                          |
| 1-3 | GET    | `/api/contents/:id/versions`                | UC-16      | `char_diff`·`is_current` 계산, `next_cursor`  |
| 1-4 | POST   | `/api/contents/:id/versions`                | UC-17      | 100KB·중복 본문 검증 (BR-20·5-3)              |
| 1-5 | GET    | `/api/contents/:id/versions/:no`            | UC-16      | 미리보기용 단건                               |
| 1-6 | POST   | `/api/contents/:id/versions/:no/restore`    | UC-18      | 트랜잭션: 안전장치 스냅샷 → UPDATE (BR-19)    |
| 1-7 | GET    | `/api/contents/:id/versions/diff?from=&to=` | UC-19      | 두 버전 본문 그대로 반환                      |
| 1-8 | PUT    | `/api/history/:id` 보강                     | BR-18      | 본문 변경 시 직전 본문 자동 스냅샷            |

> 모두 소유권 검증 미들웨어 (`contents.user_id == userId`) → 불일치 404 (5-1).

---

## 2. 프론트엔드 — TanStack Query 훅

| 파일                                                  | 훅                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/features/history/hooks/use-history-list.ts`      | `useHistoryList` (useInfiniteQuery)                                                            |
| `src/features/history/hooks/use-history-detail.ts`    | `useHistoryDetail`, `useDeleteHistory`                                                         |
| `src/features/content-versions/hooks/use-versions.ts` | `useVersions` (infinite), `useVersion(no)`, `useCreateSnapshot`, `useRestoreVersion`, `useVersionDiff` |

---

## 3. 프론트엔드 — 페이지

| 파일                                                            | UC          | 핵심 UI                                                                       |
| --------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `src/app/(dashboard)/history/page.tsx`                          | —           | 카드 리스트 + IntersectionObserver 무한스크롤 + Empty State                   |
| `src/app/(dashboard)/history/[id]/page.tsx`                     | UC-15       | Tabs(원문/언어 placeholder), 마크다운 렌더, 우상단 액션 5개, 삭제 AlertDialog |
| `src/app/(dashboard)/history/[id]/versions/page.tsx`            | UC-16·17·18 | 타임라인 카드, 미리보기 `<Sheet>`, 복원 AlertDialog, 비교 선택 floating bar   |
| `src/app/(dashboard)/history/[id]/versions/compare/page.tsx`    | UC-19       | `react-diff-viewer-continued` Split/Unified 토글, 메타 비교, 복원 액션        |

---

## 4. 공용 컴포넌트

- `markdown-view.tsx` — `react-markdown` 기반 읽기 전용 렌더 (이미 `mdxeditor` 있지만 detail은 가벼운 렌더만)
- 사이드바 메뉴에 `/history` 라우트는 이미 등록되어 있는지 확인

---

## 5. 검증

- `pnpm type-check` / `pnpm lint` / `pnpm build`
- `docs/Imple/progress-status.md` 갱신
