import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getCollectionOrError } from "../lib/collections.js";

const documents = new Hono();

// Validate and sanitize metadata to ensure all values are valid ChromaDB types
// ChromaDB metadata values must be: string, number, boolean, null, or undefined
function sanitizeMetadata(metadata: any): Record<string, any> | undefined {
  if (metadata === null || metadata === undefined) {
    return undefined;
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Skip null values
    if (value === null) {
      sanitized[key] = null;
      continue;
    }

    // ChromaDB accepts: string, number, boolean, null
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
      continue;
    }

    // Convert arrays and objects to JSON strings
    if (Array.isArray(value) || typeof value === "object") {
      try {
        sanitized[key] = JSON.stringify(value);
      } catch (e) {
        // Skip invalid values that can't be stringified
        continue;
      }
      continue;
    }

    // Skip other types (functions, symbols, etc.)
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

// List documents from collection
documents.get("/:name/documents", async (c) => {
  try {
    const { name } = c.req.param();
    const collection = await getCollectionOrError(name);

    // Get optional query parameters for filtering
    const ids = c.req.query("ids")?.split(",");
    const limit = c.req.query("limit")
      ? parseInt(c.req.query("limit")!)
      : undefined;
    const offset = c.req.query("offset")
      ? parseInt(c.req.query("offset")!)
      : undefined;
    const where = c.req.query("where")
      ? JSON.parse(c.req.query("where")!)
      : undefined;

    const result = await collection.get({
      ids: ids,
      limit: limit,
      offset: offset,
      where: where,
    });

    return c.json({
      documents: result.documents || [],
      ids: result.ids || [],
      metadatas: result.metadatas || [],
      count: result.ids?.length || 0,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to get documents",
        details: error.message,
      },
      500
    );
  }
});

// Get single document
documents.get("/:name/documents/:id", async (c) => {
  try {
    const { name, id } = c.req.param();
    const collection = await getCollectionOrError(name);

    const result = await collection.get({
      ids: [id],
    });

    if (!result.ids || result.ids.length === 0) {
      return c.json({ error: "Document not found" }, 404);
    }

    return c.json({
      id: result.ids[0],
      document: result.documents?.[0],
      metadata: result.metadatas?.[0],
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to get document",
        details: error.message,
      },
      500
    );
  }
});

// Upsert (insert or update) document

documents.post("/:name/documents", async (c) => {
  try {
    const { name } = c.req.param();
    const body = await c.req.json();

    // Validate that 'documents' is present and is array of strings
    if (
      !body ||
      !Array.isArray(body.documents) ||
      (body.metadatas !== undefined && !Array.isArray(body.metadatas)) ||
      (body.ids !== undefined && !Array.isArray(body.ids))
    ) {
      return c.json(
        {
          error:
            "Invalid body format. Expected { documents: string[], ids?: (string | null)[], metadatas?: object[] }",
        },
        400
      );
    }

    const { documents, ids: inputIds = undefined, metadatas } = body;

    // Documents must all be strings
    for (const doc of documents) {
      if (typeof doc !== "string") {
        return c.json(
          { error: "All elements in 'documents' must be strings" },
          400
        );
      }
    }

    // Validate array lengths - ids can be shorter or same length, but not longer
    if (
      (inputIds && inputIds.length > documents.length) ||
      (metadatas && metadatas.length !== documents.length)
    ) {
      return c.json(
        {
          error:
            "`ids` (if provided) must not be longer than `documents`, and `metadatas` (if provided) must have the same length as `documents`",
        },
        400
      );
    }

    const collection = await getCollectionOrError(name);

    // Process each record individually
    const finalIds: string[] = [];
    const finalDocuments: string[] = [];
    const finalMetadatas: (Record<string, any> | undefined)[] = [];
    const results: Array<{ id: string; status: string }> = [];

    // Get all provided IDs that are not null/undefined/empty to check what exists
    const providedIds: string[] = [];
    if (inputIds) {
      for (const id of inputIds) {
        if (
          id !== null &&
          id !== undefined &&
          typeof id === "string" &&
          id !== ""
        ) {
          providedIds.push(id);
        }
      }
    }

    // Check which IDs already exist
    let existing: any = { ids: [] };
    if (providedIds.length > 0) {
      try {
        existing = await collection.get({ ids: providedIds });
      } catch (e) {
        existing = { ids: [] };
      }
    }

    const existingIdsSet = new Set(existing.ids || []);

    // Process each document individually
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const inputId = inputIds && i < inputIds.length ? inputIds[i] : undefined;
      const rawMetadata =
        metadatas && i < metadatas.length ? metadatas[i] : undefined;

      // Sanitize input metadata
      const metadata = sanitizeMetadata(rawMetadata);

      let finalId: string;
      let status: string;

      // Determine ID for this record
      if (
        inputId !== null &&
        inputId !== undefined &&
        typeof inputId === "string" &&
        inputId !== ""
      ) {
        // ID was provided (non-empty string)
        finalId = inputId;

        // Check if this ID exists
        if (existingIdsSet.has(finalId)) {
          status = "updated";

          // For updates, merge metadata if applicable
          if (metadata !== undefined && existing.metadatas) {
            const idxInExisting = existing.ids.indexOf(finalId);
            if (idxInExisting >= 0 && existing.metadatas[idxInExisting]) {
              // Sanitize existing metadata before merging
              const existingMeta = sanitizeMetadata(
                existing.metadatas[idxInExisting]
              );
              // Merge: existing first, then new metadata overwrites
              finalMetadatas.push({
                ...existingMeta,
                ...metadata,
              });
            } else {
              finalMetadatas.push(metadata);
            }
          } else if (metadata === undefined && existing.metadatas) {
            const idxInExisting = existing.ids.indexOf(finalId);
            if (idxInExisting >= 0 && existing.metadatas[idxInExisting]) {
              // Sanitize existing metadata
              const existingMeta = sanitizeMetadata(
                existing.metadatas[idxInExisting]
              );
              finalMetadatas.push(existingMeta);
            } else {
              finalMetadatas.push(undefined);
            }
          } else {
            finalMetadatas.push(metadata);
          }
        } else {
          // ID provided but doesn't exist - create new with this ID
          status = "inserted";
          finalMetadatas.push(metadata);
        }
      } else {
        // No ID provided - generate UUID and create new
        finalId = randomUUID();
        status = "inserted";
        finalMetadatas.push(metadata);
      }

      finalIds.push(finalId);
      finalDocuments.push(doc);
      results.push({ id: finalId, status });
    }

    // Prepare upsert data
    const upsertData: any = {
      ids: finalIds,
      documents: finalDocuments,
    };

    // Only include metadatas if at least one element is not undefined
    if (finalMetadatas.some((m) => m !== undefined)) {
      upsertData.metadatas = finalMetadatas;
    }

    // Perform upsert
    await collection.upsert(upsertData);

    return c.json({
      message: "Batch upsert completed",
      results: results,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to upsert documents",
        details: error.message,
      },
      500
    );
  }
});

// Delete document
documents.delete("/:name/documents/:id", async (c) => {
  try {
    const { name, id } = c.req.param();
    const collection = await getCollectionOrError(name);

    await collection.delete({
      ids: [id],
    });

    return c.json({
      message: `Document ${id} deleted successfully`,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to delete document",
        details: error.message,
      },
      500
    );
  }
});

export default documents;
