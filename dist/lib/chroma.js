import { ChromaClient } from "chromadb";
import { OpenAIEmbeddingFunction } from "@chroma-core/openai";
const chromaHost = process.env.CHROMA_HOST || "http://localhost:8000";
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
}
// Note: SSL certificate verification is handled in index.ts before imports
export function getChromaClient() {
    // Parse the host URL
    try {
        const url = new URL(chromaHost);
        return new ChromaClient({
            host: url.hostname,
            port: url.port
                ? parseInt(url.port)
                : url.protocol === "https:"
                    ? 443
                    : 8000,
            ssl: url.protocol === "https:",
        });
    }
    catch (error) {
        // If it's not a full URL, treat it as a hostname
        return new ChromaClient({
            host: chromaHost,
            port: 8000,
            ssl: false,
        });
    }
}
export function createEmbeddingFunction() {
    if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY environment variable is required");
    }
    return new OpenAIEmbeddingFunction({
        apiKey: openaiApiKey,
        modelName: "text-embedding-3-small",
    });
}
