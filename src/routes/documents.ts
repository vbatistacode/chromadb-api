import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getCollectionOrError } from "../lib/collections.js";

const documents = new Hono();

// Add documents to collection
documents.post("/:name/documents", async (c) => {
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
documents.post("/:name/documents/:id", async (c) => {
  try {
    const { name, id } = c.req.param();
    const body = await c.req.json();
    const { document, metadata } = body;

    if (typeof document !== "string" && document !== undefined) {
      return c.json(
        { error: "Field 'document' must be a string if provided" },
        400
      );
    }

    const collection = await getCollectionOrError(name);

    // Try to get the existing document, for merge/update semantics
    let updatedDoc = document;
    let updatedMetadata = metadata;
    let exists = false;

    try {
      const existing = await collection.get({ ids: [id] });
      if (existing.ids && existing.ids.length > 0) {
        exists = true;
        if (updatedDoc === undefined) {
          updatedDoc = existing.documents?.[0];
        }
        if (metadata !== undefined && existing.metadatas?.[0]) {
          // Merge with existing metadata
          updatedMetadata = {
            ...existing.metadatas[0],
            ...metadata,
          };
        } else if (metadata === undefined && existing.metadatas?.[0]) {
          updatedMetadata = existing.metadatas[0];
        }
      }
    } catch (e) {
      // If the error means document is not found, treat as insert
      exists = false;
    }

    // Require document to exist (either existing or passed in)
    if (!updatedDoc) {
      return c.json(
        { error: "Field 'document' is required for new upserts" },
        400
      );
    }

    // Prepare data for upsert
    const upsertData: any = {
      ids: [id],
      documents: [updatedDoc],
    };
    if (updatedMetadata !== undefined) {
      upsertData.metadatas = [updatedMetadata];
    }

    // Perform upsert
    await collection.upsert(upsertData);

    return c.json({
      message: exists
        ? "Document updated successfully"
        : "Document inserted successfully",
      id,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to upsert document",
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
