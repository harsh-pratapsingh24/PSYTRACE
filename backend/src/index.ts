import dotenv from "dotenv";
// Load environment variables immediately
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { serve } from "inngest/express";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import moodRouter from "./routes/mood";
import activityRouter from "./routes/activity";
import { connectDB } from "./utils/db";
import { inngest } from "./inngest/client";
import { functions as inngestFunctions } from "./inngest/functions";

// Create Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(morgan("dev")); // HTTP request logger

// Set up Inngest endpoint
app.use(
  "/api/inngest",
  serve({ client: inngest, functions: inngestFunctions }),
);
// OnaF6EGHhgYY9OPv

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.use("/auth", authRouter);
app.use("/chat", chatRouter);
app.use("/api/mood", moodRouter);
app.use("/api/activity", activityRouter);

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectDB();

    const preferredPort = Number(process.env.PORT) || 3001;
    const maxAttempts = 30;

    const listenWithFallback = (port: number, attemptsLeft: number): void => {
      const server = http.createServer(app);
      server.listen(port, () => {
        logger.info(`Server is running on port ${port}`);
        if (port !== preferredPort) {
          logger.warn(
            `Port ${preferredPort} was already in use; bound to ${port} instead. Update frontend BACKEND_API_URL to http://localhost:${port} or free port ${preferredPort}.`,
          );
        }
        logger.info(
          `Inngest endpoint available at http://localhost:${port}/api/inngest`,
        );
      });
      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
          listenWithFallback(port + 1, attemptsLeft - 1);
        } else {
          logger.error("Failed to bind server:", err);
          process.exit(1);
        }
      });
    };

    listenWithFallback(preferredPort, maxAttempts);
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
