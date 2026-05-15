---
description: shadcn/ui + Lucide React 가이드라인 (React 생태계 공통)
globs: "src/**/*.ts,src/**/*.tsx"
---

# shadcn/ui + Lucide React 가이드라인 (2026 Edition)

> 기준: 2026년 5월 / shadcn/ui (latest) / React 생태계 공통
> 선택 조건: PRD의 타겟 플랫폼이 web이고, 커스터마이징 가능한 컴포넌트 라이브러리가 필요한 경우
> 의존성: Tailwind CSS v4 필수 (docs/tech/tailwind.md 참조)

---

## 1. 선택 기준

| 상황 | shadcn/ui 선택 | 대안 |
|------|---------------|------|
| 자유로운 커스터마이징이 필요 | ✅ 최적 | Mantine (덜 유연) |
| 랜딩 페이지, 마케팅 사이트 | ✅ Magic UI / Aceternity UI 확장 가능 | - |
| 기업용 데이터 그리드, 복잡한 폼 | ⚠️ Mantine 고려 | - |
| 빠른 MVP, 표준 컴포넌트 세트 | ✅ 적합 | - |

> ✅ **shadcn/ui 선택 시 자동 포함**: Lucide React (아이콘), Magic UI, Aceternity UI (선택적 확장)

---

## 2. 라이브러리 역할 구분

| 라이브러리 | 역할 | 사용 시점 |
|-----------|------|----------|
| **shadcn/ui** | 버튼, 입력창, 모달 등 기능적 핵심 컴포넌트 | 모든 기본 UI |
| **Lucide React** | 일관된 스타일의 커스터마이징 가능한 아이콘 | 아이콘 사용 시 항상 |
| **Magic UI** | 마이크로 인터랙션, 텍스트 애니메이션, Ripple | 동적 피드백이 필요한 포인트 |
| **Aceternity UI** | 배경 효과, 카드 호버 효과 | 시각적 임팩트 포인트 |

> ⚠️ Magic UI / Aceternity UI는 shadcn/ui 기반이므로, **이 둘은 shadcn/ui를 선택한 경우에만 사용 가능**하다.

---

## 3. 설치 및 초기 설정

```bash
# 1. shadcn/ui 초기화 (Tailwind CSS v4 환경)
npx shadcn@latest init

# 2. 컴포넌트 추가 (필요한 것만 선택)
npx shadcn@latest add button input dialog form card
npx shadcn@latest add table select textarea badge

# 3. Lucide React는 shadcn/ui 의존성으로 자동 설치됨
# 별도 설치 불필요
```

---

## 4. 컴포넌트 사용 원칙

### 기존 컴포넌트 우선 재사용
```tsx
// 신규 컴포넌트 생성 전 src/components/ui 확인 필수
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
```

### 모든 UI 컴포넌트는 Client Component
```tsx
// ✅ 인터랙션이 있는 모든 컴포넌트
"use client"
import { Button } from "@/components/ui/button"

export function SubmitButton() {
  return <Button onClick={() => {}}>제출</Button>
}
```

---

## 5. Lucide React 아이콘 사용법

```tsx
// ✅ tree-shakeable — 필요한 아이콘만 import
import { Search, Bell, User, ChevronRight } from "lucide-react"

// 크기와 색상 제어
<Search className="h-4 w-4 text-muted-foreground" />
<Bell className="h-5 w-5 text-primary" />

// 다른 아이콘 라이브러리 금지 — Lucide React 단일화
// ❌ import { FaSearch } from "react-icons/fa"  // 금지
```

---

## 6. Magic UI 사용 가이드

> 설치: `npx magic-ui@latest add [컴포넌트명]`

```tsx
// 텍스트 애니메이션 예시
import { TypingAnimation } from "@/components/magicui/typing-animation"
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text"

// Ripple 효과 예시
import { Ripple } from "@/components/magicui/ripple"

// 사용 시점: CTA 버튼, 히어로 섹션, 피드백 인터랙션
```

---

## 7. Aceternity UI 사용 가이드

> 설치: 컴포넌트별 수동 복사 (https://ui.aceternity.com/components)

```tsx
// 배경 효과 예시
import { BackgroundGradient } from "@/components/aceternity/background-gradient"
import { CardHoverEffect } from "@/components/aceternity/card-hover-effect"

// 사용 시점: 랜딩 히어로, 가격 카드, 포트폴리오 섹션
// ⚠️ 남용 금지 — 포인트 영역에만 제한적으로 사용
```

---

## 8. 컴포넌트 커스터마이징

```tsx
// shadcn/ui 컴포넌트 확장 패턴 (원본 수정 금지)
import { Button, ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface IconButtonProps extends ButtonProps {
  icon: React.ReactNode
}

export function IconButton({ icon, children, className, ...props }: IconButtonProps) {
  return (
    <Button className={cn("gap-2", className)} {...props}>
      {icon}
      {children}
    </Button>
  )
}
```
