import { useSongs } from '@/hooks/useSongs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Music } from 'lucide-react';

interface SongSelectorProps {
  selectedSongId: string | null;
  onSongSelect: (songId: string) => void;
}

export const SongSelector = ({
  selectedSongId,
  onSongSelect,
}: SongSelectorProps) => {
  const { data: songs, isLoading, error } = useSongs();

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">Loading songs...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6">
          <p className="text-center text-destructive">Error loading songs</p>
        </CardContent>
      </Card>
    );
  }

  if (!songs || songs.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">
            No songs available. Add songs via the admin system.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Select a Song
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={selectedSongId || undefined} onValueChange={onSongSelect}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a song to practice..." />
          </SelectTrigger>
          <SelectContent>
            {songs.map((song) => (
              <SelectItem key={song.id} value={song.id}>
                <div className="flex items-center gap-4">
                  <span className="font-medium">{song.title}</span>
                  {song.artist && (
                    <span className="text-sm text-muted-foreground">
                      {song.artist}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {song.bpm} BPM
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};
