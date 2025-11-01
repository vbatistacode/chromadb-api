// Load environment variables from .env file
import "dotenv/config";

// Set SSL certificate verification before any imports
// This is needed when connecting to ChromaDB instances with self-signed certificates
if (process.env.DISABLE_SSL_VERIFICATION === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { getChromaClient } from "./lib/chroma.js";

async function resetDatabase() {
  try {
    // ChromaDB requires ALLOW_RESET environment variable to be set to TRUE
    // to enable the reset functionality
    process.env.ALLOW_RESET = "TRUE";

    const client = getChromaClient();

    console.log("Resetting ChromaDB database...");
    await client.reset();

    console.log("✓ ChromaDB database has been reset successfully.");
  } catch (error: any) {
    console.error("✗ Error resetting ChromaDB:", error.message);
    if (error.message?.includes("ALLOW_RESET")) {
      console.error(
        "Note: ChromaDB requires ALLOW_RESET=TRUE environment variable to enable reset."
      );
    }
    process.exit(1);
  }
}

resetDatabase();
