import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import userRoutes from "./routes/userRoutes.js";
import articleRoutes from "./routes/articleRoutes.js";
import generateRoutes from "./routes/generateRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import { requireClerkUser } from "./middleware/clerkAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localEnvPath = path.join(__dirname, ".env.local");
const defaultEnvPath = path.join(__dirname, ".env");

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

if (fs.existsSync(defaultEnvPath)) {
  dotenv.config({ path: defaultEnvPath, override: false });
}

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed."));
    },
    credentials: true
  })
);
app.use("/api/webhook/clerk", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/webhook", webhookRoutes);
app.use("/api/user", requireClerkUser, userRoutes);
app.use("/api/articles", requireClerkUser, articleRoutes);
app.use("/api", requireClerkUser, generateRoutes);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
