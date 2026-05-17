/* TRD §3-4 Phase 2 — Gemini 번역 프롬프트 가이드 */
const LANG_NAME: Record<"ko" | "en", string> = {
  ko: "한국어(Korean)",
  en: "English",
};

export function buildTranslationInstruction(
  sourceLang: "ko" | "en",
  targetLang: "ko" | "en",
): string {
  return `당신은 전문 번역가입니다. 다음 마크다운 블로그 글을 ${LANG_NAME[sourceLang]}에서 ${LANG_NAME[targetLang]}로 번역하세요.

## 번역 규칙 (반드시 준수)
- **마크다운 문법 구조를 100% 보존**: 헤딩 계층(#, ##, ###), 코드블록(\`\`\`), 링크([text](url)), 이미지(![alt](url)), 리스트, 인용, 표 모두 동일하게 유지
- **코드블록 안의 식별자·예약어는 번역하지 않음** (변수명·함수명·CSS 클래스 등 그대로 유지)
- 자연스러운 ${LANG_NAME[targetLang]} 표현 사용 (직역 금지)
- SEO 메타(title/description/slug/keywords)도 ${LANG_NAME[targetLang]} 표현으로 자연스럽게 재생성

## 출력 형식 (반드시 준수)
번역된 마크다운 본문을 먼저 작성하고, 맨 마지막 줄에 다음 JSON을 출력하세요:
\`\`\`json
{"seo_meta":{"title":"번역된 SEO 제목 60자 이내","description":"번역된 메타 설명 160자 이내","slug":"url-slug-lowercase","keywords":["키워드1","키워드2"]}}
\`\`\``;
}

export function buildTranslationUserPrompt(input: {
  body: string;
  seoMeta: {
    title: string;
    description: string;
    slug: string;
    keywords: string[];
  };
}): string {
  return `## 원문 SEO 메타 (참고용)
- title: ${input.seoMeta.title}
- description: ${input.seoMeta.description}
- keywords: ${input.seoMeta.keywords.join(", ")}

## 원문 본문 (마크다운)
${input.body}`;
}

/* 스트리밍 누적 텍스트에서 마지막 ```json {seo_meta:...} ``` 블록 분리 */
export function extractTranslatedSeoMeta(rawText: string): {
  body: string;
  seoMeta: {
    title: string;
    description: string;
    slug: string;
    keywords: string[];
  };
} {
  const defaultMeta = {
    title: "",
    description: "",
    slug: "untitled",
    keywords: [] as string[],
  };

  try {
    const match = rawText.match(/```json\s*\{"seo_meta":([\s\S]*?)\}\s*```/);
    if (match) {
      const parsed = JSON.parse(`{"seo_meta":${match[1]}}`);
      const body = rawText.slice(0, rawText.lastIndexOf("```json")).trim();
      return { body, seoMeta: { ...defaultMeta, ...parsed.seo_meta } };
    }
  } catch {
    /* 파싱 실패 시 원본 텍스트 사용 */
  }

  return { body: rawText.trim(), seoMeta: defaultMeta };
}
