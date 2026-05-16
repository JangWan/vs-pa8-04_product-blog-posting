/**
 * 사용자 지침 + SEO 규칙을 하나의 시스템 프롬프트로 조합한다.
 * guidelineContent가 빈 문자열이면 기본 SEO 프롬프트만 적용된다 (BR-10).
 */
export function buildSystemInstruction(guidelineContent: string): string {
  const seoRules = `
## SEO 최적화 규칙 (반드시 준수)
- H1 제목은 타겟 키워드 포함, 60자 이내
- H2/H3 소제목 계층 구조 유지 (최소 3개 소제목)
- 첫 문단에 핵심 키워드 자연스럽게 포함
- 글 마지막에 seo_meta JSON 블록 출력 (아래 형식 준수)
- 내부 링크 유도 문구 1개 포함
- 결론 섹션 반드시 포함

## 출력 형식 (반드시 준수)
마크다운 본문을 먼저 작성하고, 맨 마지막 줄에 다음 JSON을 출력한다:
\`\`\`json
{"seo_meta":{"title":"SEO 제목 60자 이내","description":"메타 설명 160자 이내","slug":"url-slug-lowercase","keywords":["키워드1","키워드2"]}}
\`\`\`
`.trim();

  return `당신은 인디해커의 제품 블로그 전문 작가입니다.
아래 작성 지침과 SEO 규칙을 반드시 준수하여 블로그 글을 작성하세요.
출력 형식은 마크다운입니다.

## 사용자 작성 지침
${guidelineContent || "(등록된 지침 없음 — 인디해커 친화적인 실용적 톤으로 작성)"}

${seoRules}`;
}

/**
 * 스트리밍 완료 후 누적된 텍스트에서 seo_meta JSON을 추출한다.
 * 추출 성공 시 { body, seoMeta }를 반환하고, 실패 시 기본값을 사용한다.
 */
export function extractSeoMeta(rawText: string): {
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
    const jsonMatch = rawText.match(
      /```json\s*\{"seo_meta":([\s\S]*?)\}\s*```/
    );
    if (jsonMatch) {
      const parsed = JSON.parse(`{"seo_meta":${jsonMatch[1]}}`);
      const body = rawText.slice(0, rawText.lastIndexOf("```json")).trim();
      return { body, seoMeta: { ...defaultMeta, ...parsed.seo_meta } };
    }
  } catch {
    // JSON 파싱 실패 시 원본 텍스트를 body로 사용
  }

  return { body: rawText.trim(), seoMeta: defaultMeta };
}
