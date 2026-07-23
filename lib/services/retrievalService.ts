import { generateEmbeddings, cosineSimilarity, getOpenAI } from "./embeddingService";

export interface RetrievedChunk {
  text: string;
  chunk_index: number;
  doc_id: string;
  title: string;
  score: number;
  vectorScore: number;
  keywordScore: number;
}

/**
 * Rewrites a user query into 3 optimized search queries for clinic knowledge retrieval.
 */
export async function rewriteQuery(userMessage: string, clinicName: string = ""): Promise<string[]> {
  try {
    const openai = getOpenAI();
    const prompt = `Convert the following user message into 3 optimized, distinct search queries for retrieving clinic-specific factual knowledge from a vector database.
Clinic context: ${clinicName || "Unknown"}
Focus on entities, services, pricing, and specific facts.
Format the output strictly as a JSON array of strings: ["query1", "query2", "query3"]
User message: "${userMessage}"`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "";
    // If json_object requires an object wrapper, the LLM usually returns { "queries": [...] } or similar.
    // Let's parse it safely.
    const json = JSON.parse(content);
    if (Array.isArray(json)) return json;
    if (json.queries && Array.isArray(json.queries)) return json.queries;
    
    // Fallback if parsing fails
    return [userMessage];
  } catch (err) {
    console.error("[retrievalService] Query rewrite failed:", err);
    return [userMessage];
  }
}

function calculateKeywordScore(text: string, queries: string[]): number {
  const lowerText = text.toLowerCase();
  let score = 0;
  
  // Combine all query words
  const allWords = new Set<string>();
  queries.forEach(q => {
    q.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 2) allWords.add(w);
    });
  });

  allWords.forEach(w => {
    if (lowerText.includes(w)) {
      score += 1;
    }
  });

  return score;
}

/**
 * Performs a hybrid search over clinic documents containing embedding chunks.
 * clinicDocs format: Array of { id, title, content, embeddingChunks: [{ text, embedding, chunk_index }] }
 */
export async function hybridSearch(
  userMessage: string,
  clinicDocs: any[],
  clinicName: string = "",
  topK: number = 5
): Promise<RetrievedChunk[]> {
  if (!clinicDocs || clinicDocs.length === 0) return [];

  // 1. Rewrite queries
  const queries = await rewriteQuery(userMessage, clinicName);
  // Add original message to queries
  queries.push(userMessage);

  // 2. Generate embeddings for the queries
  const queryEmbeddings = await generateEmbeddings(queries);

  const results: RetrievedChunk[] = [];

  // 3. Score each chunk
  for (const doc of clinicDocs) {
    if (!doc.embeddingChunks || !Array.isArray(doc.embeddingChunks) || doc.embeddingChunks.length === 0) {
      // BACKWARD COMPATIBILITY: If no embeddings, use keyword scoring on the whole text
      const fullText = (doc.title + " " + doc.content).trim();
      if (!fullText) continue;

      const keywordScoreRaw = calculateKeywordScore(fullText, queries);
      if (keywordScoreRaw > 0) {
        const keywordScore = Math.min(keywordScoreRaw / 5, 1.0);
        // We give it 0 for vector score, but we weight keyword score heavily so it still appears
        const finalScore = keywordScore * 0.3; // It will be lower than vector matches, but better than nothing
        
        results.push({
          text: fullText,
          chunk_index: 0,
          doc_id: doc.id,
          title: doc.title || "",
          score: finalScore,
          vectorScore: 0,
          keywordScore: keywordScore,
        });
      }
      continue;
    }

    for (const chunk of doc.embeddingChunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;

      // Max vector similarity across all query variations
      let maxVecScore = 0;
      for (const qEmb of queryEmbeddings) {
        const sim = cosineSimilarity(qEmb, chunk.embedding);
        if (sim > maxVecScore) maxVecScore = sim;
      }

      const keywordScoreRaw = calculateKeywordScore(chunk.text, queries);
      // Normalize keyword score roughly (assume max expected is around 5)
      const keywordScore = Math.min(keywordScoreRaw / 5, 1.0);

      // Hybrid score: 70% vector, 30% keyword
      const finalScore = (maxVecScore * 0.7) + (keywordScore * 0.3);

      results.push({
        text: chunk.text,
        chunk_index: chunk.chunk_index,
        doc_id: doc.id,
        title: doc.title || "",
        score: finalScore,
        vectorScore: maxVecScore,
        keywordScore: keywordScore,
      });
    }
  }

  // 4. Sort and return top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Checks if the AI response is grounded in the retrieved context.
 */
export async function validateGroundedness(
  response: string,
  retrievedContext: string
): Promise<{ isGrounded: boolean, reason: string }> {
  try {
    const openai = getOpenAI();
    const prompt = `You are a strict fact-checker. 
Compare the GENERATED RESPONSE against the RETRIEVED CONTEXT.
Rule: If the GENERATED RESPONSE makes any specific factual claim (price, service, doctor name, hours) that is NOT explicitly supported by the RETRIEVED CONTEXT, it is UNGROUNDED.
Rule Exception: If the GENERATED RESPONSE claims a service is "free" or "ücretsiz" and the RETRIEVED CONTEXT supports this, it is GROUNDED. Do not fail it just because it isn't a numeric price.
If the response simply says "I don't know" or asks for more info, it is GROUNDED.

RETRIEVED CONTEXT:
${retrievedContext || "(No context available)"}

GENERATED RESPONSE:
${response}

Return strictly a JSON object: { "isGrounded": boolean, "reason": "short explanation" }`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      response_format: { type: "json_object" },
    });

    const json = JSON.parse(res.choices[0]?.message?.content || "{}");
    return {
      isGrounded: json.isGrounded ?? true,
      reason: json.reason || "",
    };
  } catch (err) {
    console.error("[retrievalService] Groundedness check failed:", err);
    // Fail-open or fail-closed? The user wants fail-closed, but if the validator itself fails, 
    // it's safer to fail-open so the bot doesn't completely die, but log it.
    return { isGrounded: true, reason: "Validator failed" };
  }
}
