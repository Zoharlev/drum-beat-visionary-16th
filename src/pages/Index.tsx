import { useState } from 'react';
import { DrumMachine } from '@/components/DrumMachine';
import { SongSelector } from '@/components/SongSelector';

const Index = () => {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Drumio Practice</h1>
        <p className="text-muted-foreground">
          Select a song and practice along with the drum pattern
        </p>
      </div>

      <SongSelector
        selectedSongId={selectedSongId}
        onSongSelect={setSelectedSongId}
      />

      {selectedSongId ? (
        <DrumMachine songId={selectedSongId} />
      ) : (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <p className="text-muted-foreground">
            Please select a song to start practicing
          </p>
        </div>
      )}
    </div>
  );
};

export default Index;
