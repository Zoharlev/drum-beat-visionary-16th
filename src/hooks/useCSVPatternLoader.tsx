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

  const getBeatColumnsFromCountLine = (line: string): number[] => {
    // Extract the columns of the 8 positions from the Count line: 1 & 2 & 3 & 4 &
    const match = line.match(/^Count:\s*(.*)$/);
    if (!match) return [];
    const notation = match[1];
    const cols: number[] = [];
    for (let i = 0; i < notation.length; i++) {
      const ch = notation[i];
      if (ch === '1' || ch === '&' || ch === '2' || ch === '3' || ch === '4') {
        cols.push(i);
        if (cols.length === 8) break;
      }
    }
    return cols;
  };

  const parseInstrumentLine = (line: string, beatColumns: number[] | null): { instrument: string; positions: number[] } | null => {
    // Parse lines like "Snare:      ●                    ●               "
    // Also parse "HH Closed:" and "HH Open:" lines
    const match = line.match(/^(Hi-Hat|Snare|Kick|HH Closed|HH Open):\s*(.*)$/);
    if (!match || !beatColumns || beatColumns.length < 8) return null;

    const [, instrument, notation] = match;
    const positionsSet = new Set<number>();

    // Map hit characters to nearest beat columns derived from the matching Count line
    for (let i = 0; i < notation.length; i++) {
      const ch = notation[i];
      if (ch === '●' || ch === 'x' || ch === 'o') {
        let closestPos = 0;
        let minDistance = Math.abs(i - beatColumns[0]);
        for (let j = 1; j < beatColumns.length; j++) {
          const distance = Math.abs(i - beatColumns[j]);
          if (distance < minDistance) {
            minDistance = distance;
            closestPos = j;
          }
        }
        positionsSet.add(closestPos);
      }
    }

    return { instrument, positions: Array.from(positionsSet).sort((a, b) => a - b) };
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
    // For offset-based, 2 steps per beat (8 steps per bar / 4 beats = 2 steps per beat)
    const stepsPerUnit = isTimeBased ? 8 : 2;
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
          // Offset-based mapping (2 steps per beat, 8 steps per bar)
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
      const instruments = ['Kick', 'Snare', 'HH Closed', 'HH Open'];
      
      for (const instrument of instruments) {
        pattern[instrument] = new Array(totalSteps).fill(false);
      }
      
      // Parse the notation
      let currentBeatColumns: number[] | null = null;
      for (const line of lines) {
        if (line.startsWith('Bar ')) {
          const barMatch = line.match(/Bar (\d+):/);
          if (barMatch) {
            currentBar = parseInt(barMatch[1]) - 1; // Convert to 0-based
            currentBeatColumns = null; // reset for new bar
          }
        } else if (line.startsWith('Count:')) {
          currentBeatColumns = getBeatColumnsFromCountLine(line);
        } else {
          const parsed = parseInstrumentLine(line, currentBeatColumns);
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

  const loadPatternFromBarNotation = async (notationContent: string): Promise<DrumPattern> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const lines = notationContent.split('\n').map(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('Empty notation file');
      }

      const instrumentData: { [key: string]: boolean[] } = {
        kick: new Array(128).fill(false), // Support up to 16 bars * 8 steps = 128 total steps
        snare: new Array(128).fill(false),
        hihat: new Array(128).fill(false),
        openhat: new Array(128).fill(false)
      };

      let currentBar = 0;
      let currentBarStartStep = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for bar markers
        if (line.startsWith('Bar ')) {
          const barMatch = line.match(/Bar (\d+):/);
          if (barMatch) {
            currentBar = parseInt(barMatch[1]) - 1; // Convert to 0-based
            currentBarStartStep = currentBar * 8; // 8 steps per bar
          }
          continue;
        }

        // Parse instrument lines
        if (line.startsWith('Hi-Hat:') || line.startsWith('Snare:') || line.startsWith('Kick:')) {
          const instrumentName = line.split(':')[0].toLowerCase().replace('-', '');
          const hitPattern = line.substring(line.indexOf(':') + 1);
          
          // Map instrument names
          let targetInstrument = '';
          if (instrumentName === 'hihat') {
            targetInstrument = 'hihat';
          } else if (instrumentName === 'snare') {
            targetInstrument = 'snare';
          } else if (instrumentName === 'kick') {
            targetInstrument = 'kick';
          }

          if (targetInstrument && currentBarStartStep < 128) {
            // Parse hits in this bar (8 positions: 1, &, 2, &, 3, &, 4, &)
            const positions = [7, 13, 19, 25, 31, 37, 43, 49]; // Character positions for each beat
            
            for (let stepInBar = 0; stepInBar < 8 && currentBarStartStep + stepInBar < 128; stepInBar++) {
              const charPos = positions[stepInBar];
              if (charPos < hitPattern.length) {
                const char = hitPattern[charPos];
                if (char === '●' || char === 'x') {
                  instrumentData[targetInstrument][currentBarStartStep + stepInBar] = true;
                } else if (char === 'o' && targetInstrument === 'hihat') {
                  // Use openhat for 'o' symbols
                  instrumentData['openhat'][currentBarStartStep + stepInBar] = true;
                }
              }
            }
          }
        }
      }

      // Return only the first 16 steps (2 bars) for the drum machine
      const result: DrumPattern = {
        length: 16
      };
      Object.keys(instrumentData).forEach(instrument => {
        result[instrument] = instrumentData[instrument].slice(0, 16);
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse notation';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPatternFromNewCSV = async (csvContent: string): Promise<DrumPattern> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const lines = csvContent.trim().split('\n');
      const headerLine = lines[0];
      
      if (!headerLine.includes('Count,Offset (Beat),Instrument,Duration')) {
        throw new Error('Invalid CSV format. Expected Count,Offset (Beat),Instrument,Duration header');
      }

      // Find the maximum offset to determine pattern length
      let maxOffset = 0;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [offsetStr] = line.split(',');
        const offset = parseFloat(offsetStr);
        if (!isNaN(offset)) {
          maxOffset = Math.max(maxOffset, offset);
        }
      }
      
      // Calculate pattern length - each beat has 2 steps (on-beat and off-beat)
      // Add extra length to accommodate all bars
      const patternLength = Math.max(32, Math.ceil((maxOffset + 4) / 2) * 2);

      const pattern: DrumPattern = {
        kick: new Array(patternLength).fill(false),
        snare: new Array(patternLength).fill(false),
        hihat: new Array(patternLength).fill(false),
        openhat: new Array(patternLength).fill(false),
        length: patternLength
      };

      // Parse each line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [count, offsetStr, instrument, durationStr] = line.split(',');
        const offset = parseFloat(offsetStr);
        
        if (isNaN(offset)) continue;
        
        // Convert beat offset to step index (2 steps per beat)
        const stepIndex = Math.floor(offset * 2) % patternLength;

        // Map instrument to pattern
        const instrumentName = instrument.trim().toLowerCase();
        if (instrumentName === 'kick') {
          pattern.kick[stepIndex] = true;
        } else if (instrumentName === 'snare') {
          pattern.snare[stepIndex] = true;
        } else if (instrumentName === 'hi-hat (closed)') {
          pattern.hihat[stepIndex] = true;
        } else if (instrumentName === 'hi-hat (open)') {
          pattern.openhat[stepIndex] = true;
        }
      }

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
      const response = await fetch('/patterns/come_as_you_are_converted_from_txt.csv');
      if (!response.ok) {
        throw new Error('Failed to load pattern file');
      }
      const csvContent = await response.text();
      return loadPatternFromNewCSV(csvContent);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load pattern file';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return {
    loadPatternFromCSV,
    loadPatternFromNotation,
    loadPatternFromBarNotation,
    loadPatternFromNewCSV,
    loadPatternFromFile,
    isLoading,
    error
  };
};