CREATE TABLE recipe_image_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_image_id  uuid NOT NULL REFERENCES recipe_images(id) ON DELETE CASCADE,
  session_token    varchar(128) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_image_id, session_token)
);

CREATE INDEX idx_rif_image ON recipe_image_flags(recipe_image_id);
