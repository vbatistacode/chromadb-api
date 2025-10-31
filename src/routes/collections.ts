import { Hono } from "hono";
import { getChromaClient, createEmbeddingFunction } from "../lib/chroma.js";
import { getCollectionOrError } from "../lib/collections.js";

const collections = new Hono();

// Create collection
collections.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { name } = body;

    if (!name) {
      return c.json({ error: "Collection name is required" }, 400);
    }

    const client = getChromaClient();
    const embeddingFunction = createEmbeddingFunction();
    if (!embeddingFunction) {
      return c.json({ error: "Failed to create embedding function" }, 500);
    }

    const collection = await client.createCollection({
      name,
      embeddingFunction,
    });

    return c.json(
      {
        name: collection.name,
        message: "Collection created",
      },
      201
    );
  } catch (error: any) {
    return c.json(
      {
        error: "Failed to create collection",
        details: error.message,
      },
      500
    );
  }
});

// List collections
collections.get("/", async (c) => {
  try {
    const client = getChromaClient();
    const allCollections = await client.listCollections();
    return c.json({
      collections: allCollections.map((collection) => ({
        name: collection.name,
      })),
    });
  } catch (error: any) {
    return c.json(
      {
        error: "Failed to list collections",
        details: error.message,
      },
      500
    );
  }
});

// Get collection details
collections.get("/:name", async (c) => {
  try {
    const { name } = c.req.param();
    const collection = await getCollectionOrError(name);

    // Get count by fetching all IDs (this is a workaround)
    const allDocs = await collection.get();
    const count = allDocs.ids?.length || 0;

    return c.json({
      name: collection.name,
      count,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to get collection",
        details: error.message,
      },
      500
    );
  }
});

// Delete collection
collections.delete("/:name", async (c) => {
  try {
    const { name } = c.req.param();
    const client = getChromaClient();

    await client.deleteCollection({
      name,
    } as any);

    return c.json({
      message: `Collection ${name} deleted`,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: "Collection not found" }, 404);
    }
    return c.json(
      {
        error: "Failed to delete collection",
        details: error.message,
      },
      500
    );
  }
});

export default collections;
