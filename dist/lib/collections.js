import { getChromaClient, createEmbeddingFunction } from "./chroma.js";
export async function getCollectionOrError(name) {
    const client = getChromaClient();
    const embeddingFunction = createEmbeddingFunction();
    try {
        const collection = await client.getCollection({
            name,
            embeddingFunction,
        });
        return collection;
    }
    catch (error) {
        if (error.message?.includes("not found") ||
            error.message?.includes("does not exist")) {
            throw new Error(`Collection '${name}' not found`);
        }
        throw new Error(`Failed to get collection: ${error.message}`);
    }
}
