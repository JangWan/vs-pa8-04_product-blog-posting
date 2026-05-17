---
description: Google Gemini API 가이드라인 (Next.js / TypeScript)
globs: "src/**/*.ts,src/**/*.tsx"
---

# Google Gemini API 가이드라인 (2026 Edition)

> 기준: 2026년 5월 / @google/genai SDK / Next.js App Router + Hono  
> 스킬 기반 검증: `gemini-api-dev`, `gemini-live-api-dev`, `gemini-interactions-api`

---

## 0. Gemini API 서비스 전체 목록

Gemini API는 용도에 따라 3개의 독립적인 API로 구성된다.

| API | 연결 방식 | 주요 용도 | 이 프로젝트 |
|-----|---------|---------|----------|
| **Text Generation API** | HTTP (단방향) | 텍스트·마크다운 생성, 이미지 이해 | ✅ **사용 중** |
| **Interactions API** | HTTP (SSE 스트리밍) | 에이전트, 서버 상태 대화, Deep Research | ❌ 미사용 |
| **Live API** | WebSocket (양방향) | 실시간 음성·영상 대화 | ❌ 미사용 |

> ⚠️ **서비스마다 사용하는 모델 ID가 다르다.** 잘못된 모델 ID 사용 시 404 오류 발생.

---

## 1. 현재 유효한 모델 ID (모델 단일 참조표)

> ⚠️ `gemini-2.0-*`, `gemini-1.5-*`는 **deprecated** — 절대 사용 금지  
> ⚠️ `gemini-3.1-flash` 같은 ID는 **존재하지 않음** — 실제 API 404 오류 발생  
> ℹ️ 무료 티어에서 입력 콘텐츠가 Google 제품 개선에 활용될 수 있음 — 개인정보 포함 금지

### Text Generation / Interactions API 공통

| 모델 ID | 컨텍스트 | 특징 | 무료 한도 | 추천 용도 |
|--------|---------|------|---------|---------|
| `gemini-2.5-flash` | 1M | 안정, 가성비 최우수 | 1,500 RPD | **MVP 기본값** ✅ |
| `gemini-2.5-pro` | 1M | 복잡한 추론, 최고 품질 | 유료 | 고품질 장문 생성 |
| `gemini-3-flash-preview` | 1M | 빠름, 균형, 멀티모달 | 무료 | 최신 플래시 모델 |
| `gemini-3.1-pro-preview` | 1M | 최고 성능, 복잡 추론 | 유료 Preview | 프리미엄 플랜 |
| `gemini-3.1-flash-lite-preview` | — | 초경량, 고빈도 경량 작업 | 무료 | 배치, 요약 |
| `gemini-3-pro-image-preview` | 65k/32k | 이미지 생성·편집 | — | 이미지 생성 |
| `gemini-3.1-flash-image-preview` | 65k/32k | 이미지 생성·편집 | — | 이미지 편집 |

### Live API 전용

| 모델 ID | 컨텍스트 | 무료 한도 | 비고 |
|--------|---------|---------|------|
| `gemini-3.1-flash-live-preview` | 128k | 제한 있음 | **유일한 권장 모델** — 일반 모델 사용 불가 |

> deprecated Live 모델: `gemini-live-2.5-flash-preview`, `gemini-2.0-flash-live-001` (2025-12-09 종료)

---

## 2. SDK 설치 (공통)

```bash
pnpm add @google/genai   # >= 1.33.0
```

> ⚠️ `@google/generative-ai` (구 SDK)는 deprecated — 절대 사용 금지

```env
# .env.local
GOOGLE_GENAI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash   # 환경별 전환 가능
```

---

## 3. Text Generation API ← **이 프로젝트 사용 중**

HTTP 요청으로 텍스트를 생성한다. `generateContent` (단건) 또는 `generateContentStream` (스트리밍).

### 3-1. SDK 초기화 (서버 전용 싱글턴)

```typescript
// src/lib/gemini.ts — 서버 전용, 클라이언트 import 금지
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY! })

export const geminiModel = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
export { ai }
```

### 3-2. 스트리밍 생성 (블로그 장문 권장)

```typescript
// Hono Route — 스트리밍 응답 (이 프로젝트 패턴)
import { stream } from 'hono/streaming'
import { ai, geminiModel } from '@/lib/gemini'

app.post('/generate/stream', async (c) => {
  return stream(c, async (s) => {
    const response = await ai.models.generateContentStream({
      model: geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction,  // 시스템 프롬프트는 반드시 config에 주입 (contents 혼합 금지)
        temperature: 0.7,
      },
    })

    for await (const chunk of response) {
      await s.write(chunk.text ?? '')
    }
  })
})
```

### 3-3. 시스템 프롬프트 조합 패턴 (IndiePost AI 핵심)

```typescript
// src/features/generate/backend/service.ts
export function buildSystemInstruction(userGuideline: string): string {
  return `당신은 인디해커의 제품 블로그 전문 작가입니다.
아래 작성 지침과 SEO 규칙을 반드시 준수하여 블로그 글을 작성하세요.
출력 형식은 마크다운입니다.

## 사용자 작성 지침
${userGuideline || '(등록된 지침 없음 — 인디해커 친화적인 실용적 톤으로 작성)'}

## SEO 최적화 규칙
- H1 제목은 타겟 키워드 포함, 60자 이내
- H2/H3 소제목 계층 구조 유지 (최소 3개)
- 첫 문단에 핵심 키워드 자연스럽게 포함
- 결론 섹션 반드시 포함`.trim()
}
```

### 3-4. 에러 처리 (Rate Limit 포함)

```typescript
import { GoogleGenAIError } from '@google/genai'

try {
  const response = await ai.models.generateContentStream({ ... })
  for await (const chunk of response) { ... }
} catch (err) {
  console.error('[generate/stream] 에러:', err)

  const isRateLimit =
    err instanceof Error &&
    (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))

  // 스트리밍 중 에러는 [ERROR] 청크로 클라이언트에 전달
  await stream.write(`[ERROR]${JSON.stringify({
    code: isRateLimit ? 'RATE_LIMIT' : 'SERVER_ERROR',
    message: isRateLimit
      ? 'AI 서비스가 잠시 혼잡합니다. 1분 후 다시 시도해주세요.'
      : 'AI 생성 중 오류가 발생했습니다.',
  })}`)
}
```

### 3-5. Must

- `GOOGLE_GENAI_API_KEY`는 **절대 클라이언트에 노출 금지**
- 스트리밍은 `generateContentStream()` 사용
- 시스템 프롬프트는 `config.systemInstruction`에 주입 — `contents`에 혼합 금지
- 모델 ID는 환경변수(`GEMINI_MODEL`)로 분리

---

## 4. Interactions API (에이전트·대화 상태 관리)

`generateContent`의 개선된 차세대 인터페이스. 서버 사이드 대화 상태, 백그라운드 실행, Deep Research 에이전트를 지원한다.

> 이 프로젝트는 미사용. 향후 채팅·리서치 기능 추가 시 참고.

### 4-1. 기본 사용

```typescript
import { GoogleGenAI } from '@google/genai'

const client = new GoogleGenAI({})

// 단건 생성
const interaction = await client.interactions.create({
  model: 'gemini-3-flash-preview',
  input: '블로그 주제를 3개 추천해줘.',
})
console.log(interaction.outputs[interaction.outputs.length - 1].text)
```

### 4-2. 서버 상태 대화 (이전 대화 기억)

```typescript
// 1번 대화
const turn1 = await client.interactions.create({
  model: 'gemini-3-flash-preview',
  input: '안녕, 나는 인디해커야.',
})

// 2번 대화 — previous_interaction_id로 맥락 유지
const turn2 = await client.interactions.create({
  model: 'gemini-3-flash-preview',
  input: '내 직업이 뭐야?',
  previous_interaction_id: turn1.id,  // 서버가 대화 히스토리 관리
})
```

### 4-3. Deep Research 에이전트

```typescript
// 백그라운드 실행 — 긴 리서치 작업에 적합
const research = await client.interactions.create({
  agent: 'deep-research-pro-preview-12-2025',
  input: 'Next.js SaaS 스타터킷 시장 조사',
  background: true,
})

// 폴링으로 완료 확인
while (true) {
  const result = await client.interactions.get(research.id)
  if (result.status === 'completed') {
    console.log(result.outputs[result.outputs.length - 1].text)
    break
  }
  await new Promise(r => setTimeout(r, 10000))
}
```

### 4-4. generateContent vs Interactions API 비교

| 항목 | generateContent | Interactions API |
|------|----------------|-----------------|
| 대화 상태 | 클라이언트가 history 관리 | 서버가 관리 (`previous_interaction_id`) |
| 백그라운드 실행 | ❌ | ✅ `background: true` |
| 에이전트 | ❌ | ✅ Deep Research 등 |
| 스트리밍 | ReadableStream | SSE (Server-Sent Events) |
| 저장 | ❌ | ✅ 유료 55일, 무료 1일 |

---

## 5. Live API (실시간 음성·영상)

WebSocket 기반 양방향 실시간 스트리밍. 음성 대화, 영상 분석, 실시간 번역 등에 사용한다.

> 이 프로젝트는 미사용. 향후 실시간 채팅 기능 추가 시 참고.

### 5-1. 전용 모델

```
gemini-3.1-flash-live-preview   ← 유일한 권장 모델 (128k 컨텍스트)
```

> ⚠️ deprecated 모델: `gemini-live-2.5-flash-preview`, `gemini-2.0-flash-live-001` (2025-12-09 종료)

### 5-2. 기본 연결 (TypeScript)

```typescript
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY! })

const session = await ai.live.connect({
  model: 'gemini-3.1-flash-live-preview',
  config: {
    responseModalities: ['audio'],
    systemInstruction: { parts: [{ text: '당신은 친절한 한국어 AI 어시스턴트입니다.' }] }
  },
  callbacks: {
    onopen: () => console.log('Live 연결됨'),
    onmessage: (response) => {
      const content = response.serverContent
      if (content?.outputTranscription) {
        console.log('AI:', content.outputTranscription.text)
      }
    },
    onerror: (err) => console.error('Live 에러:', err),
    onclose: () => console.log('Live 종료'),
  }
})
```

### 5-3. 텍스트/오디오 전송

```typescript
// 텍스트 전송
session.sendRealtimeInput({ text: '안녕하세요!' })

// 오디오 전송 (PCM 16kHz)
session.sendRealtimeInput({
  audio: { data: chunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' }
})
```

### 5-4. 제약사항

- 응답 모달: `TEXT` 또는 `AUDIO` 중 택1 (동시 불가)
- 세션 최대: 오디오 15분 / 오디오+영상 2분 (압축 없이)
- WebSocket만 지원 (WebRTC 미지원 → 파트너 통합: LiveKit, Pipecat 등)
- 클라이언트 직접 연결 시 **ephemeral token 필수** (API 키 노출 방지)

---

## References

| 문서                | URL                                                   |
| ----------------- | ----------------------------------------------------- |
| Gemini API 공식 문서  | https://ai.google.dev/gemini-api/docs                 |
| 모델 목록             | https://ai.google.dev/gemini-api/docs/models          |
| 모델 중단 목록          | https://ai.google.dev/gemini-api/docs/deprecations    |
| Text Generation   | https://ai.google.dev/gemini-api/docs/text-generation |
| Interactions API  | https://ai.google.dev/gemini-api/docs/interactions    |
| Live API          | https://ai.google.dev/gemini-api/docs/live            |
| 요금 정보             | https://ai.google.dev/gemini-api/docs/pricing         |
| @google/genai npm | https://www.npmjs.com/package/@google/genai           |
