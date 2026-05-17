import { Hono } from "hono";
import { z } from "zod";
import { stream } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { requireContentOwner } from "@/backend/middleware/content-owner";
import { db } from "@/db";
import { contentTranslations, contents } from "@/db/schema";
import { ai, geminiModel } from "@/lib/gemini";
import {
  buildTranslationInstruction,
  buildTranslationUserPrompt,
  extractTranslatedSeoMeta,
} from "./service";

type Vars = { userId: string; dbUserId: string };
const translationsRoute = new Hono<{ Variables: Vars }>();

const langSchema = z.enum(["ko", "en"]);
const streamRequestSchema = z.object({
  target_lang: langSchema,
  force: z.boolean().optional().default(false),
});

/* GET /api/contents/:id/translations — 탭 구성용 상태 목록 */
translationsRoute.get(
  "/:id/translations",
  requireAuth,
  requireContentOwner,
  async (c) => {
    const contentId = c.req.param("id");

    const content = await db.query.contents.findFirst({
      where: eq(contents.id, contentId),
      columns: { source_lang: true },
    });
    if (!content) return c.json({ error: "Not found" }, 404);

    const rows = await db
      .select({
        target_lang: contentTranslations.target_lang,
        status: contentTranslations.status,
        error_message: contentTranslations.error_message,
        updated_at: contentTranslations.updated_at,
      })
      .from(contentTranslations)
      .where(eq(contentTranslations.content_id, contentId));

    return c.json({
      source_lang: content.source_lang,
      data: rows.map((r) => ({
        target_lang: r.target_lang,
        status: r.status,
        error_message: r.error_message,
        updated_at: r.updated_at.toISOString(),
      })),
    });
  },
);

/* GET /api/contents/:id/translations/:lang — 본문 조회 (UC-21) */
translationsRoute.get(
  "/:id/translations/:lang",
  requireAuth,
  requireContentOwner,
  async (c) => {
    const contentId = c.req.param("id");
    const parsed = langSchema.safeParse(c.req.param("lang"));
    if (!parsed.success) return c.json({ error: "Invalid lang" }, 400);
    const lang = parsed.data;

    const row = await db.query.contentTranslations.findFirst({
      where: and(
        eq(contentTranslations.content_id, contentId),
        eq(contentTranslations.target_lang, lang),
      ),
    });
    if (!row) return c.json({ error: "Not found" }, 404);

    return c.json({
      target_lang: row.target_lang,
      translated_body: row.translated_body,
      translated_seo_meta: row.translated_seo_meta,
      status: row.status,
      error_message: row.error_message,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    });
  },
);

/* DELETE /api/contents/:id/translations/:lang — UC-22 */
translationsRoute.delete(
  "/:id/translations/:lang",
  requireAuth,
  requireContentOwner,
  async (c) => {
    const contentId = c.req.param("id");
    const parsed = langSchema.safeParse(c.req.param("lang"));
    if (!parsed.success) return c.json({ error: "Invalid lang" }, 400);
    const lang = parsed.data;

    const existing = await db.query.contentTranslations.findFirst({
      where: and(
        eq(contentTranslations.content_id, contentId),
        eq(contentTranslations.target_lang, lang),
      ),
    });
    if (!existing) return c.json({ error: "Not found" }, 404);

    await db
      .delete(contentTranslations)
      .where(
        and(
          eq(contentTranslations.content_id, contentId),
          eq(contentTranslations.target_lang, lang),
        ),
      );

    return c.json({ deleted: true, target_lang: lang });
  },
);

/* POST /api/contents/:id/translations/stream — UC-20 (스트리밍 번역) */
translationsRoute.post(
  "/:id/translations/stream",
  requireAuth,
  requireContentOwner,
  async (c) => {
    const contentId = c.req.param("id");
    const parsed = streamRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
    const { target_lang, force } = parsed.data;

    /* 콘텐츠 본문 + source_lang 로드 */
    const content = await db.query.contents.findFirst({
      where: eq(contents.id, contentId),
    });
    if (!content) return c.json({ error: "Not found" }, 404);

    /* 5-5: 본문 비어있음 */
    if (!content.body || content.body.length === 0) {
      return c.json(
        { error: "Empty body", message: "원문이 비어 있어 번역할 수 없습니다." },
        400,
      );
    }

    const sourceLang = (content.source_lang as "ko" | "en") ?? "ko";

    /* 5-4 / BR-22: 원문과 동일 언어 거부 */
    if (sourceLang === target_lang) {
      return c.json(
        {
          error: "Same lang",
          message: "원문 언어로는 번역할 수 없습니다.",
        },
        400,
      );
    }

    /* 기존 번역본 확인 (force 분기 / 동시 스트리밍 1건 제약) */
    const existing = await db.query.contentTranslations.findFirst({
      where: and(
        eq(contentTranslations.content_id, contentId),
        eq(contentTranslations.target_lang, target_lang),
      ),
    });

    if (existing?.status === "streaming") {
      return c.json(
        {
          error: "Already streaming",
          message: "이미 번역이 진행 중입니다. 잠시 후 다시 시도해주세요.",
        },
        409,
      );
    }

    if (existing?.status === "completed" && !force) {
      return c.json(
        {
          error: "already_exists",
          existing: {
            status: existing.status,
            updated_at: existing.updated_at.toISOString(),
          },
        },
        409,
      );
    }

    /* status='streaming' UPSERT */
    if (existing) {
      await db
        .update(contentTranslations)
        .set({
          status: "streaming",
          error_message: null,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(contentTranslations.content_id, contentId),
            eq(contentTranslations.target_lang, target_lang),
          ),
        );
    } else {
      await db.insert(contentTranslations).values({
        id: crypto.randomUUID(),
        content_id: contentId,
        target_lang,
        status: "streaming",
      });
    }

    const seoMetaSource = (content.seo_meta ?? {
      title: "",
      description: "",
      slug: "",
      keywords: [],
    }) as {
      title: string;
      description: string;
      slug: string;
      keywords: string[];
    };

    const systemInstruction = buildTranslationInstruction(sourceLang, target_lang);
    const userPrompt = buildTranslationUserPrompt({
      body: content.body,
      seoMeta: seoMetaSource,
    });

    return stream(c, async (s) => {
      let fullText = "";

      try {
        const response = await ai.models.generateContentStream({
          model: geminiModel,
          contents: userPrompt,
          config: { systemInstruction, temperature: 0.3 },
        });

        for await (const chunk of response) {
          const text = chunk.text ?? "";
          fullText += text;
          await s.write(text);
        }

        const { body, seoMeta } = extractTranslatedSeoMeta(fullText);

        const [updated] = await db
          .update(contentTranslations)
          .set({
            translated_body: body,
            translated_seo_meta: seoMeta,
            status: "completed",
            error_message: null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(contentTranslations.content_id, contentId),
              eq(contentTranslations.target_lang, target_lang),
            ),
          )
          .returning({ id: contentTranslations.id });

        await s.write(
          `[DONE]${JSON.stringify({
            translationId: updated?.id,
            target_lang,
            seo_meta: seoMeta,
          })}`,
        );
      } catch (err) {
        console.error("[translations/stream] 에러:", err);

        const isRateLimit =
          err instanceof Error &&
          (err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED"));

        const errorMessage = isRateLimit
          ? "AI 서비스가 잠시 혼잡합니다. 1분 후 다시 시도해주세요."
          : "번역 중 오류가 발생했습니다.";

        /* 5-2: status='failed' + error_message 기록 */
        await db
          .update(contentTranslations)
          .set({
            status: "failed",
            error_message: errorMessage,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(contentTranslations.content_id, contentId),
              eq(contentTranslations.target_lang, target_lang),
            ),
          );

        await s.write(
          `[ERROR]${JSON.stringify({
            code: isRateLimit ? "RATE_LIMIT" : "SERVER_ERROR",
            message: errorMessage,
          })}`,
        );
      }
    });
  },
);

export default translationsRoute;
