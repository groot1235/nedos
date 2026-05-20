import dns from "dns";
import mongoose from "mongoose";
import { ENV } from "./env.js";

const DEBUG_LOG_PATH = "debug-7d6fcb.log";
const debugLog = (payload) => {
    // #region agent log
    fetch("http://127.0.0.1:7262/ingest/99be42d7-dad6-48ea-8170-4c02d08618e5", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7d6fcb" },
        body: JSON.stringify({ sessionId: "7d6fcb", timestamp: Date.now(), ...payload }),
    }).catch(() => {});
    import("node:fs").then(({ appendFileSync }) => {
        try {
            appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify({ sessionId: "7d6fcb", timestamp: Date.now(), ...payload })}\n`);
        } catch (_) {}
    }).catch(() => {});
    // #endregion
};

export const connectDB = async () => {
    const fallbackDns = (process.env.DNS_SERVERS ?? "8.8.8.8,1.1.1.1")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    dns.setServers(fallbackDns);

    const mongoUri = ENV.MONGO_URI;
    const uriScheme = mongoUri?.startsWith("mongodb+srv://")
        ? "mongodb+srv"
        : mongoUri?.startsWith("mongodb://")
          ? "mongodb"
          : "missing_or_invalid";

    // #region agent log
    debugLog({
        hypothesisId: "B",
        location: "db.js:connectDB:entry",
        message: "MONGO_URI presence and scheme",
        data: { hasMongoUri: Boolean(mongoUri), uriScheme, uriLength: mongoUri?.length ?? 0 },
    });
    // #endregion

    let defaultDnsSrvError = null;
    try {
        const { resolveSrv } = await import("dns/promises");
        const srv = await resolveSrv("_mongodb._tcp.cluster0.ntpvnhe.mongodb.net");
        // #region agent log
        debugLog({
            runId: "post-fix",
            hypothesisId: "A",
            location: "db.js:connectDB:dns-after-setServers",
            message: "DNS SRV lookup succeeded after setServers",
            data: { recordCount: srv.length, dnsServers: dns.getServers() },
        });
        // #endregion
    } catch (err) {
        defaultDnsSrvError = err?.code ?? err?.message;
        // #region agent log
        debugLog({
            runId: "post-fix",
            hypothesisId: "A",
            location: "db.js:connectDB:dns-after-setServers",
            message: "DNS SRV lookup failed after setServers",
            data: { errorCode: err?.code, errorMessage: err?.message, dnsServers: dns.getServers() },
        });
        // #endregion
    }

    try {
        await mongoose.connect(mongoUri);
        // #region agent log
        debugLog({
            hypothesisId: "E",
            location: "db.js:connectDB:mongoose",
            message: "mongoose.connect succeeded",
            data: { readyState: mongoose.connection.readyState },
        });
        // #endregion
        console.log("Connected to DB SUCCESSFULLY ✅");
    } catch (error) {
        // #region agent log
        debugLog({
            hypothesisId: "A",
            location: "db.js:connectDB:mongoose",
            message: "mongoose.connect failed",
            data: {
                errorCode: error?.code,
                errorMessage: error?.message,
                defaultDnsSrvError,
            },
        });
        // #endregion
        console.log("Error connecting to MONGODB:", error.message);
        process.exit(1);
    }
};