import { useState } from 'react';

interface CSVDrumRow {
  part: string;
  offset: number;
  duration: number;
  drumComponent: string;
}

interface DrumPattern {
  kick: boolean[];
  snare: boolean[];
  hihat: boolean[];
  openhat: boolean[];
}

// Map CSV drum components to our drum types
const drumComponentMap: Record<string, keyof DrumPattern> = {
  'F': 'kick',           // F might be kick/bass drum
  'C': 'snare',          // C might be snare
  'E': 'hihat',          // E might be hihat
  'D': 'hihat',          // D might be hihat variation
  'A': 'openhat',        // A might be open hihat
  'Bass Drum': 'kick',   // Full name mapping
  'Snare Drum': 'snare', // Full name mapping
  'Hi-Hat': 'hihat',     // Full name mapping
  'Open Hi-Hat': 'openhat', // Full name mapping
};

export const useCSVPatternLoader = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCSVLine = (line: string): CSVDrumRow | null => {
    const parts = line.split(',');
    if (parts.length !== 4) return null;

    return {
      part: parts[0].trim(),
      offset: parseFloat(parts[1].trim()),
      duration: parseFloat(parts[2].trim()),
      drumComponent: parts[3].trim()
    };
  };

  const convertToPattern = (csvData: CSVDrumRow[], patternLength: number = 16): DrumPattern => {
    const pattern: DrumPattern = {
      kick: new Array(patternLength).fill(false),
      snare: new Array(patternLength).fill(false),
      hihat: new Array(patternLength).fill(false),
      openhat: new Array(patternLength).fill(false)
    };

    // Find the range of beats to determine how to map to our 16-step grid
    const offsets = csvData.map(row => row.offset);
    const minOffset = Math.min(...offsets);
    const maxOffset = Math.max(...offsets);
    const beatRange = maxOffset - minOffset;

    csvData.forEach(row => {
      const drumType = drumComponentMap[row.drumComponent];
      if (drumType) {
        // Map the beat offset to our 16-step grid
        const normalizedOffset = (row.offset - minOffset) / beatRange;
        const stepIndex = Math.round(normalizedOffset * (patternLength - 1));
        
        if (stepIndex >= 0 && stepIndex < patternLength) {
          pattern[drumType][stepIndex] = true;
        }
      }
    });

    return pattern;
  };

  const loadPatternFromCSV = async (csvContent: string): Promise<DrumPattern> => {
    setIsLoading(true);
    setError(null);

    try {
      const lines = csvContent.split('\n').filter(line => line.trim());
      // Skip header row
      const dataLines = lines.slice(1);
      
      const csvRows: CSVDrumRow[] = [];
      
      for (const line of dataLines) {
        const row = parseCSVLine(line);
        if (row && row.part === 'Voice') {
          csvRows.push(row);
        }
      }

      if (csvRows.length === 0) {
        throw new Error('No valid drum data found in CSV');
      }

      const pattern = convertToPattern(csvRows);
      return pattern;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse CSV';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPatternFromFile = async (): Promise<DrumPattern> => {
    try {
      const response = await fetch('/patterns/come_as_you_are_drums_1.csv');
      if (!response.ok) {
        throw new Error('Failed to load pattern file');
      }
      const csvContent = await response.text();
      return loadPatternFromCSV(csvContent);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load pattern file';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return {
    loadPatternFromCSV,
    loadPatternFromFile,
    isLoading,
    error
  };
};