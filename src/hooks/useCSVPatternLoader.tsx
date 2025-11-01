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
  [key: string]: boolean[] | number | string[] | number[];
  length: number;
  subdivisions?: string[]; // Store subdivision labels for each step
  offsets?: number[]; // Store precise offset timing for each step
  sections?: string[]; // Store section names for each step (e.g., "Verse 1", "Chorus")
}

// Map CSV drum components to our drum types (using DrumMachine keys)
const drumComponentMap: Record<string, string> = {
  'F': 'Kick',           // F might be kick/bass drum
  'C': 'Snare',          // C might be snare
  'E': 'HH Closed',      // E might be hihat
  'D': 'HH Closed',      // D might be hihat variation
  'A': 'HH Open',        // A might be open hihat
  'Bass Drum': 'Kick',   // Full name mapping
  'Snare Drum': 'Snare', // Full name mapping
  'Hi-Hat': 'HH Closed', // Full name mapping
  'Open Hi-Hat': 'HH Open', // Full name mapping
  'Tom-tom': 'Tom',      // Tom mapping
  'Tom': 'Tom'           // Tom mapping
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
      const instruments = ['Kick', 'Snare', 'HH Closed', 'HH Open', 'Tom', 'Ghost Note'];
      
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
        'Kick': new Array(128).fill(false), // Support up to 16 bars * 8 steps = 128 total steps
        'Snare': new Array(128).fill(false),
        'HH Closed': new Array(128).fill(false),
        'HH Open': new Array(128).fill(false),
        'Tom': new Array(128).fill(false),
        'Ghost Note': new Array(128).fill(false)
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
          
          // Map instrument names to DrumMachine keys
          let targetInstrument = '';
          if (instrumentName === 'hihat') {
            targetInstrument = 'HH Closed';
          } else if (instrumentName === 'snare') {
            targetInstrument = 'Snare';
          } else if (instrumentName === 'kick') {
            targetInstrument = 'Kick';
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
                } else if (char === 'o' && instrumentName === 'hihat') {
                  // Use 'HH Open' for 'o' symbols
                  instrumentData['HH Open'][currentBarStartStep + stepInBar] = true;
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

  // Helper function to normalize instrument names to match DrumMachine keys
  const normalizeInstrument = (instrument: string): string => {
    const normalized = instrument.toLowerCase().trim();
    
    // Kick drum mappings - use 'Kick' to match DrumMachine
    if (normalized === 'kick' || normalized === 'kick drum' || normalized === 'bass drum') {
      return 'Kick';
    }
    
    // Snare drum mappings - use 'Snare' to match DrumMachine
    if (normalized === 'snare' || normalized === 'snare drum') {
      return 'Snare';
    }
    
    // Closed hi-hat mappings - use 'HH Closed' to match DrumMachine
    if (normalized === 'hi-hat (closed)' || normalized === 'hi hat (closed)' || 
        normalized === 'hh closed' || normalized === 'hihat' || 
        normalized === 'closed hat' || normalized === 'hi-hat' || normalized === 'hi hat') {
      return 'HH Closed';
    }
    
    // Open hi-hat mappings - use 'HH Open' to match DrumMachine
    if (normalized === 'hi-hat (open)' || normalized === 'hi hat (open)' || 
        normalized === 'hh open' || normalized === 'open hat' || 
        normalized === 'open hihat') {
      return 'HH Open';
    }
    
    // Tom-tom mappings - use 'Tom' to match DrumMachine
    if (normalized === 'tom-tom' || normalized === 'tom tom' || normalized === 'tom') {
      return 'Tom';
    }
    
    // Ghost Note mappings - use 'Ghost Note' to match DrumMachine
    if (normalized === 'ghost note' || normalized === 'ghost') {
      return 'Ghost Note';
    }
    
    console.log(`⚠️ Unmapped instrument: "${instrument}" → "${normalized}"`);
    return normalized;
  };

  const loadPatternFromNewCSV = async (csvContent: string): Promise<DrumPattern> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const lines = csvContent.trim().split('\n');
      const headerLine = lines[0];
      
      // Check if this is the advanced format with 16th notes and multiple instruments per beat
      const isAdvancedFormat = headerLine.includes('Count') && headerLine.includes('Instrument 1') && headerLine.includes('Instrument 2');
      
      // Check if this is count-based format (Count,Instrument,Duration) or offset-based
      const isCountBased = headerLine.includes('Count') && !headerLine.includes('Offset') && !isAdvancedFormat;
      const isOffsetBased = headerLine.includes('Count') && headerLine.includes('Offset') && headerLine.includes('Instrument');
      
      if (!isCountBased && !isOffsetBased && !isAdvancedFormat) {
        throw new Error(`Invalid CSV format. Expected either "Count,Instrument,Duration", "Count,Offset (Beat),Instrument,Duration", or "Count,Instrument 1, Instrument 2". Got: ${headerLine}`);
      }

      if (isAdvancedFormat) {
        return loadPatternFromAdvancedCountCSV(csvContent);
      } else if (isCountBased) {
        return loadPatternFromCountCSV(csvContent);
      } else {
        // Original offset-based loading
        let maxOffset = 0;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const columns = line.split(',');
          if (columns.length >= 2) {
            const offset = parseFloat(columns[1]); // Use second column (Offset)
            if (!isNaN(offset)) {
              maxOffset = Math.max(maxOffset, offset);
            }
          }
        }
        
        const stepsPerBeat = 4; // 16th note resolution
        const patternLength = Math.max(16, Math.ceil((maxOffset + 1) * stepsPerBeat));

        const pattern: DrumPattern = {
          'Kick': new Array(patternLength).fill(false),
          'Snare': new Array(patternLength).fill(false),
          'HH Closed': new Array(patternLength).fill(false),
          'HH Open': new Array(patternLength).fill(false),
          'Tom': new Array(patternLength).fill(false),
          'Ghost Note': new Array(patternLength).fill(false),
          length: patternLength
        };

        // Parse each line and map to full pattern
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const columns = line.split(',');
          if (columns.length < 3) continue;

          const offset = parseFloat(columns[1]); // Offset (Beat) column
          const instrument = columns[2].trim(); // Instrument column
          
          if (isNaN(offset)) continue;
          
          const stepIndex = Math.floor(offset * stepsPerBeat);
          
          if (stepIndex >= patternLength) continue;

          const instrumentKey = normalizeInstrument(instrument);
          if (pattern[instrumentKey] !== undefined) {
            (pattern[instrumentKey] as boolean[])[stepIndex] = true;
          }
        }

        return pattern;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse CSV';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPatternFromCountCSV = async (csvContent: string): Promise<DrumPattern> => {
    const lines = csvContent.trim().split('\n');
    
    // Count total beats to determine pattern length
    const totalBeats = lines.length - 1; // Subtract header
    const stepsPerBar = 8; // 8 positions per bar (1, &, 2, &, 3, &, 4, &)
    const totalBars = Math.ceil(totalBeats / stepsPerBar);
    const patternLength = totalBars * stepsPerBar;

    console.log(`Count CSV Pattern: totalBeats=${totalBeats}, totalBars=${totalBars}, patternLength=${patternLength}`);

    const pattern: DrumPattern = {
      'Kick': new Array(patternLength).fill(false),
      'Snare': new Array(patternLength).fill(false),
      'HH Closed': new Array(patternLength).fill(false),
      'HH Open': new Array(patternLength).fill(false),
      'Tom': new Array(patternLength).fill(false),
      'Ghost Note': new Array(patternLength).fill(false),
      length: patternLength
    };

    // Parse each data line - each line represents a sequential 8th note position
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length < 3) continue;

      const count = columns[0].trim();
      const instrument = columns[1].trim();
      
      // Skip if no instrument specified
      if (!instrument) continue;

      // Each line represents a sequential step (8th note)
      const stepIndex = i - 1; // 0-based step index (excluding header)

      if (stepIndex < patternLength) {
        const instrumentKey = normalizeInstrument(instrument);
        if (pattern[instrumentKey] !== undefined) {
          (pattern[instrumentKey] as boolean[])[stepIndex] = true;
        }
      }
    }

    return pattern;
  };

  const loadPatternFromAdvancedCountCSV = async (csvContent: string): Promise<DrumPattern> => {
    const lines = csvContent.trim().split('\n');
    
    // Helper function to get position within a bar based on count and current beat
    const getPositionInBar = (count: string, currentBeat: number): number => {
      const beatBase = (currentBeat - 1) * 4; // Each beat has 4 subdivisions
      switch (count) {
        case '1':
        case '2':
        case '3':
        case '4':
          return beatBase;
        case 'e':
          return beatBase + 1;
        case '&':
          return beatBase + 2;
        case 'a':
          return beatBase + 3;
        default:
          return -1;
      }
    };

    // First pass: count total bars to determine pattern length
    let barCount = 0;
    let currentBeat = 1;
    let lastCount = '';
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const columns = line.split(',');
      if (columns.length < 1) continue;
      
      const count = columns[0].trim();
      
      // Track which beat we're on (1, 2, 3, or 4)
      if (count === '1') currentBeat = 1;
      else if (count === '2') currentBeat = 2;
      else if (count === '3') currentBeat = 3;
      else if (count === '4') currentBeat = 4;
      
      // When we see beat '1' after beat '4', we've started a new bar
      if (count === '1' && lastCount === 'a' && currentBeat === 1) {
        barCount++;
      }
      lastCount = count;
    }
    // Add 1 for the final bar
    if (lastCount !== '') barCount++;
    
    const stepsPerBar = 16; // 16 positions per bar (4 beats × 4 subdivisions)
    const patternLength = barCount * stepsPerBar;

    console.log(`Advanced Count CSV Pattern: barCount=${barCount}, patternLength=${patternLength}`);

    const pattern: DrumPattern = {
      'Kick': new Array(patternLength).fill(false),
      'Snare': new Array(patternLength).fill(false),
      'HH Closed': new Array(patternLength).fill(false),
      'HH Open': new Array(patternLength).fill(false),
      'Tom': new Array(patternLength).fill(false),
      'Ghost Note': new Array(patternLength).fill(false),
      subdivisions: new Array(patternLength).fill(''),
      offsets: new Array(patternLength).fill(0),
      sections: new Array(patternLength).fill(''),
      length: patternLength
    };

    // Second pass: parse instrument data
    let currentBar = 0;
    currentBeat = 1;
    lastCount = '';
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length < 2) continue;

      const count = columns[0].trim();
      const instrument1 = columns[1] ? columns[1].trim() : '';
      const instrument2 = columns[2] ? columns[2].trim() : '';
      const section = columns[3] ? columns[3].trim() : '';
      
      // Track which beat we're on (1, 2, 3, or 4)
      if (count === '1') currentBeat = 1;
      else if (count === '2') currentBeat = 2;
      else if (count === '3') currentBeat = 3;
      else if (count === '4') currentBeat = 4;
      
      // When we see beat '1' after beat '4' subdivision 'a', we've started a new bar
      if (count === '1' && lastCount === 'a' && currentBeat === 1 && i > 1) {
        currentBar++;
      }
      lastCount = count;
      
      // Get position within current bar
      const positionInBar = getPositionInBar(count, currentBeat);
      if (positionInBar === -1) continue;
      
      // Calculate absolute step index
      const stepIndex = (currentBar * stepsPerBar) + positionInBar;
      
      if (stepIndex >= patternLength) continue;

      // Debug logging for specific steps
      if (stepIndex === 61 || stepIndex === 73) {
        console.log(`📍 Step ${stepIndex} Debug (CSV line ${i+1}):`);
        console.log(`   count="${count}", bar=${currentBar}, pos=${positionInBar}`);
        console.log(`   Raw columns:`, columns);
        console.log(`   instrument1="${instrument1}", instrument2="${instrument2}"`);
      }

      // Store subdivision label, section, and offset
      (pattern.subdivisions as string[])[stepIndex] = count;
      (pattern.offsets as number[])[stepIndex] = stepIndex / 4; // Quarter beat offset
      (pattern.sections as string[])[stepIndex] = section;

      // Process Instrument 1 column - may contain comma-separated instruments
      if (instrument1) {
        const instruments1 = instrument1.split(',').map(s => s.trim()).filter(Boolean);
        instruments1.forEach(inst => {
          const instrumentKey = normalizeInstrument(inst);
          if (stepIndex === 61 || stepIndex === 73) {
            console.log(`   ✅ Inst1: "${inst}" → "${instrumentKey}" (exists: ${pattern[instrumentKey] !== undefined})`);
          }
          if (pattern[instrumentKey] !== undefined && Array.isArray(pattern[instrumentKey])) {
            (pattern[instrumentKey] as boolean[])[stepIndex] = true;
          }
        });
      }

      // Process Instrument 2 column - may contain comma-separated instruments
      if (instrument2) {
        const instruments2 = instrument2.split(',').map(s => s.trim()).filter(Boolean);
        instruments2.forEach(inst => {
          const instrumentKey = normalizeInstrument(inst);
          if (stepIndex === 61 || stepIndex === 73) {
            console.log(`   ✅ Inst2: "${inst}" → "${instrumentKey}" (exists: ${pattern[instrumentKey] !== undefined})`);
          }
          if (pattern[instrumentKey] !== undefined && Array.isArray(pattern[instrumentKey])) {
            (pattern[instrumentKey] as boolean[])[stepIndex] = true;
          }
        });
      }
    }

    console.log(`🎵 Pattern loaded. Step 66 - Tom: ${pattern['Tom'][66]}, HH Open: ${pattern['HH Open'][66]}`);

    return pattern;
  };

  const loadPatternFromFile = async (): Promise<DrumPattern> => {
    const baseUrl = import.meta.env.BASE_URL || '';
    
    // Try the advanced beat count format first (supports multiple instruments per step)
    const filesToTry = [
      'sweet_child_o_mine_drums_16th_beats-2.csv',
      'sweet_child_o_mine_drums_16th_beats.csv',
      'come_as_you_are_drums_quarter_beats_with_subdivision_type-6.csv',
      'come_as_you_are_drums_quarter_beats_with_subdivision_type-5.csv',
      'come_as_you_are_drums_beat_count_advanced.csv',
      'come_as_you_are_drums_quarter_beats_with_subdivision.csv',
      'come_as_you_are_corrected_mapping-2.csv',
      'come_as_you_are_corrected_mapping.csv',
      'come_as_you_are_all_beats_full_-no_offset.csv',
      'come_as_you_are_full_structure.csv',
      'come_as_you_are_converted_from_txt.csv'
    ];
    
    for (const fileName of filesToTry) {
      try {
        const response = await fetch(`${baseUrl}patterns/${fileName}`);
        if (response.ok) {
          const csvContent = await response.text();
          console.log(`Loaded pattern from: ${fileName}`);
          return loadPatternFromNewCSV(csvContent);
        }
      } catch (err) {
        console.log(`Failed to load ${fileName}, trying next...`);
      }
    }
    
    const errorMessage = 'Failed to load any pattern files';
    setError(errorMessage);
    throw new Error(errorMessage);
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