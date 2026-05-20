import { NextRequest } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, organizations, organizationMembers, guidelines, contents } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * 일회성 부트스트랩 엔드포인트.
 * 기존 users에 대해 Personal Org를 생성하고
 * guidelines·contents의 organization_id를 백필한다.
 * 운영 환경에서 1회 실행 후 이 파일을 삭제(또는 비활성화)한다.
 *
 * 호출: POST /api/admin/bootstrap-orgs
 * 헤더: x-bootstrap-secret: <BOOTSTRAP_SECRET env>
 */
export async function POST(req: NextRequest) {
  // 간단한 시크릿 보호 (운영 환경 오남용 방지)
  const secret = req.headers.get("x-bootstrap-secret");
  const expectedSecret = process.env.BOOTSTRAP_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const allUsers = await db.select().from(users);
  const client = await clerkClient();
  const results: Array<{ userId: string; email: string; status: string }> = [];

  for (const user of allUsers) {
    try {
      // 이미 Personal Org가 있으면 백필만 수행
      const existingOrg = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.owner_user_id, user.id),
          eq(organizations.is_default, true),
          isNull(organizations.deleted_at)
        ),
      });

      let personalOrgId: string;

      if (existingOrg) {
        personalOrgId = existingOrg.id;
      } else {
        // Clerk Organization 생성 (슬러그 충돌 시 suffix 추가 재시도)
        const orgName = `${user.email.split("@")[0]}'s Workspace`;
        const baseSlug = `personal-${crypto.randomUUID().slice(0, 8)}`;

        let clerkOrg;
        for (let attempt = 0; attempt < 3; attempt++) {
          const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
          try {
            clerkOrg = await client.organizations.createOrganization({
              name: orgName,
              slug,
              createdBy: user.clerk_user_id,
              privateMetadata: { is_personal: true },
            });
            break;
          } catch {
            if (attempt === 2) throw new Error("Clerk org creation failed after retries");
          }
        }
        if (!clerkOrg) throw new Error("Clerk org creation failed");
        const slug = clerkOrg.slug ?? baseSlug;

        personalOrgId = crypto.randomUUID();

        await db.batch([
          db
            .insert(organizations)
            .values({
              id: personalOrgId,
              clerk_org_id: clerkOrg.id,
              name: orgName,
              slug,
              owner_user_id: user.id,
              is_default: true,
            })
            .onConflictDoNothing(),
          db
            .insert(organizationMembers)
            .values({
              id: crypto.randomUUID(),
              organization_id: personalOrgId,
              user_id: user.id,
              role: "admin",
              invited_by: null,
            })
            .onConflictDoNothing(),
          db
            .update(users)
            .set({ default_organization_id: personalOrgId })
            .where(eq(users.id, user.id)),
        ]);
      }

      // guidelines 백필 (organization_id가 null인 이 사용자 것)
      await db
        .update(guidelines)
        .set({ organization_id: personalOrgId, created_by: user.id })
        .where(and(eq(guidelines.user_id, user.id), isNull(guidelines.organization_id)));

      // contents 백필 (organization_id가 null인 이 사용자 것)
      await db
        .update(contents)
        .set({ organization_id: personalOrgId })
        .where(and(eq(contents.user_id, user.id), isNull(contents.organization_id)));

      results.push({ userId: user.id, email: user.email, status: "ok" });
    } catch (err) {
      results.push({
        userId: user.id,
        email: user.email,
        status: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return Response.json({ bootstrapped: results.length, results });
}
