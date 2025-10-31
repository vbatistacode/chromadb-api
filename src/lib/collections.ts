import { getChromaClient, createEmbeddingFunction } from "./chroma";
import { Collection } from "chromadb";

export async function getCollectionOrError(name: string): Promise<Collection> {
  const client = getChromaClient();
  const embeddingFunction = createEmbeddingFunction();

  try {
    const collection = await client.getCollection({
      name,
      embeddingFunction,
    });
    return collection;
  } catch (error: any) {
    if (
      error.message?.includes("not found") ||
      error.message?.includes("does not exist")
    ) {
      throw new Error(`Collection '${name}' not found`);
    }
    throw new Error(`Failed to get collection: ${error.message}`);
  }
}
