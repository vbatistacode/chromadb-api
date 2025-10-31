import { Hono } from "hono";
import { getCollectionOrError } from "../lib/collections";

const query = new Hono();

// Query collection
query.post("/:name/query", async (c) => {
  try {
    const { name } = c.req.param();
    const body = await c.req.json();
    const { queryTexts, nResults = 10, where, include } = body;

    if (!queryTexts || !Array.isArray(queryTexts) || queryTexts.length === 0) {
      return c.json({ error: "queryTexts array is required" }, 400);
    }

    const collection = await getCollectionOrError(name);

    // Build query options - ChromaDB will handle embeddings automatically
    const queryOptions: any = {
      queryTexts: queryTexts,
      nResults: nResults,
    };

    if (where) {
      queryOptions.where = where;
    }

    if (include) {
      queryOptions.include = include;
    } else {
      // Default: include documents, metadatas, distances
      queryOptions.include = ["documents", "metadatas", "distances"];
    }

    const results = await collection.query(queryOptions);

    return c.json({
      results: results.documents || [],
      ids: results.ids || [],
      metadatas: results.metadatas || [],
      distances: results.distances || [],
      queryTexts: queryTexts,
      count: results.ids?.length || 0,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to query collection",
        details: error.message,
      },
      500
    );
  }
});

export default query;
