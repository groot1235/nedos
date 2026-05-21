import { getAuth, verifyToken } from "@clerk/express";

export const protectRoute = async (req, res, next) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;

    if (userId) {
      // ✅ Clerk middleware already verified the token — proceed
      return next();
    }

    // ❌ Clerk middleware did not extract userId — try manual verification as fallback
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized - no token provided" });
    }

    const token = authHeader.substring(7);

    try {
      // Attempt manual token verification via Clerk
      const verifiedToken = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
        publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
        clockSkewInMs: 120000,
      });
      if (verifiedToken?.sub) {
        // Attach userId manually to req so downstream controllers can use getAuth(req)
        req.auth = { userId: verifiedToken.sub };
        return next();
      }
    } catch (verifyErr) {
      console.warn("[protectRoute] Manual token verification failed:", verifyErr?.message || verifyErr);
    }

    // Both methods failed
    return res.status(401).json({
      message: "Unauthorized - you must be logged in",
      debug: {
        hasAuth: !!auth,
        userId: null,
        hasTokenInHeader: !!authHeader,
        tokenLength: authHeader.length,
        keysLoaded: {
          publishableKey: !!process.env.CLERK_PUBLISHABLE_KEY,
          secretKey: !!process.env.CLERK_SECRET_KEY,
        },
      },
    });
  } catch (err) {
    console.error("[protectRoute] Unexpected error:", err);
    return res.status(500).json({ message: "Internal server error during auth" });
  }
};