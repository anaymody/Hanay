-- Add 'brunch' to meal_period enum for weekend support
ALTER TYPE meal_period ADD VALUE IF NOT EXISTS 'brunch';

-- Restructure hall hours JSONB to weekday/weekend and standardize 10 PM close
UPDATE halls SET
  hours = jsonb_build_object(
    'weekday', jsonb_build_object(
      'breakfast', hours->>'breakfast',
      'lunch', hours->>'lunch',
      'dinner', '4:00–10:00 PM'
    ),
    'weekend', jsonb_build_object(
      'brunch', '8:30 AM–4:00 PM',
      'dinner', '4:00–10:00 PM'
    )
  ),
  active_meal_periods = ARRAY['breakfast','lunch','dinner','brunch']::meal_period[];
