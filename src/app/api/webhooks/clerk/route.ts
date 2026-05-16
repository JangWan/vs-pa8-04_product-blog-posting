import { Webhook } from "svix";
import { headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";

type UserCreatedEvent = {
  type: "user.created";
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
  };
};

type WebhookEvent = UserCreatedEvent | { type: string; data: unknown };

export async function POST(req: Request) {
  const headersList = await headers();
  const svix_id = headersList.get("svix-id");
  const svix_timestamp = headersList.get("svix-timestamp");
  const svix_signature = headersList.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json(
      { error: "CLERK_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const wh = new Webhook(webhookSecret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return Response.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  if (evt.type === "user.created") {
    const { id: clerk_user_id, email_addresses, primary_email_address_id } =
      evt.data as UserCreatedEvent["data"];

    const primaryEmail = email_addresses.find(
      (e) => e.id === primary_email_address_id
    );
    const email = primaryEmail?.email_address ?? email_addresses[0]?.email_address;

    if (!email) {
      return Response.json({ error: "No email found" }, { status: 400 });
    }

    await db.insert(users).values({
      id: crypto.randomUUID(),
      clerk_user_id,
      email,
      plan: "free",
    });
  }

  return Response.json({ ok: true });
}
