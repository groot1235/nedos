import { getAuth } from "@clerk/express";

/**
 * Gets the userId from either:
 * 1. clerkMiddleware() — sets req.auth automatically on success
 * 2. Our fallback in protectRoute — sets req.auth = { userId } manually
 *
 * This makes all controllers work regardless of which path authenticated the request.
 */
export const getClerkUserId = (req) => {
  const auth = getAuth(req);
  return auth?.userId || req.auth?.userId || null;
};
