# IA — IndiePost AI
> 정보 구조도 (Information Architecture)  
> 작성일: 2026-05-15 | 버전: v1.1 (2026-05-17 Phase 2 확장)  
> 참조: [PRD.md](PRD.md) · [TRD.md](TRD.md)
>
> **변경 이력**
> - v1.0 (2026-05-15) 최초 작성 — MVP IA
> - v1.1 (2026-05-17) Phase 2 IA 확장 — `/history/[id]`, `/history/[id]/versions`, `/history/[id]/versions/compare` 신규 + 번역 모달 + 플로우 C/D 추가

---

## 디자인 설정 요약

| 항목         | 선택값                                                      |
| ---------- | -------------------------------------------------------- |
| 컴포넌트 라이브러리 | shadcn/ui + Tailwind v4                                  |
| 브랜드 디자인 방향 | Notion 스타일 (미니멀, 웜 뉴트럴, 콘텐츠 중심)                          |
| 확장 UI      | Magic UI (마이크로 인터랙션) + Aceternity UI (랜딩 히어로 효과)         |
| 모션 라이브러리   | Framer Motion                                            |
| 참조 디자인 가이드 | design_guide-common.md · design_guide-web.md · notion.md |
| 아이콘        | Lucide React (shadcn/ui 번들)                              |
| 폰트         | Inter (Notion 스타일 — NotionInter 대체)                      |

---

## 1. 사이트맵

```
IndiePost AI
│
├── [공개 영역 — Topbar 네비게이션]  AuthLayout 적용: /sign-in, /sign-up
│   ├── /                        랜딩 페이지 (SEO)
│   ├── /sign-in                 로그인         AuthLayout
│   └── /sign-up                 회원가입       AuthLayout
│
├── [인증 영역 — Sidebar 네비게이션]
│   ├── /dashboard               대시보드 홈
│   ├── /generate                콘텐츠 생성
│   │   └── /generate/[id]       생성 결과 에디터 (Phase 2: 번역 모달·버전 진입 버튼 추가)
│   ├── /guidelines              AI 지침 목록
│   │   ├── /guidelines/new      지침 생성
│   │   └── /guidelines/[id]     지침 수정
│   └── /history                 생성 이력 목록 (커서 기반 무한스크롤)
│       └── /history/[id]                              이력 상세 (Phase 2)
│           └── /history/[id]/versions                  버전 목록 (Phase 2)
│               └── /history/[id]/versions/compare      두 버전 비교 Diff (Phase 2)
│
├── [시스템 페이지 — 레이아웃 없음]
│   ├── /not-found               404 페이지 (Next.js not-found.tsx)
│   └── /error                   500 페이지 (Next.js error.tsx)
│
└── [개발자 전용 — 인증 불필요, 프로덕션 비공개]
    └── /design-system           디자인 시스템 플레이그라운드
```

### 인증 전/후 접근 가능 페이지

| 페이지 | 비로그인 | 로그인 후 | SEO 대상 |
|--------|---------|---------|---------|
| `/` 랜딩 | ✅ 접근 가능 | ✅ 접근 가능 | ✅ |
| `/sign-in` 로그인 | ✅ 접근 가능 | 리다이렉트 → `/dashboard` | - |
| `/sign-up` 회원가입 | ✅ 접근 가능 | 리다이렉트 → `/dashboard` | - |
| `/dashboard` | 리다이렉트 → `/sign-in` | ✅ 접근 가능 | - |
| `/generate` | 리다이렉트 → `/sign-in` | ✅ 접근 가능 | - |
| `/generate/[id]` | 리다이렉트 → `/sign-in` | ✅ 접근 가능 | - |
| `/guidelines` | 리다이렉트 → `/sign-in` | ✅ 접근 가능 | - |
| `/guidelines/new` | 리다이렉트 → `/sign-in` | ✅ 접근 가능 | - |
| `/guidelines/[id]` | 리다이렉트 → `/sign-in` | ✅ 접근 가능 | - |
| `/history` | 리다이렉트 → `/sign-in` | ✅ 접근 가능 | - |
| `/history/[id]` **(Phase 2)** | 리다이렉트 → `/sign-in` | ✅ 본인 콘텐츠만 (타인 콘텐츠 → 404) | - |
| `/history/[id]/versions` **(Phase 2)** | 리다이렉트 → `/sign-in` | ✅ 본인 콘텐츠만 | - |
| `/history/[id]/versions/compare` **(Phase 2)** | 리다이렉트 → `/sign-in` | ✅ 본인 콘텐츠만 | - |

---

## 2. 사용자 플로우

### 플로우 A — 신규 사용자 Happy Path (핵심 시나리오)

```
랜딩 페이지(/)
    │  [시작하기 CTA 클릭]
    ▼
회원가입(/sign-up)
    │  [이메일 + 비밀번호 가입 → OTP 이메일 인증]
    ▼
대시보드(/dashboard)
    │  [지침 등록 유도 배너 클릭] ← 최초 진입 시 Empty State
    ▼
지침 생성(/guidelines/new)
    │  [브랜드 톤·문체 지침 입력 후 저장]
    ▼
콘텐츠 생성(/generate)
    │  [주제 입력 + 지침 선택 + 생성 클릭]
    ▼
생성 결과 에디터(/generate/[id])
    │  [초안 검토·수정 후 복사]
    ▼
외부 블로그 플랫폼에 게시
```

### 플로우 B — 재방문 사용자 (지침 등록 완료 후)

```
로그인(/sign-in)
    ▼
대시보드(/dashboard)
    │  [콘텐츠 생성 바로가기 클릭]
    ▼
콘텐츠 생성(/generate)
    │  [주제 입력 → 생성]
    ▼
생성 결과 에디터(/generate/[id])
```

### 플로우 C — 버전 이력 관리·복원 (Phase 2)

```
생성 이력 목록(/history)
    │  [이력 항목 클릭]
    ▼
이력 상세(/history/[id])
    │  [버전 이력 보기 클릭]
    ▼
버전 목록(/history/[id]/versions)
    │  ┌─ [특정 버전 카드 클릭] → 미리보기 Drawer
    │  ├─ [두 버전 선택 + 비교 버튼] → 비교 화면(/history/[id]/versions/compare?from=A&to=B)
    │  └─ [복원 버튼 클릭] → 확인 모달 → POST /restore
    │       ↳ 안전장치: 복원 직전 본문이 새 버전으로 자동 스냅샷
    ▼
이력 상세(/history/[id])  ← 본문이 복원된 상태
    │  [에디터에서 이어서 편집]
```

### 플로우 D — 다국어 번역 생성 (Phase 2)

```
이력 상세(/history/[id])  또는  생성 결과 에디터(/generate/[id])
    │  [번역 버튼 클릭]
    ▼
번역 모달 오픈
    │  ├─ [원문 언어 표시 — Badge]
    │  ├─ [번역 언어 선택 — BR-22: ko/en 중 원문 외만 활성]
    │  └─ [번역 시작 클릭]
    │       ↳ 첫 1회만 quota 안내 모달 (BR-21 — [usecase-common](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 참조)
    ▼
번역 스트리밍 표시 (모달 내부)
    │  ├─ 실시간 마크다운 청크 append
    │  └─ 완료 → 성공 토스트 (메시지 정의: [usecase-common §4-3](usecase/usecase-common.md#4-3-성공-피드백))
    ▼
번역 결과 탭 노출 (이력 상세 페이지에 원문/번역 탭 구성)
    │  ├─ [번역본 복사] / [마크다운 다운로드 — [07-usecase §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조]
    │  └─ [다시 번역] → BR-23 (force=true) 재생성
```

> 모달·토스트의 실제 본문 텍스트는 **[07-usecase-다국어번역.md §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항)** 단일 정의.

### 주요 분기점

| 분기 조건 | 이동 경로 |
|----------|---------|
| 비로그인 상태로 `/generate` 직접 접근 | → `/sign-in?redirect=/generate` |
| 로그인 상태로 `/sign-in` 접근 | → `/dashboard` |
| 대시보드 최초 진입 (지침 0개) | → Empty State + "지침 등록하기" CTA 강조 |
| AI 생성 중 Rate Limit 초과 (429) | → 토스트: "잠시 후 다시 시도해주세요" + 재시도 버튼 |
| 타인 콘텐츠 ID로 `/history/[id]` 직접 접근 **(Phase 2)** | → 404 (소유자 검증 미들웨어 — BR-04) |
| 원문과 동일 언어로 번역 시도 **(Phase 2)** | → 언어 선택 Dropdown에서 비활성화 (BR-22) |
| 동일 언어 번역본 존재 시 재번역 시도 **(Phase 2)** | → 409 응답 → 덮어쓰기 확인 모달 (BR-23, [07-usecase §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조) |
| 버전 복원 시 직전 본문과 동일 **(Phase 2)** | → 409 응답 → warning 토스트 (메시지: usecase-common §4-3) |
| 본문 100KB 초과 시 버전 스냅샷 시도 **(Phase 2)** | → 400 응답 → error 토스트 + 본문 분할 안내 (BR-20) |
| 번역 스트리밍 중 네트워크 끊김 **(Phase 2)** | → `status='failed'` + 에러 영역 + [다시 번역] 버튼 ([07-usecase §5-2](usecase/07-usecase-다국어번역.md#5-예외-흐름) 참조) |

---

## 3. 네비게이션 구조

### 3-1. Topbar (공개 영역 — `/`, `/sign-in`, `/sign-up`)

```
┌──────────────────────────────────────────────────────────┐
│  [IndiePost AI 로고]   [기능]              [로그인] [시작하기▶] │
│  ← Glass & Floating (backdrop-blur:12px, 하단 whisper border)  │
└──────────────────────────────────────────────────────────┘
```

| 요소 | 비로그인 | 로그인 후 |
|------|---------|---------|
| 로고 | `/` 링크 | `/dashboard` 링크 |
| 기능 | 랜딩 `#features` 앵커 링크 | 표시 유지 |
| 로그인 버튼 | `/sign-in` | 미표시 |
| 시작하기 CTA | `/sign-up` | `/dashboard` 바로가기 |

### 3-2. Sidebar (인증 영역 — `/dashboard/**`)

```
┌──────────────────────┐
│  [IndiePost AI 로고]  │  w-64 고정 / 모바일: Sheet 드로어
│  ─────────────────── │
│  [대시보드]           │  /dashboard
│  [콘텐츠 생성]        │  /generate       ← 주요 CTA
│  [AI 지침 관리]       │  /guidelines
│  [생성 이력]          │  /history        (v1.0: 목록 / v1.1 Phase 2: 상세·버전·번역)
│  ─────────────────── │
│  [설정]              │  (Phase 3)
│  ─────────────────── │
│  [UserButton]        │  Clerk UserButton (아바타 + 로그아웃)
└──────────────────────┘
```

**반응형 처리**
- `md` (768px) 이상: 좌측 w-64 Sidebar 고정
- `md` 미만: Sidebar 숨김 → 상단 햄버거 버튼 → shadcn/ui `<Sheet>` 드로어

---

## 4. 페이지 계층 및 URL 구조

| 페이지명 | URL | 레이아웃 | 접근 권한 | 주요 목적 |
|---------|-----|---------|---------|---------|
| 랜딩 | `/` | Topbar | 공개 | 서비스 소개·전환 |
| 로그인 | `/sign-in` | AuthLayout | 공개 | Clerk SignIn (이메일+비밀번호) |
| 회원가입 | `/sign-up` | AuthLayout | 공개 | Clerk SignUp (이메일+비밀번호+OTP) |
| 대시보드 | `/dashboard` | Sidebar | 로그인 필수 | 최근 생성·요약 |
| 콘텐츠 생성 | `/generate` | Sidebar | 로그인 필수 | AI 초안 생성 (F1·F3) |
| 생성 결과 에디터 | `/generate/[id]` | Sidebar | 로그인 필수 | 초안 편집·복사 |
| AI 지침 목록 | `/guidelines` | Sidebar | 로그인 필수 | 지침 CRUD (F2) |
| 지침 생성 | `/guidelines/new` | Sidebar | 로그인 필수 | 새 지침 작성 |
| 지침 수정 | `/guidelines/[id]` | Sidebar | 로그인 필수 | 기존 지침 편집 |
| 생성 이력 | `/history` | Sidebar | 로그인 필수 | 이력 조회·커서 기반 무한스크롤 |
| 이력 상세 | `/history/[id]` | Sidebar | 로그인 필수 | 본문 조회·번역 모달 진입·버전 진입 **(Phase 2)** |
| 버전 목록 | `/history/[id]/versions` | Sidebar | 로그인 필수 | 버전 카드 목록·미리보기·복원·비교 선택 **(Phase 2)** |
| 버전 비교 | `/history/[id]/versions/compare` | Sidebar | 로그인 필수 | Diff Viewer (`?from=A&to=B`) **(Phase 2)** |
| 404 | `/not-found` | 없음 | 공개 | Next.js not-found.tsx — 존재하지 않는 URL |
| 500 | `/error` | 없음 | 공개 | Next.js error.tsx — 런타임 에러 |
| 디자인 시스템 | `/design-system` | 없음 | 개발 전용 | 컴포넌트 플레이그라운드 (프로덕션 비공개) |

---

## 5. 공통 레이아웃 컴포넌트

### 인증 폼 영역 (`AuthLayout`)

| 항목 | 내용 |
|------|------|
| 적용 페이지 | `/sign-in`, `/sign-up` |
| 구조 | 화면 중앙 카드 (`max-w-md`, `mx-auto`, `mt-24`) |
| 배경 | Warm White `#f6f5f4` |
| PublicHeader | 미표시 |
| Footer | 미표시 |

### 공개 영역 공통 (`PublicLayout`)

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `<PublicHeader>` | 최상단 | Topbar 네비게이션 (Glass floating) |
| `<Footer>` | 최하단 | 저작권·링크 (랜딩 페이지에만 표시) |

### 인증 영역 공통 (`DashboardLayout`)

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `<Sidebar>` | 좌측 w-64 | 메뉴 네비게이션 |
| `<MobileHeader>` | 모바일 상단 | 햄버거 + 로고 |
| `<MobileSheet>` | 모바일 드로어 | Sidebar 내용 동일 |
| `<Toaster>` | 우하단 | shadcn/ui Toast (성공·오류 알림) |

### 페이지 공통 레이아웃 구조

```
페이지 루트
└── Layout (PublicLayout 또는 DashboardLayout)
    └── <main>
        └── <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            └── 페이지 콘텐츠
```

---

## 6. 콘텐츠 구성 (페이지별 주요 영역)

### `/` 랜딩 페이지

| 섹션 | 컴포넌트 | 설명 |
|------|---------|------|
| Hero | Aceternity UI 배경 효과 + Magic UI TypingAnimation | 핵심 가치 한 문장 + CTA 1개 (시작하기 → `/sign-up`) |
| 문제 제기 | 3-column 카드 (Whisper 보더) | 인디해커의 3가지 고통 |
| 기능 소개 | 교대 배경 섹션 (White ↔ Warm White `#f6f5f4`) | F1·F2·F3 기능별 설명 + 스크린샷 |
| 유사 서비스 비교 | 비교 테이블 | Copy.ai · Jasper · Hashnode vs IndiePost |
| CTA 섹션 | Magic UI Ripple + 버튼 | "지금 무료로 시작하기" |

### `/dashboard` 대시보드

| 영역 | 설명 |
|------|------|
| 빠른 시작 | "새 콘텐츠 생성" 버튼 (최상단 강조) |
| 최근 생성 | 최근 5개 콘텐츠 카드 (제목·날짜·지침명) |
| 지침 현황 | 등록된 지침 수 + "기본 지침" 표시 |
| Empty State | 지침 0개 시: "먼저 AI 지침을 등록해보세요" + 등록 CTA |

### `/generate` 콘텐츠 생성

| 영역 | 설명 |
|------|------|
| 주제 입력 | Textarea (주제명 필수 / 키워드·방향 선택) |
| 지침 선택 | Dropdown (등록된 지침 목록 / 없을 시 "기본 SEO 지침" 자동 선택) |
| 생성 버튼 | "AI 초안 생성" CTA (Magic UI Ripple 효과) |
| 생성 결과 | 스트리밍 텍스트 실시간 표시 → 완료 시 에디터 전환 |

### `/generate/[id]` 생성 결과 에디터

| 영역 | 설명 |
|------|------|
| 마크다운 에디터 | 생성된 초안 표시 + 인라인 편집 |
| 메타 정보 | 사용된 지침명·생성일·키워드 표시 |
| 액션 버튼 | "저장" (Primary) / "전체 복사" / "마크다운 다운로드" |

### `/guidelines` AI 지침 목록

| 영역 | 설명 |
|------|------|
| 지침 카드 목록 | 등록된 지침 (제목·미리보기·기본 지침 여부 Badge) |
| 새 지침 추가 | 우상단 "+" 버튼 → `/guidelines/new` |
| Empty State | "첫 번째 AI 지침을 등록해보세요" + 등록 CTA |

### `/history` 생성 이력 목록

| 영역 | 설명 |
|------|------|
| 이력 카드 목록 | 카드별: 주제·생성일·지침명·번역 언어 Badge **(Phase 2)** |
| 무한스크롤 | 커서 기반 (한 페이지 20개) — 라이브러리/구현은 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조 |
| 카드 클릭 | → `/history/[id]` 이력 상세 |
| Empty State | "아직 생성한 콘텐츠가 없습니다" + 콘텐츠 생성 CTA |

### `/history/[id]` 이력 상세 **(Phase 2)**

| 영역 | 설명 |
|------|------|
| 헤더 | 주제·생성일·지침명·원문 언어 Badge |
| 본문/번역 탭 | "원문 (한국어)" / "영어" 탭 전환 — 번역 없는 언어는 "번역하기" CTA만 표시 |
| 본문 영역 | 마크다운 렌더링 (읽기 전용 미리보기) — 편집은 `/generate/[id]`에서 |
| 우상단 액션 | [번역 모달 열기] / [버전 이력 보기 → /versions] / [편집 → /generate/[id]] / [복사] |
| 번역 결과 영역 | 번역 본문 + [번역본 복사] [마크다운 다운로드] [다시 번역(force)] [번역 삭제] |

### `/history/[id]/versions` 버전 목록 **(Phase 2)**

| 영역 | 설명 |
|------|------|
| 헤더 | 콘텐츠 주제 + Breadcrumb (`/history` → 상세 → 버전) |
| 버전 타임라인 | 카드별: `v3` Badge·생성일·글자수·직전 대비 ±N자·"현재" Badge (해당 시) |
| 카드 액션 | [미리보기 Drawer] / [복원] / [비교 대상으로 선택] |
| 비교 모드 | 카드 2개 선택 시 하단 floating bar에 [선택 해제] [비교하기 →] 노출 |
| 가상 스크롤 | 50개 이상 시 적용 — 라이브러리/구현은 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조 |
| Empty State | "아직 저장된 버전이 없습니다. 본문을 편집하면 자동으로 버전이 쌓입니다" |

### `/history/[id]/versions/compare?from=A&to=B` 버전 비교 **(Phase 2)**

| 영역 | 설명 |
|------|------|
| 헤더 | Breadcrumb + 비교 중인 버전 표시 (`v2 ↔ v5`) |
| 비교 모드 토글 | [Split View / Unified View] — 라이브러리/prop은 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조 |
| Diff Viewer | 좌측 `from` / 우측 `to` 마크다운 line-by-line, 추가·삭제·변경 색상 구분 (라이브러리는 [TRD §3-1](TRD.md#3-1-프론트엔드) 참조) |
| 메타 비교 | 좌우 SEO 메타(title·description·keywords) 카드 비교 |
| 액션 | [from으로 복원] [to로 복원] [목록으로] |

---

## 7. 인터랙션 패턴

### 모달

| 사용 시점 | 내용 | 정의 위치 |
|---------|------|---------|
| 지침 삭제 확인 | "이 지침을 삭제하면 해당 지침으로 생성된 이력에 영향을 줄 수 있습니다." + 삭제 / 취소 버튼 | usecase-지침관리 참조 |
| 번역 생성 모달 **(Phase 2)** | 원문/번역 좌·우 2분할, 언어 Dropdown(BR-22), 스트리밍 결과 영역 | **[07-usecase-다국어번역 §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조** (본문 텍스트 SSOT) |
| 번역 quota 안내 **(Phase 2)** | 첫 시도 1회 안내 — BR-21로 동작 정의 | **[07-usecase-다국어번역 §4-2](usecase/07-usecase-다국어번역.md#4-대안-흐름) 참조** |
| 번역 덮어쓰기 확인 **(Phase 2)** | BR-23 (`force=true`) 재요청 전 사용자 확인 | **[07-usecase-다국어번역 §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조** |
| 번역 삭제 확인 **(Phase 2)** | [usecase-common §4-4](usecase/usecase-common.md#4-4-확인-다이얼로그-alertdialog) 공통 삭제 다이얼로그 패턴 | **[07-usecase-다국어번역 §7](usecase/07-usecase-다국어번역.md#7-uiux-고려사항) 참조** |
| 버전 복원 확인 **(Phase 2)** | BR-19 안전장치(직전 본문 자동 스냅샷) 안내 포함 | **[06-usecase-콘텐츠이력 §7](usecase/06-usecase-콘텐츠이력.md#7-uiux-고려사항) 참조** |
| 버전 미리보기 Drawer **(Phase 2)** | 우측에서 슬라이드 인 — 본문 마크다운 렌더링 + [복원] [닫기] | **[06-usecase-콘텐츠이력 §7](usecase/06-usecase-콘텐츠이력.md#7-uiux-고려사항) 참조** |

> **SSOT 원칙**: 모달 본문 문구·버튼 라벨 등 실제 노출 텍스트는 각 usecase 문서의 §7 단독 정의. IA는 모달의 **존재·구조·진입 조건**만 기술한다.

### 토스트 (우하단, 5초 자동 닫힘)

> 토스트 메시지 전체 정의 → **[usecase-common.md §4-3](usecase/usecase-common.md#4-3-성공-피드백)·[§4](usecase/usecase-common.md#4-공통-ui-패턴-common-ui-patterns) 참조** (SSOT 원칙 — IA에서 중복 정의 금지)

### 스켈레톤 로딩

| 페이지 | 적용 대상 |
|--------|---------|
| 대시보드 | 최근 생성 카드 목록 |
| 지침 목록 | 지침 카드 목록 |
| 생성 이력 | 이력 카드 목록 |
| 이력 상세 **(Phase 2)** | 본문 라인 8줄·메타 카드·액션 버튼 영역 |
| 버전 목록 **(Phase 2)** | 버전 카드 5개 (`Skeleton` 높이 80px) |
| 버전 비교 **(Phase 2)** | 좌·우 Diff 영역 각 12줄 |

### AI 생성 스트리밍

- 생성 버튼 클릭 → 로딩 스피너 + "AI가 초안을 작성하고 있습니다..." 텍스트
- 스트리밍 시작 → 텍스트 실시간 append (청크 단위)
- 생성 완료 → 에디터 모드 전환 + "초안 생성 완료" 토스트

### AI 번역 스트리밍 **(Phase 2)**

구조·UX 진행 순서만 정의 — 실제 텍스트(토스트·에러 메시지)는 **[07-usecase-다국어번역 §3](usecase/07-usecase-다국어번역.md#3-정상-흐름)·[§5](usecase/07-usecase-다국어번역.md#5-예외-흐름)** 참조.

- 번역 모달 오픈 → 언어 선택 → [번역 시작]
- 스트리밍: 좌측 원문 고정, 우측 영역에 청크 append (모션 정의는 아래 Framer Motion 표)
- 마지막 청크 `[DONE]{...}` ([TRD §3-4](TRD.md#3-4-api-설계) 마지막 청크 형식 참조) → 캐시 invalidate
- 성공: 토스트([usecase-common §4-3](usecase/usecase-common.md#4-3-성공-피드백)) + 모달 자동 닫힘 (3초)
- 실패: 모달 내부 에러 영역 + [다시 번역] (BR-23 `force=true`)

### 버전 Diff Viewer 표현 **(Phase 2)**

| 모드 | 시각 표현 |
|------|----------|
| Split View (기본) | 좌측: `from` (붉은 배경=삭제 라인) / 우측: `to` (녹색 배경=추가 라인) |
| Unified View | 단일 컬럼에 `-` 삭제 라인, `+` 추가 라인 인라인 표시 |
| 색상 | 삭제: `bg-red-50/text-red-900` · 추가: `bg-emerald-50/text-emerald-900` (Notion 톤에 맞게 채도 낮춤) |
| 변경 없는 컨텍스트 | `text-warm-gray-500` 회색 처리 |

### Framer Motion 전환

| 전환 | 설정 |
|------|------|
| 페이지 전환 | `opacity: 0→1, y: 8→0`, `duration: 0.2`, `ease: easeOut` |
| 카드 등장 | `opacity: 0→1`, `duration: 0.15`, `staggerChildren: 0.05` |
| 사이드바 드로어 | `x: -100%→0`, `duration: 0.22`, `ease: cubic-bezier(0.2,0.6,0.25,1)` |
| 번역 모달 등장 **(Phase 2)** | `opacity: 0→1, scale: 0.96→1`, `duration: 0.18`, `ease: easeOut` |
| 버전 미리보기 Drawer **(Phase 2)** | `x: 100%→0`, `duration: 0.22`, 우측에서 슬라이드 인 |
| Diff Viewer 등장 **(Phase 2)** | `opacity: 0→1`, `duration: 0.25` (대용량 본문 렌더 후 페이드인) |
| 본문/번역 탭 전환 **(Phase 2)** | `opacity: 0→1, y: 4→0`, `duration: 0.15` |

---

## 8. 디자인 방향 명세 (Notion 스타일 기준)

| 항목 | 값 |
|------|-----|
| 배경 | Pure White `#ffffff` / Alt `#f6f5f4` (Warm White) |
| 주요 텍스트 | `rgba(0,0,0,0.95)` (Near-Black) |
| 보조 텍스트 | `#615d59` (Warm Gray 500) |
| Muted 텍스트 | `#a39e98` (Warm Gray 300) |
| Primary CTA 색상 | Sage Green `#99d1aa` |
| 보더 | `1px solid rgba(0,0,0,0.1)` (Whisper Border) |
| 카드 Shadow | 4-layer stack, 최대 opacity 0.04 |
| 버튼 Radius | 4px |
| 카드 Radius | 8px (Standard) / 12px (Featured) |
| 폰트 | Inter (variable), 디스플레이 헤드라인 -2.125px letter-spacing |
| scrollbar-gutter | `stable` (모달 오픈 시 레이아웃 흔들림 방지) |

---

## 9. IA 검토 체크리스트

- [x] PRD의 모든 핵심 기능이 페이지 구조에 반영되어 있는가?
  - F1 콘텐츠 자동 작성 → `/generate`, `/generate/[id]`
  - F2 AI 지침 관리 → `/guidelines`, `/guidelines/new`, `/guidelines/[id]`
  - F3 SEO 최적화 → `/generate` 생성 시 자동 적용 (별도 페이지 불필요)
- [x] 인증 전/후 접근 가능 페이지가 구분되어 있는가?
- [x] 각 페이지의 URL 구조가 정의되어 있는가?
- [x] 주요 사용자 플로우(Happy Path)가 그려져 있는가?
- [x] 공통 레이아웃 컴포넌트가 명시되어 있는가? (PublicLayout, AuthLayout, DashboardLayout)
- [x] TRD 컴포넌트 라이브러리 제약(shadcn/ui → Magic UI·Aceternity UI 사용 가능)이 준수되었는가?
- [x] 인증 방식이 [TRD §3-5](TRD.md#3-5-인증-및-권한-관리) 기준(이메일+비밀번호, 소셜 로그인 미지원)으로 플로우에 반영되어 있는가?
- [x] 404·500 시스템 페이지(not-found.tsx, error.tsx)가 사이트맵에 포함되어 있는가?
- [x] 개발자 전용 페이지(/design-system)가 사이트맵에 포함되고 프로덕션 비공개로 명시되어 있는가?
- [x] /history 페이지네이션 방식(무한스크롤, 커서 기반)이 명시되어 있는가?
- [x] **(Phase 2)** 콘텐츠 이력 관리 페이지 구조(`/history/[id]`, `/history/[id]/versions`, `/history/[id]/versions/compare`)가 사이트맵·계층표·접근권한표에 모두 반영되어 있는가?
- [x] **(Phase 2)** 다국어 번역 모달 구조와 스트리밍 인터랙션이 정의되어 있는가? (지원 언어: 한국어·영어 두 가지로 제한)
- [x] **(Phase 2)** 버전 복원 안전장치(복원 직전 본문 자동 스냅샷)가 사용자 플로우와 모달 메시지에 반영되어 있는가?
- [x] **(Phase 2)** Diff Viewer 모드(Split/Unified)와 색상 규칙이 Notion 톤(채도 낮춤)에 맞게 정의되어 있는가?
- [x] **(Phase 2)** 타인 콘텐츠 접근 시 404 분기가 명시되어 있는가? (소유자 검증)
- [x] **(Phase 2)** 번역 데이터 quota 안내 모달의 노출 정책이 정의되어 있는가? (메시지·LocalStorage 키는 [usecase-common.md BR-21](usecase/usecase-common.md#2-공통-비즈니스-규칙-common-business-rules) 단독 정의)
