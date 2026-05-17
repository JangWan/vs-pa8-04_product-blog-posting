# 페이지 구현 표준 가이드

> Next.js App Router + shadcn/ui 기반 대시보드 페이지 작성 규칙  
> 이 문서를 기준으로 작성하면 구조 불일치·레이아웃 흔들림·스크롤 이상이 발생하지 않습니다.  
> **신규 프로젝트에도 그대로 적용 가능한 범용 가이드입니다.**

---

## 0. PageShell — 표준 구조의 코드 구현체

> 1장의 표준 페이지 구조 규칙을 컴포넌트로 구현한 것이 `PageShell`입니다.  
> **신규 페이지는 PageShell을 사용합니다. 직접 템플릿을 복사하지 않습니다.**

### 0-1. PageShell이란?

1장에서 정의한 표준 구조(motion.div 루트 + 헤더 행 + 컨텐츠 영역)를 컴포넌트로 캡슐화한 것입니다.

```
1장 규칙   →  "왜, 무엇을" (원칙·이유)
PageShell  →  "어떻게"    (코드 구현체 — 규칙을 강제)
```

PageShell을 사용하면 구조 불일치가 **코드 수준에서 불가능**해집니다.

### 0-2. Props API

| Prop | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | `string` | ✅ | 페이지 제목 (`h1`) |
| `description` | `string` | ✅ | 페이지 설명 (부제) |
| `actions` | `React.ReactNode` | ❌ | 헤더 우측 액션 버튼 영역 |
| `children` | `React.ReactNode` | ✅ | 컨텐츠 영역 |

### 0-3. 사용 예시

**액션 버튼 없는 페이지**

```tsx
export default function HistoryPage() {
  return (
    <PageShell title="생성 이력" description="AI가 작성한 블로그 초안 목록입니다.">
      {/* 컨텐츠 */}
    </PageShell>
  );
}
```

**액션 버튼 있는 페이지**

```tsx
export default function GuidelinesPage() {
  return (
    <PageShell
      title="AI 지침 관리"
      description="브랜드 톤·문체 지침을 등록하면 AI가 일관된 스타일로 글을 씁니다."
      actions={
        <Link href="/guidelines/new" className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors shrink-0">
          <Plus className="h-4 w-4" />
          새 지침
        </Link>
      }
    >
      {/* 컨텐츠 */}
    </PageShell>
  );
}
```

### 0-4. 직접 템플릿 vs PageShell

| | 직접 템플릿 (1장 참고) | PageShell 사용 |
|---|---|---|
| 구조 일관성 | Claude가 문서를 정확히 따라야 보장됨 | 컴포넌트가 구조를 강제 — 실수 불가 |
| motion.div 누락 가능성 | 있음 | 없음 (내부에서 항상 적용) |
| 헤더 구조 실수 가능성 | 있음 | 없음 |
| 규칙 변경 시 | 모든 페이지 개별 수정 필요 | PageShell 하나만 수정하면 전체 반영 |
| 사용 권장 | 특수한 레이아웃이 필요한 예외 페이지 | **일반 페이지 전부** |

> **원칙**: 표준 레이아웃은 반드시 PageShell을 사용합니다.  
> 직접 템플릿 복사는 PageShell로 표현할 수 없는 예외적인 레이아웃에서만 허용합니다.

### 0-5. 컴포넌트 위치

```
src/components/layout/page-shell.tsx
```

---

## 1. 표준 페이지 구조 (Anatomy)

### 1-1. 전체 템플릿

```tsx
"use client";

import { motion } from "framer-motion";
// 필요한 import 추가

export default function SomePage() {
  // 데이터 페칭, 상태 선언

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* ① 페이지 헤더 — 항상 이 구조 사용 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            페이지 제목
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            페이지 설명
          </p>
        </div>
        {/* 액션 버튼 (있을 때만 렌더링, 없으면 생략) */}
      </div>

      {/* ② 컨텐츠 영역 — 로딩/에러/Empty/데이터 중 하나 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorNotice message="데이터를 불러오지 못했습니다. 새로고침 해주세요." />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <DataList items={items} />
      )}
    </motion.div>
  );
}
```

### 1-2. 구조 규칙 요약

| 영역 | 클래스 | 규칙 |
|------|--------|------|
| 루트 래퍼 | `motion.div space-y-6` | **필수** — 모든 페이지 동일 |
| 헤더 행 | `flex items-start justify-between gap-4` | **필수** — 액션 버튼 유무와 무관하게 유지 |
| 페이지 제목 | `text-2xl font-semibold text-foreground tracking-tight` | **필수** — 크기·색상 고정 |
| 섹션 간 간격 | `space-y-6` (루트) / `space-y-4~5` (섹션 내부) | 루트는 고정, 내부는 조정 가능 |
| 너비 | 기본 full-width | 페이지 루트에 `max-w-*` 금지 |

### 1-3. 너비 사용 원칙

```
✅ 컨텐츠 영역: full-width (max-w 없음)
✅ 입력 폼: 폼 내부 컨테이너에만 max-w-2xl 또는 max-w-3xl 허용 (mx-auto 없이 좌측 정렬)
❌ 페이지 루트에 max-w-* + mx-auto 금지 — 사이드바 제외 전체 영역 활용
```

---

## 2. 상태 관리 패턴

### 2-1. ❌ 금지 — useEffect + setState (파생값 계산)

```tsx
// ❌ 데이터 로드 후 setState → 페이지 애니메이션 도중 리렌더 → 레이아웃 흔들림
const [selectedId, setSelectedId] = useState<string | null>(null);

useEffect(() => {
  if (!data) return;
  const def = data.find((d) => d.is_default);
  if (def) setSelectedId(def.id); // ← 애니메이션 중 리렌더 발생
}, [data]);
```

**문제**: TanStack Query 데이터가 도착하는 시점(~100-300ms)이 페이지 진입 애니메이션(200ms)과 겹쳐 화면이 흔들린다.

### 2-2. ✅ 권장 — 렌더 중 직접 계산 (파생값)

```tsx
// ✅ 사용자의 명시적 선택만 state로 관리
// undefined = 아직 선택 안 함(기본값 자동 적용), null = "없음" 선택, string = 특정 항목 선택
const [userSelectedId, setUserSelectedId] = useState<string | null | undefined>(undefined);

// 렌더 시점에 직접 계산 → 추가 리렌더 없음, 애니메이션 안정
const selectedId =
  userSelectedId !== undefined
    ? userSelectedId
    : (data?.find((d) => d.is_default)?.id ?? null);
```

### 2-3. useEffect 허용 범위

| 허용 ✅ | 금지 ❌ |
|---------|---------|
| DOM 직접 조작 (`scrollTop` 등) | 다른 state/props/query 결과 기반 setState |
| 이벤트 리스너 구독·해제 | API 응답 데이터 변환 후 setState |
| 타이머·인터벌 관리 | props에서 파생되는 값 계산 |
| 토스트·analytics 등 side-effect | `useEffect`로 초기값 설정 |

> **판단 기준**: "이 값이 다른 값에서 계산될 수 있는가?" → `useState` 말고 렌더 중 직접 계산하라.

---

## 3. 로딩 / 에러 / Empty State 패턴

### 3-1. 표준 3-state 처리 순서

```
isLoading → isError → isEmpty → 데이터
```

이 순서를 모든 컨텐츠 영역에서 동일하게 사용한다.

### 3-2. Skeleton (로딩)

```tsx
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-4 space-y-2.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
```

> Skeleton의 높이와 구조는 실제 카드와 최대한 유사하게 작성 → 레이아웃 점프 방지.

### 3-3. Error Notice (에러)

```tsx
function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
```

### 3-4. Empty State (데이터 없음)

```tsx
function EmptyState() {
  return (
    <div className="border border-border rounded-lg p-12 flex flex-col items-center text-center space-y-4">
      <SomeIcon className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">
          첫 항목을 추가해보세요
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          설명 문구
        </p>
      </div>
      <Link
        href="/new"
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        추가하기
      </Link>
    </div>
  );
}
```

### 3-5. Framer Motion 목록 등장 (stagger)

목록 아이템이 여러 개일 때 stagger 애니메이션을 사용한다.

```tsx
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" as const } },
};

// 사용
<motion.ul variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">
  {items.map((item) => (
    <motion.li key={item.id} variants={itemVariants}>
      <Card item={item} />
    </motion.li>
  ))}
</motion.ul>
```

---

## 4. 레이아웃 안정성 규칙

> 상세 원리: `docs/design/design_guide-layout.md` 참조

### 4-1. globals.css — 프로젝트 초기 1회 설정 (필수)

```css
@layer base {
  html {
    /* 스크롤바 공간 상시 확보 → 페이지 전환 시 좌우 덜컥거림 방지 */
    overflow-y: scroll;
    scrollbar-gutter: stable;
    scroll-behavior: smooth;
  }

  body {
    @apply bg-background text-foreground antialiased;
    /* Radix UI 모달·드롭다운이 주입하는 padding-right 차단 */
    padding-right: 0px !important;
  }

  /* 스크롤 잠금 상태에서도 padding 주입 차단 */
  body[data-scroll-locked] {
    overflow: hidden !important;
    padding-right: 0px !important;
  }
}
```

### 4-2. DashboardLayout — main에 scrollbar-gutter 적용

레이아웃이 `html/body` 대신 `<main>`을 스크롤 컨테이너로 사용하는 경우, `<main>`에도 별도로 보호를 적용해야 한다.

```tsx
// layout.tsx
<main className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 sm:px-6 lg:px-10 py-8">
  {children}
</main>
```

### 4-3. Radix UI 컴포넌트 규칙

| 컴포넌트 | 설정 | 이유 |
|----------|------|------|
| `DropdownMenu` (소형 UI) | `modal={false}` **필수** | scroll-lock 불필요 → padding-right 주입 방지 |
| `Dialog` / `AlertDialog` / `Sheet` | 기본값 (`modal={true}`) | 실제 모달 → scroll-lock 정상 동작 |
| `Select` | 변경 없음 | Radix 내부 처리 |

```tsx
// ✅ 올바른 드롭다운
<DropdownMenu modal={false}>
  ...
</DropdownMenu>

// ✅ 올바른 모달
<Dialog>  {/* modal={true} 기본값 유지 */}
  ...
</Dialog>
```

### 4-4. 너비 단위 규칙

| 상황 | 권장 | 금지 |
|------|------|------|
| 컨테이너 너비 | `w-full` | `100vw` 직접 사용 |
| 고정 요소 너비 | `left-0 right-0` | `width: 100vw` |
| 새 스크롤 영역 | `[scrollbar-gutter:stable]` 추가 | 아무 처리 없이 `overflow-y-auto` |

---

## 5. 신규 페이지 작성 체크리스트

페이지를 새로 작성하거나 리뷰할 때 아래 항목을 확인한다.

### 구조 체크

- [ ] 루트: `<motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2, ease:"easeOut" }} className="space-y-6">`
- [ ] 헤더: `<div className="flex items-start justify-between gap-4">`
- [ ] 제목: `<h1 className="text-2xl font-semibold text-foreground tracking-tight">`
- [ ] 설명: `<p className="text-sm text-muted-foreground mt-1">`
- [ ] 페이지 루트 수준에 `max-w-*` + `mx-auto` 없음

### 상태 관리 체크

- [ ] 서버 데이터 기반 파생값 → `useEffect + setState` 대신 렌더 중 직접 계산
- [ ] `useEffect`는 DOM 조작·구독·타이머·side-effect 전용으로만 사용

### 컨텐츠 패턴 체크

- [ ] `isLoading` → `<LoadingSkeleton />`
- [ ] `isError` → `<ErrorNotice message="..." />`
- [ ] `items.length === 0` → `<EmptyState />`
- [ ] 여러 카드 목록 → stagger 애니메이션 (`containerVariants` + `itemVariants`)

### 레이아웃 안정성 체크

- [ ] 새 `DropdownMenu` 추가 시 `modal={false}` 적용
- [ ] 새 스크롤 영역(`overflow-y-auto`) 추가 시 `[scrollbar-gutter:stable]` 함께 적용
- [ ] `100vw` 사용 없음 → `w-full` 사용

---

## 6. CLAUDE.md 등록 방법

### 왜 CLAUDE.md에 등록해야 하는가?

Claude Code는 대화 시작 시 `CLAUDE.md`를 자동으로 읽습니다. 이 파일에 참조 문서를 명시하면 **매 대화마다 별도 지시 없이** 이 가이드를 따릅니다.

### 등록 위치

`CLAUDE.md`의 **해결 프로세스** 섹션 하단에 아래 내용을 추가합니다.

```markdown
### 신규 페이지 구현 시 참조 문서

페이지를 새로 구현하거나 기존 페이지를 수정할 때는 반드시 아래 문서를 먼저 확인하고 기준을 따르십시오.

| 문서 | 적용 범위 |
|------|-----------|
| `docs/design/design_guide-page-template.md` | 페이지 구조·상태 패턴·Skeleton/Error/Empty·체크리스트 |
| `docs/design/design_guide-layout.md` | 스크롤 흔들림·Radix UI 패딩 주입 방지·고정 요소 |
| `docs/design/design_guide-web.md` | 웹 레이아웃 시스템 (사이드바·헤더·그리드) |
| `docs/design/design_guide-common.md` | 공통 디자인 토큰 (색상·반경·폰트·애니메이션) |

**체크리스트**: 구현 완료 후 `design_guide-page-template.md` 5장의 체크리스트를 통과해야 합니다.
```

### 등록 후 Claude의 동작 변화

| 상황 | 등록 전 | 등록 후 |
|------|---------|---------|
| 신규 페이지 구현 요청 | 임의 구조로 작성 | 표준 템플릿 자동 적용 |
| 상태 관리 코드 작성 | useEffect+setState 혼용 가능 | 파생값 패턴 자동 적용 |
| DropdownMenu 추가 | modal 속성 누락 가능 | `modal={false}` 자동 적용 |
| 목록 컴포넌트 작성 | 애니메이션 누락 가능 | stagger 애니메이션 자동 적용 |
