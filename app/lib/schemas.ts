import { z } from 'zod';

export const MealPeriod = z.enum(['breakfast', 'lunch', 'dinner', 'brunch']);
export type MealPeriodT = z.infer<typeof MealPeriod>;

const uuid = z.string().uuid();

export const RatingBody = z.object({
  menu_item_id: uuid,
  stars: z.number().int().min(1).max(5),
});

export const PostRecipeBody = z.object({
  hall_id: uuid,
  meal_period: MealPeriod,
  title: z.string().trim().min(1).max(140),
  description: z.string().max(500).optional().default(''),
  ingredients: z.array(z.string().trim().min(1)).min(1).max(20),
  steps: z.array(z.string().trim().min(1)).min(1).max(20),
  dietary_tags: z.array(z.string()).optional().default([]),
  prep_time_mins: z.number().int().positive().optional(),
  menu_item_ids: z.array(uuid).optional().default([]),
});

export const GenerateRecipeBody = z.object({
  hall_id: uuid,
  meal_period: MealPeriod,
  filters: z.array(z.string()).optional().default([]),
});

export const PostImageBody = z.object({
  menu_item_id: uuid,
  storage_path: z.string().min(1).max(500),
});

export const FlagBody = z.object({
  reason: z.string().max(500).optional(),
});

// Gemini output schema — simplified ingredients (plain strings to match UI).
export const GeminiRecipe = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
  prep_time_mins: z.number().int().positive(),
  dietary_tags: z.array(z.string()).default([]),
});
export type GeminiRecipeT = z.infer<typeof GeminiRecipe>;
