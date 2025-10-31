// Load environment variables from .env file
import "dotenv/config";

// Set SSL certificate verification before any imports
// This is needed when connecting to ChromaDB instances with self-signed certificates
if (process.env.DISABLE_SSL_VERIFICATION === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth";
import collections from "./routes/collections";
import documents from "./routes/documents";
import query from "./routes/query";
import { getChromaClient } from "./lib/chroma";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Error handling middleware
app.onError((err, c) => {
  console.error("Error:", err);
  return c.json(
    {
      error: "Internal server error",
      details: err.message,
    },
    500
  );
});

// Health check endpoint (no auth required)
app.get("/health", async (c) => {
  try {
    const client = getChromaClient();
    const heartbeat = await client.heartbeat();
    return c.json({ status: "ok", heartbeat });
  } catch (error: any) {
    return c.json(
      {
        status: "error",
        error: error.message,
      },
      500
    );
  }
});

// Apply authentication middleware to all routes except health
app.use("*", async (c, next) => {
  if (c.req.path === "/health") {
    await next();
    return;
  }
  return authMiddleware(c, next);
});

// Register routes
app.route("/collections", collections);
app.route("/collections", documents); // Documents routes: /collections/:name/documents
app.route("/collections", query); // Query routes: /collections/:name/query

// Root endpoint
app.get("/", (c) => {
  return c.json({
    message: "ChromaDB API Server",
    version: "1.0.0",
  });
});

const port = parseInt(process.env.PORT || "3000");

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running on port ${port}`);
