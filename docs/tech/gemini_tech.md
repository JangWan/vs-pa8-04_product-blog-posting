---
description: Google Gemini API 가이드라인 (Next.js / TypeScript)
globs: "src/**/*.ts,src/**/*.tsx"
---

# Google Gemini API 가이드라인 (2026 Edition)

> 기준: 2026년 5월 / @google/genai SDK / Next.js App Router + Hono
> 선택 조건: AI 텍스트 생성 기능이 필요한 경우 (콘텐츠 자동 작성, 시스템 프롬프트 기반 지침 적용)

---

## 1. 모델 선택 가이드

| 모델 ID                    | 특징               | 요금              | 추천 용도             |
| ------------------------ | ---------------- | --------------- | ----------------- |
| `gemini-3.1-flash`       | 빠른 응답, 고성능       | **무료**          | MVP 기본 사용 모델 (권장) |
| `gemini-3.1-flash-lite`  | 초경량, 대량 처리       | 무료              | 배치 처리, 짧은 요약      |
| `gemini-2.5-flash`       | 가성비 최우수 (stable) | 무료 티어 1,500 RPD | 안정성이 중요한 경우       |
| `gemini-2.5-pro`         | 복잡한 추론, 최고 품질    | 유료              | 고품질 장문 생성         |
| `gemini-3.1-pro-preview` | 최신 최고 성능         | 유료 Preview      | 프리미엄 플랜 사용자       |

> ✅ **MVP 기본값**: `gemini-3.1-flash` — 무료이며 블로그 콘텐츠 생성에 충분한 성능
> ⚠️ **무료 티어 주의**: 무료 플랜 사용 시 입력 콘텐츠가 Google 제품 개선에 활용될 수 있음. 사용자 개인정보·민감 데이터 포함 금지

---

## 2. Must

- `GOOGLE_GENAI_API_KEY`는 **절대 클라이언트에 노출 금지** — 서버(Hono Route, Server Action)에서만 사용
- `@google/genai` 패키지 사용 (`@google/generative-ai`는 deprecated)
- 스트리밍 응답 시 `generateContentStream()` 사용 — 블로그 장문 생성에 필수
- 시스템 프롬프트(지침)는 `config.systemInstruction`에 주입 — `contents`에 혼합 금지
- 무료 티어 사용 시 사용자 콘텐츠를 API에 직접 전달하기 전 개인정보 포함 여부 검토

## 3. Should

- 모델 ID는 환경변수(`GEMINI_MODEL`)로 분리하여 플랜별 전환이 쉽도록 관리
- 에러는 명시적으로 반환 (`throw` 대신 `Result` 패턴)
- 스트리밍은 Next.js `ReadableStream`으로 클라이언트에 전달
- 온도(`temperature`)는 콘텐츠 생성 특성에 따라 조정 (창의적 글: 0.7~1.0, SEO 구조화: 0.3~0.5)

---

## 4. 설치 및 환경변수

```bash
pnpm add @google/genai
```

```env
# .env.local
GOOGLE_GENAI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3.1-flash   # 기본 모델 (환경별 전환 가능)
```

---

## 5. SDK 초기화 (서버 전용 싱글턴)

```typescript
// src/lib/gemini.ts — 서버 전용, 클라이언트 import 금지
import { GoogleGenAI } from '@google/genai'

// 싱글턴: 요청마다 재생성 방지
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY!,
})

export const geminiModel = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash'
export { ai }
```

---

## 6. 기본 텍스트 생성

```typescript
import { ai, geminiModel } from '@/lib/gemini'

type Result<T> = { success: true; data: T } | { success: false; error: string }

export async function generateBlogPost(
  topic: string,
  systemInstruction: string
): Promise<Result<string>> {
  try {
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: topic,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    })
    return { success: true, data: response.text ?? '' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'AI 생성 오류' }
  }
}
```

---

## 7. 스트리밍 생성 (블로그 장문 권장)

```typescript
// Hono Route — 스트리밍 응답
import { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import { ai, geminiModel } from '@/lib/gemini'

const app = new Hono()

app.post('/generate/stream', async (c) => {
  const { topic, systemInstruction } = await c.req.json<{
    topic: string
    systemInstruction: string
  }>()

  return streamText(c, async (stream) => {
    const response = await ai.models.generateContentStream({
      model: geminiModel,
      contents: topic,
      config: { systemInstruction, temperature: 0.7 },
    })

    for await (const chunk of response) {
      await stream.write(chunk.text ?? '')
    }
  })
})
```

```typescript
// 클라이언트 — 스트리밍 수신 훅
'use client'
import { useState } from 'react'

export function useGenerateStream() {
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const generate = async (topic: string, systemInstruction: string) => {
    setIsLoading(true)
    setContent('')

    const res = await fetch('/api/generate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, systemInstruction }),
    })

    const reader = res.body?.getReader()
    const decoder = new TextDecoder()

    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      setContent((prev) => prev + decoder.decode(value))
    }

    setIsLoading(false)
  }

  return { content, isLoading, generate }
}
```

---

## 8. 시스템 프롬프트 조합 패턴 (IndiePost AI 핵심)

AI 지침(사용자 등록 지침 + SEO 규칙)을 `systemInstruction`으로 조합하여 주입한다.

```typescript
// src/features/generate/backend/service.ts

/** 사용자 지침 + SEO 규칙을 하나의 시스템 프롬프트로 조합 */
export function buildSystemInstruction(userGuideline: string): string {
  const seoRules = `
## SEO 최적화 규칙 (반드시 준수)
- H1 제목은 타겟 키워드 포함, 60자 이내
- H2/H3 소제목 계층 구조 유지 (최소 3개 소제목)
- 첫 문단에 핵심 키워드 자연스럽게 포함
- 메타 설명용 요약문(150자 이내)을 글 마지막에 추가
- 내부 링크 유도 문구 1개 포함
- 결론 섹션 반드시 포함
`

  const baseInstruction = `
당신은 인디해커의 제품 블로그 전문 작가입니다.
아래 작성 지침과 SEO 규칙을 반드시 준수하여 블로그 글을 작성하세요.
출력 형식은 마크다운입니다.

## 사용자 작성 지침
${userGuideline || '(등록된 지침 없음 — 일반적인 인디해커 블로그 톤으로 작성)'}

${seoRules}
`

  return baseInstruction.trim()
}
```

---

## 9. 에러 처리 및 Rate Limit 대응

```typescript
import { GoogleGenAIError } from '@google/genai'

type GeminiResult<T> = { success: true; data: T } | { success: false; error: string; retryable: boolean }

export async function safeGenerate(
  topic: string,
  systemInstruction: string
): Promise<GeminiResult<string>> {
  try {
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: topic,
      config: { systemInstruction },
    })
    return { success: true, data: response.text ?? '' }
  } catch (err) {
    if (err instanceof GoogleGenAIError) {
      // 429: Rate Limit → 재시도 가능
      const retryable = err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')
      return { success: false, error: 'AI 서비스 일시 불안정. 잠시 후 다시 시도해주세요.', retryable }
    }
    return { success: false, error: 'AI 생성 중 오류가 발생했습니다.', retryable: false }
  }
}
```

---

## 10. 무료 티어 한도 및 운영 고려사항

| 항목 | 무료 한도 | 초과 시 |
|------|---------|--------|
| gemini-3.1-flash | 무료 (2026년 5월 기준) | 유료 전환 |
| gemini-2.5-flash | 1,500 RPD | 429 오류 |
| 콘텐츠 활용 | Google 제품 개선에 활용 가능 | 유료 플랜 시 비활성화 |

> ⚠️ **MVP 단계**: 무료 티어로 시작하되, 사용자 급증 시 유료 전환 계획 수립 필요  
> ⚠️ **데이터 프라이버시**: 무료 티어에서 사용자 콘텐츠가 Google에 전송됨 — 민감 정보 포함 금지 정책 서비스 약관에 명시

---

## References

| 문서 | URL |
|------|-----|
| Gemini API 공식 문서 | https://ai.google.dev/gemini-api/docs |
| 모델 목록 | https://ai.google.dev/gemini-api/docs/models |
| 텍스트 생성 가이드 | https://ai.google.dev/gemini-api/docs/text-generation |
| 요금 정보 | https://ai.google.dev/gemini-api/docs/pricing |
| @google/genai npm | https://www.npmjs.com/package/@google/genai |
