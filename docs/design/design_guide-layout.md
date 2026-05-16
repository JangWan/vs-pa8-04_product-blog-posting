---
description: 레이아웃 안정성 가이드 — 스크롤바 점프, Radix UI 패딩 주입, 고정 요소 흔들림 방지 (IA 단계 참조)
---

# 레이아웃 안정성 가이드 (2026 Edition)

> Next.js / Radix UI(shadcn) 기반 프로젝트에서 발생하는 레이아웃 흔들림(Layout Shift)을 방지하기 위한 표준 구현 가이드
> 공통 디자인 원칙: `docs/design/design_guide-common.md` 참조
> 웹 레이아웃 시스템: `docs/design/design_guide-web.md` 참조

---

## 1. 주요 원인 분석

### ① 스크롤바 유무에 따른 너비 변화 (Scrollbar Jump)

- **현상**: 콘텐츠 길이에 따라 스크롤바가 생기거나 사라질 때 중앙 정렬된 콘텐츠가 좌우로 덜컥거림.
- **원인**: 브라우저 기본 동작이 스크롤바 영역을 뷰포트 너비에서 유동적으로 계산하기 때문.
- **영향 범위**: 페이지 전환, 콘텐츠 동적 추가 시.

### ② Radix UI(shadcn)의 자동 패딩 주입

- **현상**: 드롭다운, 모달, 셀렉트 등을 열 때 `body`에 `padding-right`가 강제 주입되어 `main` 콘텐츠가 좌측으로 이동.
- **원인**: Radix UI가 스크롤 잠금(scroll lock) 시 사라지는 스크롤바 공간을 보상하려고 인라인 스타일을 주입함.
- **영향 범위**: `position: fixed` 헤더는 영향을 받지 않으므로 헤더와 본문 간 시각적 불일치 발생.

### ③ vw 단위 오차

- **현상**: `100vw` 사용 시 스크롤바 너비를 포함하여 계산되어 가로 스크롤이 발생하거나 레이아웃이 밀림.
- **원인**: `100vw = window.innerWidth` (스크롤바 포함) ≠ `document.documentElement.clientWidth` (스크롤바 제외).

---

## 2. 표준 구현 (globals.css)

프로젝트 초기 설정 시 아래 코드를 `globals.css`의 `@layer base`에 반드시 포함한다.

```css
@layer base {
  html {
    /* [원칙 1] 스크롤바 영역 상시 확보 — 페이지/모달 전환 시 덜컥거림 방지 */
    overflow-y: scroll;
    scrollbar-gutter: stable;
    scroll-behavior: smooth;
  }

  body {
    @apply bg-background text-foreground antialiased;
    /* [원칙 2] Radix UI가 모달/드롭다운 열릴 때 강제 주입하는 padding-right 무력화 */
    padding-right: 0px !important;
  }

  /* [원칙 3] 스크롤 잠금 상태에서도 padding 주입 차단 */
  body[data-scroll-locked] {
    overflow: hidden !important;
    padding-right: 0px !important;
  }
}
```

### 원칙별 설명

| 원칙 | 속성 | 이유 |
|------|------|------|
| **원칙 1** | `overflow-y: scroll` | 스크롤바를 항상 표시하여 너비를 일정하게 유지 |
| **원칙 1** | `scrollbar-gutter: stable` | 스크롤바 트랙 공간을 항상 예약 (이중 보호) |
| **원칙 2** | `body { padding-right: 0 !important }` | Radix UI의 인라인 패딩 주입을 CSS `!important`로 차단 |
| **원칙 3** | `body[data-scroll-locked]` | 스크롤 잠금 상태에서도 패딩 차단 보장 |

---

## 3. 컴포넌트 구현 원칙

### ① 드롭다운: 스크롤 잠금 비활성화 (`modal={false}`)

화면 전체를 가리지 않는 소형 UI 요소(드롭다운, 선택기 등)는 스크롤 잠금 자체를 트리거하지 않도록 설정한다.

```tsx
// ✅ 드롭다운 — 스크롤 잠금 비활성화
<DropdownMenu modal={false}>
  ...
</DropdownMenu>
```

> `modal={false}`는 Radix UI DropdownMenu에만 적용한다. `Dialog`, `Sheet` 등 실제 모달은 기본값(`modal={true}`)을 유지한다.

### ② 단위 사용 원칙

| 상황 | 권장 | 금지 |
|------|------|------|
| 컨테이너 너비 | `w-full` + `max-w-6xl mx-auto` | `100vw` 직접 사용 |
| 고정 헤더 너비 | `left-0 right-0` (fixed) | `width: 100vw` |
| 반응형 폰트 | `clamp()` 또는 Tailwind `text-{size}` | `{n}vw` 단독 사용 |

### ③ 고정 요소 (Fixed/Sticky) 구현 기준

`position: fixed` 요소는 반드시 `left-0 right-0` 조합을 사용한다. `width: 100vw`는 스크롤바 포함 너비로 계산되어 가로 오버플로우를 유발한다.

```tsx
// ✅ 올바른 고정 헤더
<header className="fixed top-0 left-0 right-0 z-50">
  <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    ...
  </div>
</header>

// ❌ 잘못된 고정 헤더 (가로 오버플로우 발생 가능)
<header className="fixed top-0 z-50 w-screen">
  ...
</header>
```

---

## 4. 레이아웃 안정성 체크리스트

프로젝트 개발 중 아래 항목을 반드시 검증한다.

- [ ] **모달/드롭다운 오픈 시**: `body` 태그의 `style` 속성에 `padding-right`가 주입되어 레이아웃이 밀리지 않는가?
- [ ] **페이지 전환 시**: 콘텐츠가 짧은 페이지에서 긴 페이지로 이동할 때 덜컥거림이 없는가? (`html { overflow-y: scroll }` 적용 확인)
- [ ] **고정 요소(Fixed/Sticky)**: 스크롤바가 사라질 때 우측으로 밀리지 않는가?
- [ ] **단위 일관성**: `100vw` 대신 `w-full` + `left-0 right-0` 조합을 사용하는가?
- [ ] **드롭다운**: 소형 드롭다운에 `modal={false}` 속성이 적용되어 있는가?
