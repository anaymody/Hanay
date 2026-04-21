import { GoogleGenAI } from '@google/genai';
import { GeminiRecipe, GeminiRecipeT, MealPeriodT } from './schemas';

const MODEL = 'gemini-2.5-flash';
const MAX_OUTPUT_TOKENS = 4096;
const MAX_ATTEMPTS = 3;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

const SYSTEM_INSTRUCTION =
  'You generate creative, microwave-friendly dining-hall "recipes" that combine ' +
  'items already available at a USC dining hall. Respond ONLY with valid JSON ' +
  'matching the exact schema the user provides — no prose, no markdown fences.';

function prompt(args: {
  hallName: string;
  mealPeriod: MealPeriodT;
  items: string[];
  filters: string[];
}): string {
  const filterLine =
    args.filters.length > 0
      ? `Dietary requirements: ${args.filters.join(', ')}.\n`
      : '';
  return `Create a fun, microwave-friendly "recipe" a USC student could assemble from items currently served at ${args.hallName} for ${args.mealPeriod}.

Available items:
${args.items.map((n) => `- ${n}`).join('\n')}

${filterLine}Rules:
- Use 3–4 ingredients, chosen verbatim from the list above.
- Provide 3–5 short, concrete assembly steps (no cooking instructions that aren't microwave-friendly).
- prep_time_mins must be a positive integer in minutes.
- dietary_tags should use short codes: V (vegetarian), VG (vegan), GF (gluten-free).

Respond with ONLY this JSON shape:
{
  "title": string,
  "description": string,
  "ingredients": string[],
  "steps": string[],
  "prep_time_mins": integer,
  "dietary_tags": string[]
}`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

export async function generateRecipe(args: {
  hallName: string;
  mealPeriod: MealPeriodT;
  items: string[];
  filters?: string[];
}): Promise<GeminiRecipeT> {
  const ai = getClient();
  const userPrompt = prompt({ ...args, filters: args.filters ?? [] });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const raw = res.text ?? '';
      const json = JSON.parse(extractJson(raw));
      return GeminiRecipe.parse(json);
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS) break;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Gemini recipe generation failed');
}
