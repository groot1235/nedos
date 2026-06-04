import dns from "dns";
import mongoose from "mongoose";
import { ENV } from "./env.js";
import { seedZones } from "../utils/seedZones.js";

export const connectDB = async () => {
  const fallbackDns = (process.env.DNS_SERVERS ?? "8.8.8.8,1.1.1.1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  dns.setServers(fallbackDns);

  const mongoUri = ENV.MONGO_URI;

  if (!mongoUri) {
    console.error("MONGO_URI is not set in environment variables");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB SUCCESSFULLY ✅");
    await seedZones();
  } catch (error) {
    console.log("Error connecting to MONGODB:", error.message);
    process.exit(1);
  }
};
