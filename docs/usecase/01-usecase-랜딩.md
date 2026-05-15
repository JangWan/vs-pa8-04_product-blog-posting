# Usecase — 랜딩 페이지
> UC-01 | 작성일: 2026-05-15 | 참조: PRD.md · IA.md · TRD.md · usecase-common.md

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| 기능 ID | UC-01 |
| 기능명 | 랜딩 페이지 |
| 한 줄 설명 | 서비스를 처음 접하는 방문자에게 IndiePost AI의 가치를 전달하고 회원가입으로 전환시킨다 |
| 관련 행위자 | `Visitor` (비로그인 방문자), `User` (로그인 사용자) |
| 관련 URL | `/` |
| 레이아웃 | `PublicLayout` (PublicHeader + Footer) |

---

## 2. 사전 조건

- **공통 사전 조건**: usecase-common.md §5 참조
- **추가 사전 조건**: 없음 (인증 불필요, 누구나 접근 가능)

---

## 3. 정상 흐름 — Visitor (비로그인)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | `/` 요청 수신. `PublicLayout` 렌더링 시작. |
| 2 | 시스템 | `<PublicHeader>` 렌더링: 로고(`/` 링크) + 기능(`#features` 앵커) + 로그인(`/sign-in`) + 시작하기(`/sign-up`) 버튼 표시. |
| 3 | 시스템 | Hero 섹션 렌더링: Aceternity UI 배경 효과 + Magic UI `TypingAnimation` + CTA 버튼 "시작하기" 1개 표시. |
| 4 | 시스템 | 이하 섹션 순서대로 렌더링: 문제 제기 → 기능 소개(`id="features"`) → 유사 서비스 비교 → 하단 CTA. |
| 5 | 시스템 | `<Footer>` 렌더링: 저작권(`© 2026 IndiePost AI`) + 개인정보처리방침 링크. |
| 6 | Visitor | Hero CTA "시작하기" 또는 하단 CTA "지금 무료로 시작하기" 클릭. |
| 7 | 시스템 | `/sign-up`으로 이동. |

---

## 4. 대안 흐름

### 4-1. 로그인된 사용자가 `/` 접근

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `User` | `/` 접근. |
| 2 | 시스템 | 랜딩 페이지 정상 렌더링. `<PublicHeader>`의 "시작하기" CTA → `/dashboard` 링크로 변경, "로그인" 버튼 미표시. |
| 3 | `User` | "시작하기" 클릭 → `/dashboard`로 이동. |

### 4-2. Topbar "기능" 앵커 클릭

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | Visitor/User | `<PublicHeader>`의 "기능" 링크 클릭. |
| 2 | 시스템 | 랜딩 페이지 내 `#features` 섹션(기능 소개)으로 부드럽게 스크롤(`scroll-behavior: smooth`). |

### 4-3. 로고 클릭

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | Visitor | 로고 클릭 → `/` 유지 (이미 홈). |
| 1 | `User` | 로고 클릭 → `/dashboard`로 이동. |

---

## 5. 예외 흐름

- **공통 예외** (네트워크 오류·서버 오류): usecase-common.md §3 참조
- **추가 예외**: 없음 (정적 페이지, API 호출 없음)

---

## 6. 사후 조건

- DB 변경 없음 (읽기 전용 정적 페이지)
- SEO: `/` 경로에 메타 태그(`title`, `description`, `og:*`) 서버 렌더링 필요 (Next.js `generateMetadata`)

---

## 7. UI/UX 고려사항

- **공통 UI 패턴**: usecase-common.md §4 참조
- `<PublicHeader>`: Glass & Floating 스타일 (`backdrop-blur: 12px`, 하단 whisper border). 스크롤 시 상단 고정.
- **Hero 섹션**: Magic UI `TypingAnimation`으로 핵심 가치 문장 타이핑 효과. CTA 버튼은 Sage Green(`#99d1aa`) Primary 스타일.
- **문제 제기 섹션**: 3-column 카드, Whisper Border (`1px solid rgba(0,0,0,0.1)`).
- **기능 소개 섹션** (`id="features"`): 홀수 섹션 Pure White `#ffffff` ↔ 짝수 섹션 Warm White `#f6f5f4` 교대.
- **하단 CTA 섹션**: Magic UI `Ripple` 배경 효과 + "지금 무료로 시작하기" 버튼.
- **Footer**: 랜딩 페이지에만 표시. 인증 영역(`/dashboard/**`)에는 미표시.
- **Framer Motion 페이지 전환**: `opacity: 0→1, y: 8→0`, `duration: 0.2`, `ease: easeOut`.
- **SEO**: Next.js `generateMetadata`로 서버 사이드 메타 태그 생성.

---

## 8. 데이터 요구사항

| 항목 | 내용 |
|------|------|
| 입력 데이터 | 없음 (정적 페이지) |
| 출력 데이터 | 정적 HTML (서버 렌더링) |
| API 호출 | 없음 |

---

## 9. 보안 및 권한

| 항목 | 내용 |
|------|------|
| 접근 권한 | 공개 (`Visitor`, `User` 모두 접근 가능) |
| 추가 보안 | 없음 |
