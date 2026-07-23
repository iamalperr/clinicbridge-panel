import OpenAI from "openai";

let openaiClient: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Generates embeddings for a given array of texts using text-embedding-3-small.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];

  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  return response.data.map(d => d.embedding);
}

/**
 * Splits a long text into smaller chunks based on paragraphs or character limits.
 * We'll use a simple sentence/paragraph based chunker.
 */
export function chunkText(text: string, maxTokens: number = 800): string[] {
  // A very basic chunker: split by double newlines (paragraphs).
  // If a paragraph is too long, we could split by sentences, but for clinic KBs, paragraphs are usually fine.
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  
  const chunks: string[] = [];
  let currentChunk = "";

  for (const p of paragraphs) {
    // Rough estimate: 1 word ~ 1.3 tokens. So 800 tokens is ~600 words, ~4000 characters.
    if ((currentChunk.length + p.length) < 3500) {
      currentChunk += (currentChunk ? "\n\n" : "") + p;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = p;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  // If there are massive chunks without newlines, split them by character chunks.
  const finalChunks: string[] = [];
  for (const c of chunks) {
    if (c.length > 4000) {
      const parts = c.match(/.{1,3500}/g) || [];
      finalChunks.push(...parts);
    } else {
      finalChunks.push(c);
    }
  }

  return finalChunks;
}

/**
 * Computes cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
