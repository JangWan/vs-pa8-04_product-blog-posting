---
description: 웹 디자인 가이드 — 컴포넌트 라이브러리, 레이아웃, 반응형 (IA 단계 참조)
---

# 웹 디자인 가이드 (2026 Edition)

> IA 작성 단계에서 참조하는 웹 전용 디자인 선택 가이드
> 공통 디자인 원칙: `docs/design/design_guide-common.md` 참조
> 컴포넌트 라이브러리 선택은 **TRD에서 결정된 값**을 기준으로 한다 (재정의 금지)

---

## 1. 컴포넌트 라이브러리 선택 (TRD에서 결정)

> ⚠️ **이 섹션은 TRD에서 이미 결정된 값을 확인하는 용도**이다. IA 단계에서 새로 선택하지 않는다.

### shadcn/ui 선택 시 사용 가능한 라이브러리

TRD에서 shadcn/ui를 선택한 경우, IA 단계에서 아래 확장 라이브러리를 추가로 선택할 수 있다.

| 라이브러리 | 역할 | 선택 기준 |
|-----------|------|----------|
| **Magic UI** | 마이크로 인터랙션, 텍스트 애니메이션 | 동적 피드백이 중요한 경우 |
| **Aceternity UI** | 배경 효과, 카드 호버 | 시각적 임팩트가 필요한 랜딩 페이지 |

> ⚠️ **Magic UI / Aceternity UI는 TRD에서 shadcn/ui를 선택한 경우에만 사용 가능하다.**
> TRD에서 Mantine을 선택한 경우 이 두 라이브러리는 사용할 수 없다.

### Mantine 선택 시

TRD에서 Mantine을 선택한 경우, 추가 UI 라이브러리 없이 Mantine 내장 컴포넌트만 사용한다.

---

## 2. 레이아웃 시스템

### 표준 페이지 구조

```
┌─────────────────────────────────────────┐
│  Navigation (topbar / sidebar)          │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  max-w-6xl (1152px) 콘텐츠 영역 │   │
│  │                                 │   │
│  │  페이지별 콘텐츠                 │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

- 최대 너비: `max-w-6xl` (1152px) — 대부분의 콘텐츠 페이지
- 넓은 콘텐츠: `max-w-7xl` (1280px) — 대시보드, 데이터 테이블
- 좁은 콘텐츠: `max-w-2xl` (672px) — 폼, 설정 페이지, 인증 페이지
- 기본 수평 패딩: `px-4 sm:px-6 lg:px-8`

### 네비게이션 타입별 레이아웃

#### Topbar (상단 네비게이션)
```
┌─────────────────────────────────────────┐
│  [Logo] [Nav Links]           [User]    │  ← h-16 고정
├─────────────────────────────────────────┤
│  콘텐츠 영역 (full width)               │
└─────────────────────────────────────────┘
```
- 적합한 경우: 랜딩 페이지, 마케팅 사이트, 콘텐츠 중심 서비스

#### Sidebar (사이드바 네비게이션)
```
┌────────┬────────────────────────────────┐
│        │  Header                        │
│ Side   ├────────────────────────────────┤
│ bar    │                                │
│ w-64   │  콘텐츠 영역                   │
│        │                                │
└────────┴────────────────────────────────┘
```
- 적합한 경우: 관리자 대시보드, SaaS 앱, 설정이 많은 서비스

---

## 3. 반응형 브레이크포인트

| 브레이크포인트 | 화면 너비 | 주요 변화 |
|--------------|----------|----------|
| `sm` | 640px+ | 모바일 → 태블릿 전환 |
| `md` | 768px+ | 사이드바 등장, 컬럼 분기 |
| `lg` | 1024px+ | 데스크톱 레이아웃 완성 |
| `xl` | 1280px+ | 넓은 화면 최적화 |

### 모바일 퍼스트 원칙
```tsx
// ✅ 모바일 기본 → 큰 화면 확장
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>

// 사이드바 — 모바일에서 드로어로 전환
<aside className="hidden md:block w-64 shrink-0">
  <Sidebar />
</aside>
<Sheet> {/* 모바일 드로어 */}
  <Sidebar />
</Sheet>
```

---

## 4. 공통 UI 패턴

### 로딩 상태
```tsx
// 스켈레톤 — 콘텐츠 로딩 시 레이아웃 형태 유지
import { Skeleton } from "@/components/ui/skeleton"

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
```

### 에러 메시지 표시 기준

| 유형 | 표시 방식 | 사용 시점 |
|------|----------|----------|
| 폼 필드 오류 | 인라인 (필드 하단) | 유효성 검사 실패 |
| 짧은 성공/실패 알림 | 토스트 (우하단) | 저장, 삭제 등 단순 작업 |
| 중요 경고 / 확인 필요 | 모달 | 삭제 확인, 결제 확인 |
| 페이지 수준 오류 | 페이지 내 인라인 | API 요청 실패, 권한 없음 |

### 빈 상태 (Empty State)
```tsx
// 데이터가 없을 때 항상 Empty State 제공
function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 text-muted-foreground mb-4">{/* 아이콘 */}</div>
      <p className="text-muted-foreground mb-4">{message}</p>
      {action}
    </div>
  )
}
```

---

## 5. 폼 디자인 패턴

```tsx
// 표준 폼 레이아웃
<form className="space-y-4 max-w-md">
  <div className="space-y-2">
    <Label htmlFor="email">이메일</Label>
    <Input id="email" type="email" placeholder="name@example.com" />
    {errors.email && (
      <p className="text-sm text-destructive">{errors.email}</p>
    )}
  </div>
  
  <Button type="submit" className="w-full" disabled={isLoading}>
    {isLoading ? "처리 중..." : "제출"}
  </Button>
</form>
```

---

## 6. 색상 토큰 적용 (shadcn/ui 기준)

shadcn/ui는 CSS 변수 기반 시맨틱 색상 토큰을 사용한다.

| 토큰 | 사용처 |
|------|--------|
| `bg-background` | 페이지 배경 |
| `bg-card` | 카드, 패널 |
| `text-foreground` | 주요 텍스트 |
| `text-muted-foreground` | 보조 텍스트 |
| `border` | 구분선 |
| `bg-primary` / `text-primary-foreground` | CTA 버튼 |
| `bg-destructive` | 삭제, 위험 액션 |

> Tailwind 원색 클래스(`bg-blue-500`) 직접 사용 금지 — 시맨틱 토큰 사용

---

## 7. SEO 및 성능 고려사항

### SEO가 필요한 페이지 체크리스트
- `<title>` 및 `<meta name="description">` 필수
- OpenGraph 태그 (`og:title`, `og:description`, `og:image`)
- 시맨틱 HTML (h1은 페이지당 1개, 논리적 heading 순서)
- 이미지 `alt` 속성 및 `next/image` 사용

### Core Web Vitals
- **LCP** (최대 콘텐츠 렌더링): Hero 이미지 `priority` 속성 적용
- **CLS** (레이아웃 이동): 이미지 `width`/`height` 명시, `scrollbar-gutter: stable`
- **INP** (반응성): 무거운 계산은 Web Worker 또는 서버로 이전
