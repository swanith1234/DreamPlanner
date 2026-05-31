import prisma from '../config/database';
import { generateEmbedding } from '../lib/embeddings';

export async function registerTool(
  name: string,
  semanticDescription: string,
  category: string,
  rawJsonSchema: any
) {
  const embedding = await generateEmbedding(semanticDescription);
  
  // Format the array as a string representation of a Postgres vector
  const embeddingString = `[${embedding.join(',')}]`;
  
  // Serialize JSON object
  const schemaJson = JSON.stringify(rawJsonSchema);
  
  await prisma.$executeRaw`
    INSERT INTO "ToolRegistry" (
      "id",
      "name",
      "semanticDescription",
      "rawJsonSchema",
      "category",
      "embedding",
      "createdAt"
    ) VALUES (
      gen_random_uuid(),
      ${name},
      ${semanticDescription},
      ${schemaJson}::jsonb,
      ${category},
      ${embeddingString}::vector,
      NOW()
    )
    ON CONFLICT ("name") DO UPDATE SET
      "semanticDescription" = EXCLUDED."semanticDescription",
      "rawJsonSchema" = EXCLUDED."rawJsonSchema",
      "category" = EXCLUDED."category",
      "embedding" = EXCLUDED."embedding";
  `;
}
