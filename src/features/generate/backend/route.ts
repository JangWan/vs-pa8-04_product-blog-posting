import { Hono } from "hono";
import { z } from "zod";
import { stream } from "hono/streaming";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { contents, guidelines, organizations, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { ai, geminiModel } from "@/lib/gemini";
import { buildSystemInstruction, extractSeoMeta } from "./service";
import { checkQuota, incrementQuota } from "@/features/billing/backend/service";

type Bindings = { userId: string | null; orgId: string | null };

const generateRoute = new Hono<{
  Variables: { userId: string };
  Bindings: Bindings;
}>();

const generateSchema = z.object({
  topic: z.string().min(1).max(300),
  keywords: z.array(z.string().max(50)).max(5).optional().default([]),
  direction: z.string().max(200).optional().default(""),
  guidelineId: z.string().nullable().optional(),
});

/* POST /api/generate/stream — AI 스트리밍 생성 */
generateRoute.post("/stream", requireAuth, async (c) => {
    const clerkUserId = c.get("userId");
    const clerkOrgId = (c.env as Bindings).orgId;

    const parsed = generateSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
    const { topic, keywords, direction, guidelineId } = parsed.data;

    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerk_user_id, clerkUserId),
    });
    if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

    // 활성 조직 조회 (organization_id 설정용)
    let activeOrgId: string | null = null;
    if (clerkOrgId) {
      const org = await db.query.organizations.findFirst({
        where: and(eq(organizations.clerk_org_id, clerkOrgId), isNull(organizations.deleted_at)),
      });
      activeOrgId = org?.id ?? null;
    }
    if (!activeOrgId && dbUser.default_organization_id) {
      activeOrgId = dbUser.default_organization_id;
    }

    /* 선택된 지침 내용 조회 */
    let guidelineContent = "";
    let resolvedGuidelineId: string | null = null;

    if (guidelineId) {
      const guideline = await db.query.guidelines.findFirst({
        where: and(
          eq(guidelines.id, guidelineId),
          eq(guidelines.user_id, dbUser.id)
        ),
      });
      if (guideline) {
        guidelineContent = guideline.content;
        resolvedGuidelineId = guideline.id;
      }
    }

    // G-02: 생성 한도 체크 (스트림 시작 전)
    if (activeOrgId) {
      const quota = await checkQuota(activeOrgId, "generations");
      if (!quota.allowed) {
        return c.json({
          error: "QUOTA_EXCEEDED",
          message: `이번 달 AI 생성 한도(${quota.limit}회)를 초과했습니다.`,
          used: quota.used,
          limit: quota.limit,
        }, 429);
      }
    }

    const systemInstruction = buildSystemInstruction(guidelineContent);

    /* 사용자 프롬프트 조합 */
    const userPrompt = [
      `주제: ${topic}`,
      keywords && keywords.length > 0
        ? `키워드: ${keywords.join(", ")}`
        : null,
      direction ? `글 방향: ${direction}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return stream(c, async (s) => {
      let fullText = "";

      try {
        const response = await ai.models.generateContentStream({
          model: geminiModel,
          contents: userPrompt,
          config: { systemInstruction, temperature: 0.7 },
        });

        for await (const chunk of response) {
          const text = chunk.text ?? "";
          fullText += text;
          await s.write(text);
        }

        /* 스트리밍 완료 후 DB 저장 */
        const { body, seoMeta } = extractSeoMeta(fullText);

        const [saved] = await db
          .insert(contents)
          .values({
            id: crypto.randomUUID(),
            user_id: dbUser.id,
            organization_id: activeOrgId,
            guideline_id: resolvedGuidelineId,
            topic,
            keywords: keywords ?? [],
            direction: direction || null,
            body,
            seo_meta: seoMeta,
          })
          .returning({ id: contents.id });

        // G-02: 성공 후 사용량 증가
        if (activeOrgId) {
          await incrementQuota(activeOrgId, "generations").catch(() => {});
        }

        /* [DONE] 청크로 ID 전송 — 클라이언트가 감지 후 리다이렉트 */
        await s.write(
          `[DONE]${JSON.stringify({ id: saved.id, seo_meta: seoMeta })}`
        );
      } catch (err) {
        console.error("[generate/stream] 에러:", err);

        const isRateLimit =
          err instanceof Error &&
          (err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED"));

        await s.write(
          `[ERROR]${JSON.stringify({
            code: isRateLimit ? "RATE_LIMIT" : "SERVER_ERROR",
            message: isRateLimit
              ? "AI 서비스가 잠시 혼잡합니다. 1분 후 다시 시도해주세요."
              : "AI 생성 중 오류가 발생했습니다.",
          })}`
        );
      }
  });
});

export default generateRoute;
