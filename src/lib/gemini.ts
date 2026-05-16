import { GoogleGenAI } from "@google/genai";

/* 서버 전용 싱글턴 — 클라이언트에서 import 금지 */
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY!,
});

export const geminiModel =
  process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export { ai };
