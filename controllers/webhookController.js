import { Webhook } from "svix";
import {
  deleteClerkUser,
  syncClerkUser
} from "../services/roundtableService.js";

function getHeader(req, name) {
  return req.headers[name] || req.headers[name.toLowerCase()];
}

export function handleClerkWebhook(req, res) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Missing Clerk webhook secret." });
  }

  const svixId = getHeader(req, "svix-id");
  const svixTimestamp = getHeader(req, "svix-timestamp");
  const svixSignature = getHeader(req, "svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: "Missing Svix headers." });
  }

  try {
    const payload = req.body.toString("utf8");
    const wh = new Webhook(secret);
    const event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature
    });

    if (event.type === "user.created" || event.type === "user.updated") {
      const primaryEmail =
        event.data.email_addresses?.find(
          (entry) => entry.id === event.data.primary_email_address_id
        )?.email_address || event.data.email_addresses?.[0]?.email_address || "";

      const user = syncClerkUser({
        clerkId: event.data.id,
        email: primaryEmail,
        firstName: event.data.first_name || "",
        lastName: event.data.last_name || ""
      });

      return res.status(200).json({ status: "synced", user });
    }

    if (event.type === "user.deleted") {
      deleteClerkUser(event.data.id);
      return res.status(200).json({ status: "deleted" });
    }

    return res.status(200).json({ status: "ignored" });
  } catch (error) {
    return res.status(400).json({ error: "Invalid Clerk webhook payload." });
  }
}
