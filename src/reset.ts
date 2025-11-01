// Load environment variables from .env file
import "dotenv/config";

// Set SSL certificate verification before any imports
// This is needed when connecting to ChromaDB instances with self-signed certificates
if (process.env.DISABLE_SSL_VERIFICATION === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { getChromaClient } from "./lib/chroma.js";

async function deleteCollection(collectionName: string) {
  try {
    if (!collectionName) {
      console.error("✗ Error: Collection name is required");
      console.log("\nUsage: npm run reset <collection-name>");
      console.log("Example: npm run reset my-collection");
      process.exit(1);
    }

    const client = getChromaClient();

    console.log(`Deleting collection '${collectionName}'...`);
    await client.deleteCollection({
      name: collectionName,
    } as any);

    console.log(`✓ Collection '${collectionName}' deleted successfully.`);
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      console.error(`✗ Collection '${collectionName}' not found.`);
    } else {
      console.error("✗ Error deleting collection:", error.message);
    }
    process.exit(1);
  }
}

// Get collection name from command line arguments
const collectionName = process.argv[2];
deleteCollection(collectionName);
