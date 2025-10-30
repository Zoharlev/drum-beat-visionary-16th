import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DrumPattern {
  [key: string]: boolean[] | number | (string | number)[] | Array<{name: string; startStep: number; endStep: number}>;
  length: number;
  subdivisions?: (string | number)[];
  offsets?: number[];
  sections?: Array<{
    name: string;
    startStep: number;
    endStep: number;
  }>;
}

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  bpm: number;
  duration_seconds: number | null;
  backing_track_url: string | null;
  pattern_data: DrumPattern;
  created_at: string;
  updated_at: string;
}

// Fetch all songs
export const useSongs = () => {
  return useQuery({
    queryKey: ['songs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .order('title');
      
      if (error) throw error;
      return data as unknown as Song[];
    }
  });
};

// Fetch single song by ID
export const useSong = (songId: string | null) => {
  return useQuery({
    queryKey: ['songs', songId],
    queryFn: async () => {
      if (!songId) return null;
      
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('id', songId)
        .single();
      
      if (error) throw error;
      return data as unknown as Song;
    },
    enabled: !!songId
  });
};

// Get backing track URL from storage
export const getBackingTrackUrl = (path: string | null): string | null => {
  if (!path) return null;
  
  // If already a full URL, return as-is
  if (path.startsWith('http')) return path;
  
  // Otherwise, construct Supabase Storage URL
  const { data } = supabase.storage
    .from('backing-tracks')
    .getPublicUrl(path);
  
  return data.publicUrl;
};
