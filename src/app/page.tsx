import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { TypingAnimation } from "@/components/magicui/typing-animation";
import { Ripple } from "@/components/magicui/ripple";
import { Button } from "@/components/ui/button";
import {
  Clock,
  TrendingUp,
  BookOpen,
  Zap,
  Target,
  FileText,
  Check,
  X,
} from "lucide-react";

export const metadata: Metadata = {
  title: "IndiePost AI — 인디해커를 위한 AI 블로그 자동 작성",
  description:
    "주제만 입력하면 AI가 브랜드 톤과 SEO 최적화를 적용한 블로그 초안을 자동으로 작성해드립니다. 인디해커를 위한 최적의 콘텐츠 생성 도구.",
  openGraph: {
    title: "IndiePost AI — 인디해커를 위한 AI 블로그 자동 작성",
    description:
      "주제만 입력하면 AI가 브랜드 톤과 SEO 최적화를 적용한 블로그 초안을 자동으로 작성해드립니다.",
  },
};

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <PublicHeader />

      <main className="flex-1 pt-16">
        {/* ─── Hero 섹션 ─── */}
        <section className="relative bg-white py-24 sm:py-32 overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-8">
              <Zap className="h-3.5 w-3.5" />
              <span>AI 기반 블로그 자동 작성</span>
            </div>

            <h1
              className="font-bold text-foreground mb-6 max-w-4xl mx-auto"
              style={{
                fontSize: "clamp(2rem, 5vw, 4rem)",
                lineHeight: 1.1,
                letterSpacing: "-2.125px",
              }}
            >
              <TypingAnimation
                text="주제만 입력하면, AI가 블로그를 씁니다."
                duration={50}
              />
            </h1>

            <p
              className="font-semibold text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
              style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)" }}
            >
              브랜드 톤 지침 + SEO 최적화가 자동 적용된 마크다운 초안을
              <br className="hidden sm:block" />
              30초 안에 받아보세요. 인디해커를 위한 콘텐츠 솔루션.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/sign-up">
                <Button
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 text-base font-semibold"
                  style={{ borderRadius: "4px" }}
                >
                  무료로 시작하기
                </Button>
              </Link>
              <Link href="#features">
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-base font-medium text-muted-foreground hover:text-foreground"
                  style={{ borderRadius: "4px" }}
                >
                  기능 살펴보기
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ─── 문제 제기 섹션 ─── */}
        <section className="bg-[#f6f5f4] py-20 sm:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2
                className="font-bold text-foreground mb-4"
                style={{
                  fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
                  letterSpacing: "-0.625px",
                }}
              >
                인디해커에게 블로그가 어려운 이유
              </h2>
              <p className="text-muted-foreground text-base max-w-xl mx-auto">
                제품 개발·운영·마케팅을 혼자 담당하는 1인 창업자의 현실
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PAIN_POINTS.map((point) => (
                <div
                  key={point.title}
                  className="bg-white shadow-notion-card border-whisper rounded-lg p-6"
                >
                  <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg mb-4">
                    <point.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-base">
                    {point.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {point.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 기능 소개 섹션 ─── */}
        <section id="features" className="py-20 sm:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2
                className="font-bold text-foreground mb-4"
                style={{
                  fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
                  letterSpacing: "-0.625px",
                }}
              >
                IndiePost AI가 해결하는 방법
              </h2>
              <p className="text-muted-foreground text-base max-w-xl mx-auto">
                3가지 핵심 기능으로 블로그 작성 시간을 90% 줄여드립니다
              </p>
            </div>

            <div className="space-y-16">
              {FEATURES.map((feature, index) => (
                <div
                  key={feature.id}
                  className={`flex flex-col ${index % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"} items-center gap-10`}
                >
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
                      {feature.badge}
                    </div>
                    <h3
                      className="font-bold text-foreground mb-3"
                      style={{
                        fontSize: "clamp(1.25rem, 2vw, 1.625rem)",
                        letterSpacing: "-0.25px",
                      }}
                    >
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      {feature.description}
                    </p>
                    <ul className="space-y-2">
                      {feature.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex-1 w-full">
                    <div className="bg-[#f6f5f4] border-whisper rounded-xl p-8 min-h-[200px] flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground text-center">
                        <feature.icon className="h-12 w-12 text-primary/40" />
                        <span className="text-sm font-mono">{feature.visual}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 유사 서비스 비교 테이블 ─── */}
        <section className="bg-[#f6f5f4] py-20 sm:py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2
                className="font-bold text-foreground mb-4"
                style={{
                  fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
                  letterSpacing: "-0.625px",
                }}
              >
                왜 IndiePost AI인가?
              </h2>
              <p className="text-muted-foreground text-base">
                기존 서비스와의 차이점을 확인하세요
              </p>
            </div>

            <div className="bg-white shadow-notion-card border-whisper rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      서비스
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      인디해커 특화
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      지침 관리
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      SEO 자동화
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      저비용
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, index) => (
                    <tr
                      key={row.service}
                      className={
                        index < COMPARISON.length - 1
                          ? "border-b border-border"
                          : ""
                      }
                    >
                      <td
                        className={`py-3 px-4 font-medium ${row.isUs ? "text-primary" : "text-foreground"}`}
                      >
                        {row.service}
                        {row.isUs && (
                          <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            추천
                          </span>
                        )}
                      </td>
                      {[row.indie, row.guideline, row.seo, row.lowCost].map(
                        (val, i) => (
                          <td key={i} className="py-3 px-4 text-center">
                            {val ? (
                              <Check className="h-4 w-4 text-primary mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground mx-auto" />
                            )}
                          </td>
                        )
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ─── 하단 CTA 섹션 ─── */}
        <section className="relative bg-white py-24 sm:py-32 overflow-hidden">
          <Ripple className="opacity-60" />
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2
              className="font-bold text-foreground mb-4"
              style={{
                fontSize: "clamp(1.75rem, 3.5vw, 3rem)",
                letterSpacing: "-1.5px",
              }}
            >
              지금 바로 시작해보세요
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              브랜드 지침을 한 번만 등록하면, AI가 항상 일관된 톤으로 씁니다.
              <br />
              회원가입 후 바로 무료로 사용할 수 있습니다.
            </p>
            <Link href="/sign-up">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 text-base font-semibold"
                style={{ borderRadius: "4px" }}
              >
                지금 무료로 시작하기
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

/* ─── 섹션 데이터 ─── */

const PAIN_POINTS = [
  {
    icon: Clock,
    title: "시간이 없다",
    description:
      "낮에는 본업, 저녁엔 개발·운영. 블로그 글 한 편 쓰는 데 2~3시간이 걸려서 결국 방치된다.",
  },
  {
    icon: TrendingUp,
    title: "SEO를 모른다",
    description:
      "좋은 글을 써도 검색에 노출되지 않는다. 키워드 배치·메타 태그·제목 구조를 매번 공부하기 어렵다.",
  },
  {
    icon: BookOpen,
    title: "톤이 일관되지 않는다",
    description:
      "바쁠 때 쓴 글과 여유로울 때 쓴 글의 문체가 달라 브랜드 이미지가 흔들린다.",
  },
];

const FEATURES = [
  {
    id: "f1",
    badge: "F1 — 콘텐츠 자동 작성",
    title: "주제 입력 → 30초 안에 완성된 초안",
    description:
      "블로그 주제, 키워드, 글 방향만 입력하면 AI가 완성된 마크다운 초안을 실시간 스트리밍으로 생성합니다. 에디터에서 바로 수정하고 복사하면 완성.",
    points: [
      "마크다운 형식으로 구조화된 초안 생성",
      "MDX 에디터에서 인라인 편집 가능",
      "전체 복사 및 마크다운 파일 다운로드",
    ],
    icon: Zap,
    visual: "# Next.js로 SaaS 만든 후기\n\n## 시작하게 된 이유...",
  },
  {
    id: "f2",
    badge: "F2 — AI 지침 관리",
    title: "한 번 등록, 매번 일관된 브랜드 톤",
    description:
      "브랜드 톤·문체·금지 표현 등 작성 규칙을 지침으로 등록하면 모든 콘텐츠 생성에 자동 적용됩니다. 당신만의 목소리를 AI가 기억합니다.",
    points: [
      "다수의 지침 등록 및 기본 지침 설정",
      "생성 시 지침 선택 드롭다운",
      "지침 수정·삭제 CRUD 완전 지원",
    ],
    icon: FileText,
    visual: "톤: 친근하고 기술적\n금지어: '혁신적', '게임체인저'",
  },
  {
    id: "f3",
    badge: "F3 — SEO 최적화",
    title: "별도 설정 없이 SEO 자동 적용",
    description:
      "검색엔진 최적화 구조(제목 태그, 메타 설명, 소제목 계층, 키워드 밀도)를 AI가 자동으로 반영합니다. SEO 공부 없이도 검색에 노출되는 글을 만들 수 있습니다.",
    points: [
      "SEO 최적화 메타 정보 자동 생성",
      "검색 친화적 소제목 구조 적용",
      "타겟 키워드 밀도 자동 조정",
    ],
    icon: Target,
    visual: "meta.title: 60자 이내\ndescription: 160자 이내",
  },
];

const COMPARISON = [
  {
    service: "IndiePost AI",
    isUs: true,
    indie: true,
    guideline: true,
    seo: true,
    lowCost: true,
  },
  {
    service: "Copy.ai",
    isUs: false,
    indie: false,
    guideline: false,
    seo: false,
    lowCost: false,
  },
  {
    service: "Jasper AI",
    isUs: false,
    indie: false,
    guideline: true,
    seo: false,
    lowCost: false,
  },
  {
    service: "Hashnode AI",
    isUs: false,
    indie: true,
    guideline: false,
    seo: false,
    lowCost: true,
  },
];
