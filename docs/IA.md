# IA — IndiePost AI
> 정보 구조도 (Information Architecture)  
> 작성일: 2026-05-15 | 버전: v1.0  
> 참조: PRD.md · TRD.md

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
│   │   └── /generate/[id]       생성 결과 에디터
│   ├── /guidelines              AI 지침 목록
│   │   ├── /guidelines/new      지침 생성
│   │   └── /guidelines/[id]     지침 수정
│   └── /history                 생성 이력 (Phase 2, 무한스크롤)
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

### 주요 분기점

| 분기 조건 | 이동 경로 |
|----------|---------|
| 비로그인 상태로 `/generate` 직접 접근 | → `/sign-in?redirect=/generate` |
| 로그인 상태로 `/sign-in` 접근 | → `/dashboard` |
| 대시보드 최초 진입 (지침 0개) | → Empty State + "지침 등록하기" CTA 강조 |
| AI 생성 중 Rate Limit 초과 (429) | → 토스트: "잠시 후 다시 시도해주세요" + 재시도 버튼 |

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
│  [생성 이력]          │  /history        (Phase 2)
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
| 생성 이력 | `/history` | Sidebar | 로그인 필수 | 이력 조회·무한스크롤 (Phase 2) |
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

---

## 7. 인터랙션 패턴

### 모달

| 사용 시점 | 내용 | 정의 위치 |
|---------|------|---------|
| 지침 삭제 확인 | "이 지침을 삭제하면 해당 지침으로 생성된 이력에 영향을 줄 수 있습니다." + 삭제 / 취소 버튼 | usecase-지침관리 참조 |

### 토스트 (우하단, 5초 자동 닫힘)

> 토스트 메시지 전체 정의 → **usecase-common.md §4-3·§4 참조** (SSOT 원칙 — IA에서 중복 정의 금지)

### 스켈레톤 로딩

| 페이지 | 적용 대상 |
|--------|---------|
| 대시보드 | 최근 생성 카드 목록 |
| 지침 목록 | 지침 카드 목록 |
| 생성 이력 | 이력 카드 목록 |

### AI 생성 스트리밍

- 생성 버튼 클릭 → 로딩 스피너 + "AI가 초안을 작성하고 있습니다..." 텍스트
- 스트리밍 시작 → 텍스트 실시간 append (청크 단위)
- 생성 완료 → 에디터 모드 전환 + "초안 생성 완료" 토스트

### Framer Motion 전환

| 전환 | 설정 |
|------|------|
| 페이지 전환 | `opacity: 0→1, y: 8→0`, `duration: 0.2`, `ease: easeOut` |
| 카드 등장 | `opacity: 0→1`, `duration: 0.15`, `staggerChildren: 0.05` |
| 사이드바 드로어 | `x: -100%→0`, `duration: 0.22`, `ease: cubic-bezier(0.2,0.6,0.25,1)` |

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
- [x] 인증 방식이 TRD §3-5 기준(이메일+비밀번호, 소셜 로그인 미지원)으로 플로우에 반영되어 있는가?
- [x] 404·500 시스템 페이지(not-found.tsx, error.tsx)가 사이트맵에 포함되어 있는가?
- [x] 개발자 전용 페이지(/design-system)가 사이트맵에 포함되고 프로덕션 비공개로 명시되어 있는가?
- [x] /history 페이지네이션 방식(무한스크롤, 커서 기반)이 명시되어 있는가?
