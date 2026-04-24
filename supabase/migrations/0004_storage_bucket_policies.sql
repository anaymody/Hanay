-- Create the menu-images storage bucket (public reads, RLS-controlled writes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload images (anon role used by client-side Supabase SDK)
CREATE POLICY "Allow public uploads to menu-images"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'menu-images');

-- Allow anyone to read images (bucket is public, but explicit policy ensures access)
CREATE POLICY "Allow public reads from menu-images"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'menu-images');
