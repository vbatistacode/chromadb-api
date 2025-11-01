import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getCollectionOrError } from "../lib/collections.js";

const documents = new Hono();

// Add documents to collection
documents.post("/:name/documents1", async (c) => {
  try {
    const { name } = c.req.param();
    const body = await c.req.json();
    const { documents: docs, ids, metadatas } = body;

    if (!docs || !Array.isArray(docs) || docs.length === 0) {
      return c.json({ error: "Documents array is required" }, 400);
    }

    const collection = await getCollectionOrError(name);

    // Prepare data for ChromaDB - embeddings will be handled automatically
    const documentData: any = {
      documents: docs,
    };

    if (ids) {
      documentData.ids = ids;
    } else {
      // Generate UUIDs if not provided
      documentData.ids = docs.map(() => randomUUID());
    }

    if (metadatas) {
      documentData.metadatas = metadatas;
    }
    console.log(documentData);
    await collection.add(documentData);

    return c.json(
      {
        message: "Documents added successfully",
        count: docs.length,
        ids: documentData.ids,
      },
      201
    );
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to add documents",
        details: error.message,
      },
      500
    );
  }
});

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

    // Validate input format
    if (
      !body ||
      !Array.isArray(body.ids) ||
      !Array.isArray(body.documents) ||
      (body.metadatas !== undefined && !Array.isArray(body.metadatas))
    ) {
      return c.json(
        {
          error:
            "Invalid body format. Expected { ids: string[], documents: string[], metadatas?: object[] }",
        },
        400
      );
    }

    const { ids, documents, metadatas } = body;

    // Make sure the arrays have matching lengths
    if (
      ids.length !== documents.length ||
      (metadatas && ids.length !== metadatas.length)
    ) {
      return c.json(
        {
          error:
            "`ids`, `documents`, and `metadatas` arrays must have the same length",
        },
        400
      );
    }

    // Documents must all be strings
    for (const doc of documents) {
      if (typeof doc !== "string") {
        return c.json(
          { error: "All elements in 'documents' must be strings" },
          400
        );
      }
    }

    const collection = await getCollectionOrError(name);

    // Merge/update semantics for upsert: for existing docs, merge metadata and fill missing docs if needed
    let finalDocuments = [...documents];
    let finalMetadatas =
      metadatas !== undefined
        ? [...metadatas]
        : Array(ids.length).fill(undefined);

    // Try to get existing docs to support update/merge
    // (Batch GET)
    let existing;
    try {
      existing = await collection.get({ ids });
    } catch (e) {
      existing = {};
    }

    for (let i = 0; i < ids.length; i++) {
      const idxInExisting =
        existing && existing.ids
          ? existing.ids.findIndex((eid: string) => eid === ids[i])
          : -1;

      if (idxInExisting !== -1) {
        // Update: Use doc if provided, otherwise fallback to existing
        if (
          finalDocuments[i] === undefined &&
          existing.documents &&
          existing.documents[idxInExisting] !== undefined
        ) {
          finalDocuments[i] = existing.documents[idxInExisting];
        }
        // Metadata merge
        if (
          metadatas !== undefined &&
          existing.metadatas &&
          existing.metadatas[idxInExisting]
        ) {
          finalMetadatas[i] = {
            ...existing.metadatas[idxInExisting],
            ...metadatas[i],
          };
        } else if (
          metadatas === undefined &&
          existing.metadatas &&
          existing.metadatas[idxInExisting]
        ) {
          finalMetadatas[i] = existing.metadatas[idxInExisting];
        }
      }
    }

    // Require a doc for each upsert
    for (let i = 0; i < finalDocuments.length; i++) {
      if (!finalDocuments[i]) {
        return c.json(
          {
            error: `Field 'document' is required for new upserts (missing at index ${i})`,
          },
          400
        );
      }
    }

    // Prepare upsert data array
    const upsertData: any = {
      ids: ids,
      documents: finalDocuments,
    };
    // Only include metadatas if at least one element is not undefined
    if (finalMetadatas.some((m) => m !== undefined)) {
      upsertData.metadatas = finalMetadatas;
    }

    // Perform upsert
    await collection.upsert(upsertData);

    // Figure out which documents were inserted or updated
    let result = [];
    if (existing && existing.ids) {
      for (let i = 0; i < ids.length; i++) {
        const wasUpdate = existing.ids.includes(ids[i]);
        result.push({
          id: ids[i],
          status: wasUpdate ? "updated" : "inserted",
        });
      }
    } else {
      // If no existing info, all were inserted
      result = ids.map((id: string) => ({ id, status: "inserted" }));
    }

    return c.json({
      message: "Batch upsert completed",
      results: result,
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
