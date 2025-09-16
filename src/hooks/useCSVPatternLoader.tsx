import { useState } from 'react';

interface CSVDrumRow {
  part?: string;
  offset?: number;
  time?: number;
  duration: number;
  drumComponent?: string;
  instrument?: string;
}

interface DrumPattern {
  [key: string]: boolean[] | number;
  length: number;
}

// Map CSV drum components to our drum types
const drumComponentMap: Record<string, string> = {
  'F': 'Kick',           // F might be kick/bass drum
  'C': 'Snare',          // C might be snare
  'E': 'Hi-Hat',          // E might be hihat
  'D': 'Hi-Hat',          // D might be hihat variation
  'A': 'openhat',        // A might be open hihat
  'Bass Drum': 'Kick',   // Full name mapping
  'Snare Drum': 'Snare', // Full name mapping
  'Hi-Hat': 'Hi-Hat',     // Full name mapping
  'Open Hi-Hat': 'openhat', // Full name mapping
};

export const useCSVPatternLoader = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCSVLine = (line: string): CSVDrumRow | null => {
    const parts = line.split(',');
    if (parts.length < 3) return null;

    // Handle both formats:
    // Format 1: Part,Offset (Beat),Duration (Quarter),Drum Component
    // Format 2: Time (s), Instrument,Duration (Quarter)
    
    if (parts.length === 4) {
      // Original format
      return {
        part: parts[0].trim(),
        offset: parseFloat(parts[1].trim()),
        duration: parseFloat(parts[2].trim()),
        drumComponent: parts[3].trim()
      };
    } else if (parts.length === 3) {
      // New time-based format
      return {
        time: parseFloat(parts[0].trim()),
        instrument: parts[1].trim(),
        duration: parseFloat(parts[2].trim())
      };
    }
    
    return null;
  };

  const parseNotationLine = (line: string): { instrument: string; positions: number[] } | null => {
    // Parse lines like "Snare:      ●                    ●               "
    const match = line.match(/^(Hi-Hat|Snare|Kick):\s*(.*)$/);
    if (!match) return null;
    
    const [, instrument, notation] = match;
    const positions: number[] = [];
    
    // Each bar has 8 positions (1, &, 2, &, 3, &, 4, &)
    // The notation line has specific spacing for each position
    const positionSpacing = [7, 13, 19, 25, 31, 37, 43, 49]; // Approximate character positions for beats
    
    for (let i = 0; i < notation.length; i++) {
      if (notation[i] === '●') {
        // Find the closest beat position
        let closestPos = 0;
        let minDistance = Math.abs(i - positionSpacing[0]);
        
        for (let j = 1; j < positionSpacing.length; j++) {
          if (j >= positionSpacing.length) break;
          const distance = Math.abs(i - positionSpacing[j]);
          if (distance < minDistance) {
            minDistance = distance;
            closestPos = j;
          }
        }
        
        positions.push(closestPos);
      }
    }
    
    return { instrument, positions };
  };

  const convertToPattern = (csvData: CSVDrumRow[]): DrumPattern => {
    // Determine if we're using time-based or offset-based data
    const isTimeBased = csvData.some(row => row.time !== undefined);
    
    let minTime = 0;
    let maxTime = 0;
    
    if (isTimeBased) {
      // Time-based format (seconds)
      const times = csvData.map(row => row.time!).filter(t => !isNaN(t));
      minTime = Math.min(...times);
      maxTime = Math.max(...times);
    } else {
      // Offset-based format (beats)
      const offsets = csvData.map(row => row.offset!).filter(o => !isNaN(o));
      minTime = Math.min(...offsets);
      maxTime = Math.max(...offsets);
    }
    
    const timeRange = maxTime - minTime;
    
    // Convert to steps - for time-based, assume 120 BPM (0.5s per beat, 4 steps per beat = 8 steps per second)
    // For offset-based, 4 steps per beat
    const stepsPerUnit = isTimeBased ? 8 : 4;
    const patternLength = Math.max(16, Math.ceil((timeRange + 1) * stepsPerUnit));
    
    const pattern: DrumPattern = {
      length: patternLength
    };

    // Initialize arrays for instruments found in data
    const instrumentsFound = new Set<string>();
    csvData.forEach(row => {
      const componentName = row.drumComponent || row.instrument || '';
      const drumType = drumComponentMap[componentName] || componentName;
      if (drumType) {
        instrumentsFound.add(drumType);
      }
    });

    // Initialize pattern arrays
    instrumentsFound.forEach(instrument => {
      pattern[instrument] = new Array(patternLength).fill(false);
    });

    csvData.forEach(row => {
      // Determine drum type from either drumComponent or instrument field
      const componentName = row.drumComponent || row.instrument || '';
      const drumType = drumComponentMap[componentName] || componentName;
      
      if (drumType && pattern[drumType]) {
        let stepIndex: number;
        
        if (isTimeBased && row.time !== undefined) {
          // Time-based mapping (8 steps per second at 120 BPM)
          stepIndex = Math.round((row.time - minTime) * stepsPerUnit);
        } else if (row.offset !== undefined) {
          // Offset-based mapping (4 steps per beat)
          stepIndex = Math.round((row.offset - minTime) * stepsPerUnit);
        } else {
          return; // Skip invalid rows
        }
        
        if (stepIndex >= 0 && stepIndex < patternLength) {
          (pattern[drumType] as boolean[])[stepIndex] = true;
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
        if (row) {
          // Accept rows with 'Voice' part or any valid row in new format
          if (row.part === 'Voice' || row.instrument) {
            csvRows.push(row);
          }
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

  const loadPatternFromNotation = async (notationContent: string): Promise<DrumPattern> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const lines = notationContent.split('\n');
      const pattern: { [key: string]: boolean[] } = {};
      let totalBars = 0;
      let currentBar = 0;
      
      // First pass: count bars
      for (const line of lines) {
        if (line.startsWith('Bar ')) {
          totalBars++;
        }
      }
      
      // Initialize pattern arrays
      const totalSteps = totalBars * 8; // 8 steps per bar
      const instruments = ['Kick', 'Snare', 'Hi-Hat'];
      
      for (const instrument of instruments) {
        pattern[instrument] = new Array(totalSteps).fill(false);
      }
      
      // Parse the notation
      for (const line of lines) {
        if (line.startsWith('Bar ')) {
          const barMatch = line.match(/Bar (\d+):/);
          if (barMatch) {
            currentBar = parseInt(barMatch[1]) - 1; // Convert to 0-based
          }
        } else {
          const parsed = parseNotationLine(line);
          if (parsed && pattern[parsed.instrument]) {
            // Map positions to the correct bar offset
            for (const pos of parsed.positions) {
              const stepIndex = currentBar * 8 + pos;
              if (stepIndex < totalSteps) {
                pattern[parsed.instrument][stepIndex] = true;
              }
            }
          }
        }
      }
      
      return {
        ...pattern,
        length: totalSteps
      } as DrumPattern;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse notation';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPatternFromFile = async (): Promise<DrumPattern> => {
    try {
      const response = await fetch('/patterns/come_as_you_are_drum_notation_with_hihat-3.txt');
      if (!response.ok) {
        throw new Error('Failed to load pattern file');
      }
      const notationContent = await response.text();
      return loadPatternFromNotation(notationContent);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load pattern file';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return {
    loadPatternFromCSV,
    loadPatternFromNotation,
    loadPatternFromFile,
    isLoading,
    error
  };
};