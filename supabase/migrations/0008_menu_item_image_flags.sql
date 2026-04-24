CREATE TABLE menu_item_image_flags (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_image_id  uuid NOT NULL REFERENCES menu_item_images(id) ON DELETE CASCADE,
  session_token       varchar(128) NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_image_id, session_token)
);

CREATE INDEX idx_miif_image ON menu_item_image_flags(menu_item_image_id);
