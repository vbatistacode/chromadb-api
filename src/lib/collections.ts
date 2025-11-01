import { getChromaClient, createEmbeddingFunction } from "./chroma.js";
import { Collection } from "chromadb";

export async function getCollectionOrError(name: string): Promise<Collection> {
  const client = getChromaClient();
  const embeddingFunction = createEmbeddingFunction();

  try {
    // Try to get collection with embedding function (required for operations)
    // ChromaDB v3+ requires embedding function to be passed when getting collections
    const collection = await client.getCollection({
      name,
      embeddingFunction,
    });
    return collection;
  } catch (error: any) {
    // Check if it's a "not found" error
    if (
      error.message?.includes("not found") ||
      error.message?.includes("does not exist")
    ) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // If the error is about embedding function deserialization, the collection exists
    // but ChromaDB can't deserialize its stored embedding function configuration.
    // This can happen when the collection was created with a different version or config.
    // We can still use the collection by providing our embedding function explicitly.
    if (error.message?.includes("Unknown embedding function")) {
      // Log the warning but continue - we'll provide the embedding function for operations
      console.warn(
        `Warning: Collection '${name}' has an unknown embedding function configuration. ` +
        `Using provided embedding function for operations.`
      );
      
      // Try to get the collection anyway - ChromaDB might still allow operations
      // with our explicitly provided embedding function
      try {
        // Use getOrCreateCollection which should handle existing collections better
        const collection = await client.getOrCreateCollection({
          name,
          embeddingFunction,
        });
        return collection;
      } catch (retryError: any) {
        // If getOrCreateCollection fails because collection exists with different config,
        // we might need to handle this differently. But typically it should work.
        throw new Error(
          `Failed to access collection '${name}'. The collection may have been created ` +
          `with a different embedding function configuration. Error: ${retryError.message}`
        );
      }
    }
    
    throw new Error(`Failed to get collection: ${error.message}`);
  }
}
