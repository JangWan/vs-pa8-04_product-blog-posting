# Usecase — 대시보드
> UC-06 | 작성일: 2026-05-15 | 참조: PRD.md · IA.md · TRD.md · usecase-common.md

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| 기능 ID | UC-06 |
| 기능명 | 대시보드 홈 |
| 한 줄 설명 | 로그인 후 첫 진입 화면으로 최근 콘텐츠·지침 현황을 요약하고 핵심 기능으로 빠르게 이동한다 |
| 관련 행위자 | `User` (로그인 사용자) |
| 관련 URL | `/dashboard` |
| 레이아웃 | `DashboardLayout` (Sidebar + Toaster) |

---

## 2. 사전 조건

- **공통 사전 조건**: usecase-common.md §5 참조 (PC-01~04 모두 충족 필요)
- **추가 사전 조건**: 없음

---

## 3. 정상 흐름 — 기존 사용자 (지침 1개 이상)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | `/dashboard` 요청 수신. Clerk 미들웨어 JWT 검증 → `userId` 추출. |
| 2 | 시스템 | `DashboardLayout` 렌더링: `<Sidebar>` (데스크톱) 또는 `<MobileHeader>` + `<MobileSheet>` (모바일). |
| 3 | 시스템 | 병렬로 두 API 호출: `GET /api/history?limit=5` (최근 콘텐츠 5개) + `GET /api/guidelines` (지침 전체 목록). |
| 4 | 시스템 | 로딩 중 스켈레톤 카드 표시 (최근 생성 영역, 지침 현황 영역). |
| 5 | 시스템 | 데이터 수신 후 렌더링: |
| | | • **빠른 시작**: "새 콘텐츠 생성" 버튼 (최상단 강조, Sage Green) → `/generate` |
| | | • **최근 생성**: 최근 5개 콘텐츠 카드 (제목 + 생성일 + 지침명) |
| | | • **지침 현황**: 등록된 지침 수 + "기본 지침" 제목 표시 |
| 6 | `User` | "새 콘텐츠 생성" 버튼 클릭 → `/generate` 이동. |

---

## 4. 대안 흐름

### 4-1. 신규 사용자 — Empty State (지침 0개, 콘텐츠 0개)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1~4 | 시스템 | 정상 흐름과 동일 (API 호출 및 스켈레톤). |
| 5 | 시스템 | 지침 0개·콘텐츠 0개 확인. Empty State 렌더링: |
| | | • 최근 생성 영역: "아직 생성한 콘텐츠가 없습니다" 안내 |
| | | • **지침 등록 유도 배너**: "먼저 AI 지침을 등록해보세요" + "지침 등록하기" CTA 버튼 (강조) |
| 6 | `User` | "지침 등록하기" CTA 클릭 → `/guidelines/new` 이동. |

### 4-2. 최근 콘텐츠 카드 클릭

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 최근 생성 콘텐츠 카드 클릭. |
| 2 | 시스템 | `/generate/[id]` (해당 콘텐츠 ID)로 이동 → 에디터 화면 표시. |

### 4-3. Sidebar 네비게이션 — 데스크톱

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | Sidebar 메뉴 항목 클릭 (대시보드/콘텐츠 생성/AI 지침 관리). |
| 2 | 시스템 | 해당 URL로 이동. 현재 페이지 메뉴 항목에 활성 상태 하이라이트 (Sage Green 좌측 보더 + 배경 Warm White). |

### 4-4. Sidebar 네비게이션 — 모바일 Sheet 열기

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | 모바일(768px 미만)에서 `<MobileHeader>`의 햄버거 아이콘 클릭. |
| 2 | 시스템 | shadcn/ui `<Sheet>` 드로어 슬라이드 인 (`x: -100%→0`, `duration: 0.22`, `ease: cubic-bezier(0.2,0.6,0.25,1)`). |
| 3 | 시스템 | Sheet 내부에 Sidebar와 동일한 메뉴 렌더링. |
| 4 | `User` | 메뉴 항목 클릭 또는 Sheet 외부 클릭/Esc. |
| 5 | 시스템 | 메뉴 클릭 시 해당 URL 이동 + Sheet 닫힘. 외부 클릭/Esc 시 Sheet만 닫힘. |

### 4-5. Sidebar UserButton — 프로필 드롭다운

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | Sidebar 하단 Clerk `<UserButton>` 클릭. |
| 2 | 시스템 | Clerk 드롭다운: 아바타 + 이메일 + "계정 관리" + "로그아웃" 표시. |
| 3 | `User` | "로그아웃" 클릭 → usecase-인증 UC-05 흐름 진행. |

---

## 5. 예외 흐름

- **공통 예외** (네트워크·세션 만료·서버 오류): usecase-common.md §3 참조

### 5-1. API 응답 지연 (스켈레톤 유지)

| 조건 | 처리 |
|------|------|
| `GET /api/history` 또는 `GET /api/guidelines` 응답 3초 초과 | 스켈레톤 카드 계속 표시. 10초 초과 시 warning 토스트: "데이터를 불러오는 중 문제가 발생했습니다. 새로고침 해주세요." |

---

## 6. 사후 조건

- DB 변경 없음 (읽기 전용)
- API: `GET /api/history?limit=5`, `GET /api/guidelines` 호출 → TanStack Query `staleTime: 1분` 캐싱 적용

---

## 7. UI/UX 고려사항

- **공통 UI 패턴**: usecase-common.md §4 참조

**Sidebar (데스크톱 md 이상)**

| 요소 | 스펙 |
|------|------|
| 너비 | `w-64` (256px) 고정 |
| 메뉴 항목 | 대시보드(`/dashboard`), 콘텐츠 생성(`/generate`), AI 지침 관리(`/guidelines`), 생성 이력(`/history` — 비활성·회색) |
| 활성 상태 | 좌측 2px Sage Green 보더 + 배경 Warm White(`#f6f5f4`) |
| 하단 | Clerk `<UserButton>` (아바타 + 이름) |

**최근 생성 콘텐츠 카드**

| 요소 | 스펙 |
|------|------|
| 카드 정보 | 제목(최대 2줄 말줄임) + 생성일(`YYYY.MM.DD`) + 지침명(Badge) |
| 카드 Radius | 8px, Whisper Border |
| 카드 등장 | Framer Motion `staggerChildren: 0.05`, `opacity: 0→1`, `duration: 0.15` |
| 클릭 동작 | `/generate/[id]` 이동 |

**지침 현황**

| 조건 | 표시 |
|------|------|
| 지침 1개 이상 | "지침 N개 등록됨" + 기본 지침 제목 |
| 기본 지침 없음 | "기본 지침 미설정" + `/guidelines` 링크 |

**Empty State (신규 사용자)**

| 요소 | 내용 |
|------|------|
| 아이콘 | Lucide `<FileText>` (Muted 색상) |
| 제목 | "먼저 AI 지침을 등록해보세요" |
| 설명 | "AI가 일관된 브랜드 톤으로 글을 쓸 수 있도록 지침을 등록해주세요." |
| CTA | "지침 등록하기" 버튼 → `/guidelines/new` |

---

## 8. 데이터 요구사항

### API 호출

| 메서드 | 엔드포인트 | 파라미터 | 응답 |
|--------|-----------|---------|------|
| `GET` | `/api/history` | `?limit=5` | 최근 콘텐츠 5개 (id, topic, created_at, guideline_title) |
| `GET` | `/api/guidelines` | 없음 | 지침 전체 목록 (id, title, is_default) |

### 출력 데이터

| 영역 | 표시 데이터 |
|------|-----------|
| 최근 생성 카드 | `topic`(제목), `created_at`(생성일), `guideline_title`(지침명 또는 "삭제된 지침") |
| 지침 현황 | 지침 총 개수, `is_default=true`인 지침의 `title` |

---

## 9. 보안 및 권한

| 항목 | 내용 |
|------|------|
| 접근 권한 | `User` 전용 (Clerk 미들웨어 보호, PC-01 참조) |
| 데이터 소유권 | `GET /api/history`, `GET /api/guidelines` 모두 JWT의 `userId` 기준 필터링 (BR-04) |
