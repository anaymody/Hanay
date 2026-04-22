CREATE TABLE menu_item_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  session_token text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mii_menu_item ON menu_item_images(menu_item_id);
