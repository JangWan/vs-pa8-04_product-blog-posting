import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { contentVersions, contents, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

type Vars = { userId: string; dbUserId: string };

const contentsRoute = new Hono<{ Variables: Vars }>();

/* 소유권 검증: URL의 :id 콘텐츠가 현재 사용자의 것인지 확인.
   타인 콘텐츠는 ID 노출 방지를 위해 403 대신 404로 응답 (BR-04 + UC §5-1). */
const requireContentOwner = createMiddleware<{ Variables: Vars }>(
  async (c, next) => {
    const clerkUserId = c.get("userId");
    const contentId = c.req.param("id");
    if (!contentId) return c.json({ error: "Not found" }, 404);

    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerk_user_id, clerkUserId),
    });
    if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

    const owns = await db
      .select({ id: contents.id })
      .from(contents)
      .where(
        and(eq(contents.id, contentId), eq(contents.user_id, dbUser.id)),
      )
      .limit(1);
    if (owns.length === 0) return c.json({ error: "Not found" }, 404);

    c.set("dbUserId", dbUser.id);
    await next();
  },
);

const MAX_BODY_BYTES = 100 * 1024; // BR-20: 100KB

type VersionListRow = {
  version_no: number;
  created_at: Date | string;
  char_count: number;
  char_diff: number | null;
  is_current: boolean;
};

/* GET /api/contents/:id/versions?limit=30&cursor=<last_version_no>
   - 정렬: version_no DESC
   - char_diff: 직전(더 낮은) version_no 대비 ± 글자 수 (가장 오래된 버전은 null)
   - is_current: 해당 스냅샷 본문이 현재 contents.body와 동일한지 */
contentsRoute.get("/:id/versions", requireAuth, requireContentOwner, async (c) => {
  const contentId = c.req.param("id");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "30") || 30, 100);
  const cursorRaw = c.req.query("cursor");
  const cursor = cursorRaw ? parseInt(cursorRaw) : null;

  /* CTE에서 LAG로 전체 데이터에 대한 char_diff를 먼저 계산한 뒤
     커서/LIMIT를 적용 — 페이지 경계에서도 char_diff가 정확함. */
  const cursorFilter = cursor !== null
    ? sql`WHERE version_no < ${cursor}`
    : sql``;

  const result = await db.execute(sql`
    WITH all_versions AS (
      SELECT
        cv.version_no,
        cv.created_at,
        length(cv.snapshot_body) AS char_count,
        length(cv.snapshot_body) - LAG(length(cv.snapshot_body))
          OVER (ORDER BY cv.version_no) AS char_diff,
        cv.snapshot_body
      FROM content_versions cv
      WHERE cv.content_id = ${contentId}
    )
    SELECT
      version_no,
      created_at,
      char_count::int AS char_count,
      char_diff::int AS char_diff,
      (snapshot_body = (SELECT body FROM contents WHERE id = ${contentId})) AS is_current
    FROM all_versions
    ${cursorFilter}
    ORDER BY version_no DESC
    LIMIT ${limit + 1}
  `);

  const rawRows = (result as unknown as { rows?: VersionListRow[] }).rows
    ?? (result as unknown as VersionListRow[]);
  const rows: VersionListRow[] = Array.isArray(rawRows) ? rawRows : [];

  const hasMore = rows.length > limit;
  const data = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    version_no: Number(r.version_no),
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    is_current: Boolean(r.is_current),
    char_count: Number(r.char_count),
    char_diff: r.char_diff === null ? null : Number(r.char_diff),
  }));
  const next_cursor = hasMore ? data[data.length - 1].version_no : null;

  return c.json({ data, next_cursor });
});

/* POST /api/contents/:id/versions — 수동 스냅샷 (UC-17)
   - BR-20: 본문 100KB 초과 시 400
   - UC §5-3: 직전 버전과 본문 동일 시 409 */
contentsRoute.post("/:id/versions", requireAuth, requireContentOwner, async (c) => {
  const contentId = c.req.param("id");

  const current = await db.query.contents.findFirst({
    where: eq(contents.id, contentId),
  });
  if (!current) return c.json({ error: "Not found" }, 404);

  const bodyBytes = Buffer.byteLength(current.body, "utf8");
  if (bodyBytes > MAX_BODY_BYTES) {
    return c.json(
      {
        error: "Body too large",
        message: "본문이 너무 깁니다. 100KB(약 5만자) 이하로 분할해주세요.",
      },
      400,
    );
  }

  const latest = await db
    .select({
      version_no: contentVersions.version_no,
      snapshot_body: contentVersions.snapshot_body,
    })
    .from(contentVersions)
    .where(eq(contentVersions.content_id, contentId))
    .orderBy(sql`${contentVersions.version_no} DESC`)
    .limit(1);

  if (latest.length > 0 && latest[0].snapshot_body === current.body) {
    return c.json(
      {
        error: "Duplicate snapshot",
        message: "이미 동일한 본문으로 저장된 버전이 있습니다.",
      },
      409,
    );
  }

  const nextNo = (latest[0]?.version_no ?? 0) + 1;

  const [created] = await db
    .insert(contentVersions)
    .values({
      id: crypto.randomUUID(),
      content_id: contentId,
      version_no: nextNo,
      snapshot_body: current.body,
      snapshot_seo_meta: current.seo_meta,
    })
    .returning({
      version_no: contentVersions.version_no,
      created_at: contentVersions.created_at,
    });

  return c.json(
    {
      version_no: created.version_no,
      created_at: created.created_at.toISOString(),
    },
    201,
  );
});

/* GET /api/contents/:id/versions/diff?from=A&to=B — 두 버전 비교 (UC-19)
   :no 라우트보다 먼저 등록해야 매칭 충돌이 없음. */
contentsRoute.get(
  "/:id/versions/diff",
  requireAuth,
  requireContentOwner,
  async (c) => {
    const contentId = c.req.param("id");
    const fromRaw = c.req.query("from");
    const toRaw = c.req.query("to");
    const from = fromRaw ? parseInt(fromRaw) : NaN;
    const to = toRaw ? parseInt(toRaw) : NaN;

    if (!fromRaw || !toRaw || Number.isNaN(from) || Number.isNaN(to)) {
      return c.json(
        {
          error: "Missing version",
          message: "비교할 두 버전을 모두 선택해주세요.",
        },
        400,
      );
    }
    if (from === to) {
      return c.json(
        {
          error: "Same version",
          message: "동일한 버전끼리는 비교할 수 없습니다.",
        },
        400,
      );
    }

    const rows = await db
      .select({
        version_no: contentVersions.version_no,
        snapshot_body: contentVersions.snapshot_body,
        snapshot_seo_meta: contentVersions.snapshot_seo_meta,
        created_at: contentVersions.created_at,
      })
      .from(contentVersions)
      .where(
        and(
          eq(contentVersions.content_id, contentId),
          sql`${contentVersions.version_no} IN (${from}, ${to})`,
        ),
      );

    const fromRow = rows.find((r) => r.version_no === from);
    const toRow = rows.find((r) => r.version_no === to);
    if (!fromRow || !toRow) {
      return c.json({ error: "Version not found" }, 404);
    }

    return c.json({
      from: {
        version_no: fromRow.version_no,
        body: fromRow.snapshot_body,
        seo_meta: fromRow.snapshot_seo_meta,
        created_at: fromRow.created_at.toISOString(),
      },
      to: {
        version_no: toRow.version_no,
        body: toRow.snapshot_body,
        seo_meta: toRow.snapshot_seo_meta,
        created_at: toRow.created_at.toISOString(),
      },
    });
  },
);

/* GET /api/contents/:id/versions/:no — 버전 단건 (UC-16 미리보기) */
contentsRoute.get(
  "/:id/versions/:no",
  requireAuth,
  requireContentOwner,
  async (c) => {
    const contentId = c.req.param("id");
    const versionNo = parseInt(c.req.param("no"));
    if (Number.isNaN(versionNo)) return c.json({ error: "Invalid version" }, 400);

    const row = await db.query.contentVersions.findFirst({
      where: and(
        eq(contentVersions.content_id, contentId),
        eq(contentVersions.version_no, versionNo),
      ),
    });
    if (!row) return c.json({ error: "Not found" }, 404);

    return c.json({
      version_no: row.version_no,
      snapshot_body: row.snapshot_body,
      snapshot_seo_meta: row.snapshot_seo_meta,
      created_at: row.created_at.toISOString(),
    });
  },
);

/* POST /api/contents/:id/versions/:no/restore — 버전 복원 (UC-18, BR-19) */
contentsRoute.post(
  "/:id/versions/:no/restore",
  requireAuth,
  requireContentOwner,
  async (c) => {
    const contentId = c.req.param("id");
    const versionNo = parseInt(c.req.param("no"));
    if (Number.isNaN(versionNo)) return c.json({ error: "Invalid version" }, 400);

    const target = await db.query.contentVersions.findFirst({
      where: and(
        eq(contentVersions.content_id, contentId),
        eq(contentVersions.version_no, versionNo),
      ),
    });
    if (!target) return c.json({ error: "Not found" }, 404);

    const current = await db.query.contents.findFirst({
      where: eq(contents.id, contentId),
    });
    if (!current) return c.json({ error: "Not found" }, 404);

    /* UC §5-4: 대상 버전이 이미 현재 본문이면 409 */
    if (current.body === target.snapshot_body) {
      return c.json(
        {
          error: "Already current",
          message: "이미 해당 버전 상태입니다.",
        },
        409,
      );
    }

    /* BR-20: 안전장치 스냅샷도 100KB 제한 적용 */
    const currentBytes = Buffer.byteLength(current.body, "utf8");
    if (currentBytes > MAX_BODY_BYTES) {
      return c.json(
        {
          error: "Body too large",
          message: "현재 본문이 100KB를 초과하여 안전 스냅샷을 생성할 수 없습니다.",
        },
        400,
      );
    }

    /* BR-19: (1) 직전 본문 자동 스냅샷 → (2) 복원
       neon-http는 트랜잭션 미지원이므로 순차 실행.
       (2) 실패 시 안전 스냅샷만 남고 본문은 보존되므로 데이터 무결성은 유지. */
    const latest = await db
      .select({ max: sql<number | null>`max(${contentVersions.version_no})` })
      .from(contentVersions)
      .where(eq(contentVersions.content_id, contentId));
    const safetyNo = (latest[0]?.max ?? 0) + 1;

    await db.insert(contentVersions).values({
      id: crypto.randomUUID(),
      content_id: contentId,
      version_no: safetyNo,
      snapshot_body: current.body,
      snapshot_seo_meta: current.seo_meta,
    });

    const [updated] = await db
      .update(contents)
      .set({
        body: target.snapshot_body,
        seo_meta: target.snapshot_seo_meta,
        updated_at: new Date(),
      })
      .where(eq(contents.id, contentId))
      .returning({ updated_at: contents.updated_at });

    return c.json({
      restored_from_version_no: target.version_no,
      new_current_version_no: safetyNo,
      updated_at: updated.updated_at.toISOString(),
    });
  },
);

export default contentsRoute;
