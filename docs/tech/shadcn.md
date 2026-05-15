---
description: shadcn/ui + Lucide React 가이드라인 (Next.js / React 생태계 공통)
globs: "src/**/*.ts,src/**/*.tsx"
---

# shadcn/ui + Lucide React 가이드라인 (2026 Edition)

> 기준: 2026년 5월 / shadcn/ui CLI v4 / Next.js App Router / Tailwind CSS v4
> 선택 조건: PRD의 타겟 플랫폼이 web이고, 커스터마이징 가능한 컴포넌트 라이브러리가 필요한 경우
> 의존성: Tailwind CSS v4 필수

---

## 1. 라이브러리 버전 (2026-05 기준)

| 패키지 | 버전 | 역할 |
|-------|------|------|
| `shadcn` (CLI) | latest (v4+) | 컴포넌트 설치 CLI |
| `@radix-ui/*` | ^1.x ~ ^2.x | 기반 Headless 컴포넌트 |
| `lucide-react` | ^0.475.0 | 아이콘 라이브러리 |
| `class-variance-authority` | ^0.7.x | 변형(variant) 관리 |
| `clsx` | ^2.x | 조건부 className 합성 |
| `tailwind-merge` | ^2.x | Tailwind 클래스 충돌 해결 |

---

## 2. 선택 기준

| 상황 | shadcn/ui 선택 | 대안 |
|------|---------------|------|
| 자유로운 커스터마이징이 필요 | ✅ 최적 | Mantine (덜 유연) |
| 랜딩 페이지, 마케팅 사이트 | ✅ Magic UI / Aceternity UI 확장 가능 | - |
| 기업용 데이터 그리드, 복잡한 폼 | ⚠️ Mantine 고려 | - |
| 빠른 MVP, 표준 컴포넌트 세트 | ✅ 적합 | - |

> ✅ **shadcn/ui 선택 시 자동 포함**: Lucide React (아이콘), Magic UI·Aceternity UI (선택적 확장 가능)

---

## 3. 라이브러리 역할 구분

| 라이브러리 | 역할 | 사용 시점 |
|-----------|------|----------|
| **shadcn/ui** | 버튼, 입력창, 모달 등 기능적 핵심 컴포넌트 | 모든 기본 UI |
| **Lucide React** | 일관된 스타일의 커스터마이징 가능한 아이콘 | 아이콘 사용 시 항상 |
| **Magic UI** | 마이크로 인터랙션, 텍스트 애니메이션, Ripple | 동적 피드백이 필요한 포인트 |
| **Aceternity UI** | 배경 효과, 카드 호버 효과 | 시각적 임팩트 포인트 |

> ⚠️ Magic UI / Aceternity UI는 shadcn/ui 기반이므로, **이 둘은 shadcn/ui를 선택한 경우에만 사용 가능**하다.

---

## 4. Next.js 설치 및 초기 설정

### 4-1. CLI 초기화 (Next.js 전용 템플릿)

```bash
# Next.js 프로젝트 신규 생성 + shadcn/ui 동시 초기화
pnpm dlx shadcn@latest init -t next
```

#### 설치 중 선택 가이드

```
√ Select a component library » Radix      ← 기본값, 변경 불필요
√ Which preset would you like to use? » Nova
```

| 선택 항목 | 권장 값 | 이유 |
|---------|--------|------|
| **Component library** | `Radix` | shadcn/ui 공식 기반. 접근성·안정성 검증됨 |
| **Preset** | `Nova` | 현대적 둥근 모서리·고채도 팔레트. 빠른 MVP에 최적 |

#### 프리셋 비교표

| 프리셋 | 모서리 | 색상 | 특징 |
|-------|-------|------|------|
| `Default` | 소폭 라운딩 | 표준 | shadcn 전통 스타일 |
| `Nova` | 중간 라운딩 | 고채도·선명 | 현대적 SaaS 스타일 ✅ 권장 |
| `Sera` | 직각 | 차분 | 타이포그래피 중심, 인쇄 디자인 영향 |

> 비주얼 빌더로 프리셋을 커스터마이징하려면:
> ```bash
> pnpm dlx shadcn@latest init --preset [CODE] --template next
> ```

### 4-2. 기존 프로젝트에 추가

```bash
# tsconfig.json에 paths 별칭이 설정된 상태에서 실행
pnpm dlx shadcn@latest init
```

`tsconfig.json` 확인 사항:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 4-3. 컴포넌트 추가

```bash
# 단일 컴포넌트
pnpm dlx shadcn@latest add button

# 복수 컴포넌트 (필요한 것만 선택)
pnpm dlx shadcn@latest add button input dialog form card
pnpm dlx shadcn@latest add table select textarea badge
```

---

## 5. 컴포넌트 사용 원칙

### 기존 컴포넌트 우선 재사용
```tsx
// 신규 컴포넌트 생성 전 src/components/ui 확인 필수
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
```

### 모든 UI 컴포넌트는 Client Component
```tsx
"use client"
import { Button } from "@/components/ui/button"

export function SubmitButton() {
  return <Button onClick={() => {}}>제출</Button>
}
```

---

## 6. Lucide React 아이콘 사용법

```tsx
// ✅ tree-shakeable — 필요한 아이콘만 import
import { Search, Bell, User, ChevronRight } from "lucide-react"

// 크기와 색상 제어
<Search className="h-4 w-4 text-muted-foreground" />
<Bell className="h-5 w-5 text-primary" />

// 다른 아이콘 라이브러리 금지 — Lucide React 단일화
// ❌ import { FaSearch } from "react-icons/fa"
```

---

## 7. Magic UI 사용 가이드

```bash
# Magic UI 컴포넌트 추가
pnpm dlx shadcn@latest add "https://magicui.design/r/typing-animation"
```

```tsx
import { TypingAnimation } from "@/components/magicui/typing-animation"
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text"
import { Ripple } from "@/components/magicui/ripple"

// 사용 시점: CTA 버튼, 히어로 섹션, 피드백 인터랙션
```

---

## 8. Aceternity UI 사용 가이드

> 설치: 컴포넌트별 수동 복사 (https://ui.aceternity.com/components)

```tsx
import { BackgroundGradient } from "@/components/aceternity/background-gradient"
import { CardHoverEffect } from "@/components/aceternity/card-hover-effect"

// 사용 시점: 랜딩 히어로, 가격 카드, 포트폴리오 섹션
// ⚠️ 남용 금지 — 포인트 영역에만 제한적으로 사용
```

---

## 9. 컴포넌트 커스터마이징

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
