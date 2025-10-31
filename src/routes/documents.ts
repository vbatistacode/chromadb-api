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

// Update document
documents.patch("/:name/documents/:id", async (c) => {
  try {
    const { name, id } = c.req.param();
    const body = await c.req.json();
    const { document, metadata } = body;

    const collection = await getCollectionOrError(name);

    // Get the existing document to preserve unchanged fields
    const existing = await collection.get({
      ids: [id],
    });

    if (!existing.ids || existing.ids.length === 0) {
      return c.json({ error: "Document not found" }, 404);
    }

    // Merge existing data with new data - preserve unchanged fields
    const updatedDoc =
      document !== undefined ? document : existing.documents?.[0];

    // Merge metadata if provided, otherwise keep existing
    let updatedMetadata = existing.metadatas?.[0];
    if (metadata !== undefined) {
      // If metadata is provided, merge with existing metadata
      updatedMetadata = {
        ...existing.metadatas?.[0],
        ...metadata,
      };
    }

    // Prepare update data - embeddings will be handled automatically
    const updateData: any = {
      ids: [id],
      documents: [updatedDoc],
    };

    if (updatedMetadata !== undefined) {
      updateData.metadatas = [updatedMetadata];
    }

    // Use ChromaDB's update method
    await collection.update(updateData);

    return c.json({
      message: "Document updated successfully",
      id: id,
    });
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return c.json({ error: error.message }, 404);
    }
    return c.json(
      {
        error: "Failed to update document",
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
