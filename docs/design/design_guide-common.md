---
description: 공통 디자인 가이드 — 브랜드, 모션, 접근성 (플랫폼 무관)
---

# 공통 디자인 가이드 (2026 Edition)

> 플랫폼(web/모바일)에 무관하게 모든 프로젝트에 적용되는 브랜드 및 시각 디자인 지침
> IA 작성 단계에서 선택한 내용은 이후 Usecase에서 재정의하지 않고 참조만 한다.

---

## 1. 브랜드 디자인 시스템 선택

신규 프로젝트 시작 시, 아래 옵션 중 하나를 참고 기준으로 선택하거나 커스텀으로 정의한다.

### 참고 디자인 시스템 목록

| 시스템 | 특징 | 적합한 제품 유형 | 참고 문서 |
|--------|------|-----------------|----------|
| **Notion** | 미니멀, 콘텐츠 중심, 중성 색상 | 생산성 도구, 문서 서비스 | `docs/design/notion.md` |
| **Linear** | 다크 기반, 날카로운 선, 개발자 취향 | SaaS, 개발 도구, B2B | - |
| **Vercel** | 모노크롬, 고대비, 기술적 | 개발자 플랫폼, 테크 제품 | - |
| **Stripe** | 신뢰감, 정돈된 형태, 금융 친화적 | 결제, 핀테크, 기업 서비스 | - |
| **커스텀** | 프로젝트 고유 브랜드 | 브랜드 아이덴티티가 중요한 경우 | - |

> 참고 시스템은 디자인 방향의 레퍼런스일 뿐이다. 색상·타이포그래피는 프로젝트에 맞게 조정한다.

---

## 2. 색상 팔레트 정의 원칙

브랜드 색상은 아래 역할로 구분하여 정의한다. (구체적인 색상값은 프로젝트별로 결정)

| 토큰명 | 역할 | 예시 |
|--------|------|------|
| `--color-primary` | 주요 행동 유도 (CTA 버튼, 링크) | 브랜드 메인 컬러 |
| `--color-secondary` | 보조 강조 요소 | 브랜드 서브 컬러 |
| `--color-background` | 페이지 기본 배경 | 화이트 / 오프화이트 / 다크 |
| `--color-surface` | 카드, 패널 배경 | 배경보다 약간 어둡거나 밝음 |
| `--color-text-primary` | 주요 텍스트 | 고대비 |
| `--color-text-secondary` | 보조 텍스트, 레이블 | 중간 대비 |
| `--color-border` | 구분선, 테두리 | 배경 대비 subtle |
| `--color-error` | 에러 상태 | Red 계열 (#ef4444) |
| `--color-success` | 성공 상태 | Green 계열 (#22c55e) |
| `--color-warning` | 경고 상태 | Amber 계열 (#f59e0b) |

---

## 3. 타이포그래피

### 한국어 프로젝트 권장 폰트

| 폰트 | 특징 | 라이선스 |
|------|------|---------|
| **Pretendard** | 가장 완성도 높은 한글 고딕, GitHub 배포 | 무료 (SIL OFL) |
| **Noto Sans KR** | Google Fonts, 범용성 높음 | 무료 (SIL OFL) |
| **SUIT** | 개발자 친화적, 모던한 느낌 | 무료 (SIL OFL) |

```css
/* Pretendard 설정 예시 */
@font-face {
  font-family: "Pretendard";
  src: url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css");
}
```

### 타이포그래피 스케일

| 역할 | 크기 | 굵기 | 사용처 |
|------|------|------|--------|
| Display | 48–72px | 700 | 히어로 헤드라인 |
| H1 | 32–40px | 700 | 페이지 제목 |
| H2 | 24–28px | 600 | 섹션 제목 |
| H3 | 18–22px | 600 | 서브섹션 |
| Body | 14–16px | 400 | 본문 |
| Caption | 12px | 400 | 보조 정보, 레이블 |

---

## 4. 모션 / 애니메이션 라이브러리 선택

### 기본 선택: Framer Motion

> 대부분의 웹 프로젝트에서 Framer Motion을 기본으로 사용한다.

```bash
npm install framer-motion
```

```tsx
// 기본 페이지 전환
import { motion } from "framer-motion"

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}
```

### 상황별 대안 라이브러리

| 라이브러리 | 적합한 상황 | 특징 |
|-----------|-----------|------|
| **Framer Motion** ✅ 기본 | 대부분의 UI 애니메이션 | 선언적 API, React 최적화 |
| **Auto Animate** | 리스트/DOM 변화 자동 애니메이션 | 설치 후 한 줄로 사용 |
| **GSAP** | 복잡한 타임라인, 스크롤 트리거 | 성능 최고, 학습 비용 높음 |
| **Lottie** | After Effects 기반 애니메이션 | 로딩 스피너, 온보딩 일러스트 |

### 모션 원칙

| 원칙 | 내용 |
|------|------|
| **목적 있는 움직임** | 사용자 주의를 유도하는 목적이 있을 때만 애니메이션 추가 |
| **짧고 빠르게** | 대부분의 transition은 150–300ms |
| **Reduced Motion 지원** | `prefers-reduced-motion` 미디어 쿼리 반드시 처리 |
| **성능 우선** | `transform`, `opacity` 속성만 애니메이션 (layout 변경 금지) |

```tsx
// ✅ Reduced Motion 고려
const variants = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 8 },
}

// Framer Motion은 자동으로 prefers-reduced-motion 감지
<motion.div
  variants={variants}
  initial="initial"
  animate="animate"
  transition={{ duration: 0.2 }}
/>
```

---

## 5. 간격 및 그리드 시스템

### 4pt 그리드 기준
모든 간격은 4의 배수를 기준으로 한다.

| 토큰 | 값 | 사용처 |
|------|-----|--------|
| `space-1` | 4px | 아이콘과 텍스트 사이 |
| `space-2` | 8px | 컴포넌트 내부 패딩 (소) |
| `space-3` | 12px | 컴포넌트 내부 패딩 (중) |
| `space-4` | 16px | 섹션 내부 요소 간격 |
| `space-6` | 24px | 섹션 간격 (소) |
| `space-8` | 32px | 섹션 간격 (중) |
| `space-12` | 48px | 섹션 간격 (대) |
| `space-16` | 64px | 페이지 섹션 간격 |

---

## 6. 접근성 원칙

- **색상 대비**: WCAG AA 기준 — 본문 4.5:1, 대형 텍스트 3:1 이상
- **키보드 내비게이션**: 모든 인터랙티브 요소 Tab 접근 가능
- **스크린 리더**: `aria-label`, `aria-describedby` 적절히 사용
- **포커스 표시**: `focus-visible:` 스타일 항상 적용
- **대체 텍스트**: 모든 이미지에 의미 있는 `alt` 속성 필수
