-- Create songs table
CREATE TABLE public.songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT,
  bpm INTEGER NOT NULL CHECK (bpm BETWEEN 40 AND 240),
  duration_seconds INTEGER,
  backing_track_url TEXT,
  pattern_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

-- Allow public read access (no auth needed)
CREATE POLICY "Anyone can read songs"
ON public.songs
FOR SELECT
TO public
USING (true);

-- Create storage bucket for backing tracks
INSERT INTO storage.buckets (id, name, public)
VALUES ('backing-tracks', 'backing-tracks', true);

-- Allow public read access to backing tracks
CREATE POLICY "Public can read backing tracks"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'backing-tracks');