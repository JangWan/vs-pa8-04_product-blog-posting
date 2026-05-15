---
description: Tailwind CSS v4 가이드라인 (React 생태계 공통)
globs: "src/**/*.ts,src/**/*.tsx"
---

# Tailwind CSS v4 가이드라인 (2026 Edition)

> 기준: 2026년 5월 / Tailwind CSS v4 / React 생태계 공통 (Next.js, React Native Web 등)
> 선택 조건: 유틸리티 퍼스트 CSS가 필요한 모든 웹 프로젝트

---

## 1. 선택 기준

| 상황 | Tailwind CSS 선택 | 대안 |
|------|------------------|------|
| 빠른 MVP, 커스텀 디자인 | ✅ 최적 | - |
| shadcn/ui 사용 시 | ✅ 필수 (shadcn/ui 의존성) | - |
| 복잡한 CSS 애니메이션 | ⚠️ Framer Motion 병행 권장 | - |
| React Native (모바일) | ❌ 미지원 | NativeWind (RN 전용) |

---

## 2. v4 핵심 변경사항

```css
/* v3: tailwind.config.ts 설정 방식 */
/* v4: CSS 파일 내 @theme 블록으로 대체 */

/* globals.css */
@import "tailwindcss";

@theme {
  --color-primary: #3b82f6;
  --color-secondary: #8b5cf6;
  --font-sans: "Pretendard", sans-serif;
  --radius-lg: 0.75rem;
}
```

> ⚠️ v4부터 `tailwind.config.ts` 대신 CSS `@theme` 블록에서 커스텀 토큰을 정의한다.

---

## 3. 핵심 준수 사항

### No Hardcoding 원칙
```tsx
// ❌ 하드코딩 — 일관성 깨짐
<div className="px-5 h-12 bg-blue-500" />

// ✅ 시맨틱 토큰 사용
<div className="px-md h-input bg-primary" />
```

### Responsive Design
```tsx
// ✅ w-full + mx-auto 조합 (vw 단위 금지)
<main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
  {children}
</main>
```

### Conditional Styling — cn() 유틸리티
```tsx
import { cn } from "@/lib/utils"

// ✅ cn으로 조건부 클래스 결합
<button className={cn(
  "px-4 py-2 rounded-lg font-medium transition-colors",
  isActive && "bg-primary text-white",
  isDisabled && "opacity-50 cursor-not-allowed"
)} />
```

### Layout Stability
```css
/* globals.css — 모달 오픈 시 레이아웃 흔들림 방지 */
html {
  scrollbar-gutter: stable;
}

body[data-scroll-locked] {
  padding-right: 0px !important;
}
```

---

## 4. 표준 컨테이너 구조

```tsx
// 모든 페이지는 이 구조를 따른다
// 페이지 루트 → Navigation → main 컨테이너 → 고정 너비 박스
export default function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navigation />
      <main className="min-h-screen w-full">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </>
  )
}
```

---

## 5. Structured Variants (tailwind-variants)

```tsx
import { tv } from "tailwind-variants"

const button = tv({
  base: "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none",
  variants: {
    color: {
      primary: "bg-primary text-white hover:bg-primary/90",
      secondary: "bg-secondary text-white hover:bg-secondary/90",
      ghost: "hover:bg-accent hover:text-accent-foreground",
    },
    size: {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-base",
      lg: "h-12 px-6 text-lg",
    },
  },
  defaultVariants: {
    color: "primary",
    size: "md",
  },
})
```

---

## 6. 접근성 및 성능

- **접근성**: `focus-visible:` prefix로 키보드 포커스 스타일 반드시 적용
- **다크모드**: `dark:` variant 사용, CSS 변수 기반 색상 토큰 권장
- **성능**: 불필요한 클래스 중복 방지, `@apply` 최소화 (성능 저하 원인)
