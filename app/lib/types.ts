export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'brunch';

export type Hall = {
  id: string;
  name: string;
  short_name: string;
  location: string;
  hours: {
    weekday: Partial<Record<MealPeriod, string>>;
    weekend: Partial<Record<MealPeriod, string>>;
  };
  active_meal_periods: MealPeriod[];
};

export type MenuItem = {
  id: string;
  name: string;
  category: string | null;
  tags: string[];
  avg_stars: number | null;
  rating_count: number;
};

export type MenuItemImage = {
  id: string;
  storage_path: string;
  created_at: string;
};

export type Recipe = {
  id: string;
  hall_id: string;
  source: 'ai' | 'user';
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  dietary_tags: string[];
  prep_time_mins: number | null;
  meal_period: MealPeriod;
  date: string;
  created_at: string;
};
