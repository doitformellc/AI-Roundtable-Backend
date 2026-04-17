import { verifyToken } from "@clerk/backend";
import { findUserByClerkId, syncClerkUser } from "../services/roundtableService.js";

function getBearerToken(headerValue = "") {
  if (!headerValue.startsWith("Bearer ")) {
    return null;
  }

  return headerValue.slice("Bearer ".length).trim();
}

export async function requireClerkUser(req, res, next) {
  if (process.env.BYPASS_AUTH === "true") {
    const bypassClerkId = process.env.BYPASS_CLERK_ID || "dev-bypass-user";
    let user = findUserByClerkId(bypassClerkId);

    if (!user) {
      user = syncClerkUser({
        clerkId: bypassClerkId,
        email: process.env.BYPASS_EMAIL || "dev@roundtable.local",
        firstName: "Dev",
        lastName: "Bypass"
      });
    }

    req.auth = { sub: bypassClerkId, bypass: true };
    req.user = user;
    return next();
  }

  try {
    const token = getBearerToken(req.header("authorization"));
    if (!token) {
      return res.status(401).json({ error: "Missing Clerk session token." });
    }

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    const clerkUserId = payload.sub;
    if (!clerkUserId) {
      return res.status(401).json({ error: "Invalid Clerk token." });
    }

    let user = findUserByClerkId(clerkUserId);

    if (!user) {
      user = syncClerkUser({
        clerkId: clerkUserId,
        email: req.header("x-clerk-email") || payload.email || "",
        firstName: req.header("x-clerk-first-name") || "",
        lastName: req.header("x-clerk-last-name") || ""
      });
    }

    req.auth = payload;
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized Clerk session." });
  }
}
