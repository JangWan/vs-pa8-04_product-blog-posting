// 사용자별 Toss customerKey 영구 관리 (BR-35-e)
// UUID v4 한 번 발급 후 모든 결제에서 재사용
// customerKey = orderId 또는 email 사용 금지 (Toss 정책 위반)

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getOrCreatePaymentCustomerKey(userId: string): Promise<string> {
  const [user] = await db.select({ key: users.payment_customer_key })
    .from(users).where(eq(users.id, userId));

  if (user?.key) return user.key;

  const key = crypto.randomUUID();
  await db.update(users).set({ payment_customer_key: key }).where(eq(users.id, userId));
  return key;
}
