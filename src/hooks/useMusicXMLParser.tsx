import { useState } from 'react';

interface MusicXMLNote {
  instrument: string;
  beat: number;
  duration: number;
  velocity?: number;
}

interface DrumPattern {
  [key: string]: boolean[] | number;
  length: number;
}

// Map MusicXML drum instruments to our drum types
const musicXMLDrumMap: Record<string, string> = {
  'bass-drum': 'Kick',
  'bass-drum-1': 'Kick',
  'kick-drum': 'Kick',
  'snare-drum': 'Snare',
  'snare': 'Snare',
  'hi-hat': 'Hi-Hat',
  'closed-hi-hat': 'Hi-Hat',
  'open-hi-hat': 'openhat',
  'crash-cymbal': 'crash',
  'ride-cymbal': 'ride',
  'tom': 'tom',
  'high-tom': 'tom',
  'mid-tom': 'tom',
  'low-tom': 'tom',
};

export const useMusicXMLParser = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractMXL = async (mxlData: ArrayBuffer): Promise<string> => {
    try {
      // MXL files are ZIP archives containing MusicXML
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const zipFile = await zip.loadAsync(mxlData);
      
      // Look for the main MusicXML file
      const xmlFiles = Object.keys(zipFile.files).filter(name => 
        name.endsWith('.xml') && !name.includes('META-INF')
      );
      
      if (xmlFiles.length === 0) {
        throw new Error('No MusicXML file found in MXL archive');
      }
      
      // Use the first XML file found
      const xmlContent = await zipFile.file(xmlFiles[0])?.async('string');
      if (!xmlContent) {
        throw new Error('Failed to extract MusicXML content');
      }
      
      return xmlContent;
    } catch (err) {
      throw new Error('Failed to extract MXL file: ' + (err as Error).message);
    }
  };

  const parseMusicXML = (xmlContent: string): MusicXMLNote[] => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid MusicXML format');
    }

    const notes: MusicXMLNote[] = [];
    const parts = xmlDoc.querySelectorAll('part');
    
    for (const part of parts) {
      const measures = part.querySelectorAll('measure');
      let currentBeat = 0;
      let beatsPerMeasure = 4; // Default
      let divisions = 1; // Default
      
      for (const measure of measures) {
        // Get time signature and divisions
        const time = measure.querySelector('time');
        if (time) {
          const beats = time.querySelector('beats')?.textContent;
          if (beats) beatsPerMeasure = parseInt(beats);
        }
        
        const divisionsElement = measure.querySelector('divisions');
        if (divisionsElement) {
          divisions = parseInt(divisionsElement.textContent || '1');
        }
        
        const noteElements = measure.querySelectorAll('note');
        
        for (const noteElement of noteElements) {
          // Skip rests
          if (noteElement.querySelector('rest')) {
            const duration = parseInt(noteElement.querySelector('duration')?.textContent || '0');
            currentBeat += duration / divisions;
            continue;
          }
          
          // Get instrument info
          const unpitched = noteElement.querySelector('unpitched');
          const pitch = noteElement.querySelector('pitch');
          
          let instrumentName = '';
          
          if (unpitched) {
            // Unpitched percussion
            const displayStep = unpitched.querySelector('display-step')?.textContent;
            const displayOctave = unpitched.querySelector('display-octave')?.textContent;
            
            // Map based on MIDI drum mapping or instrument element
            const instrument = noteElement.querySelector('instrument');
            if (instrument) {
              const instrumentId = instrument.getAttribute('id');
              // Try to find instrument name from score-instrument
              const scoreInstrument = xmlDoc.querySelector(`score-instrument[id="${instrumentId}"]`);
              if (scoreInstrument) {
                instrumentName = scoreInstrument.querySelector('instrument-name')?.textContent?.toLowerCase() || '';
              }
            }
            
            // Fallback to display step mapping
            if (!instrumentName) {
              if (displayStep === 'C' || displayStep === 'B') instrumentName = 'kick-drum';
              else if (displayStep === 'D') instrumentName = 'snare-drum';
              else if (displayStep === 'F' || displayStep === 'G') instrumentName = 'hi-hat';
            }
          } else if (pitch) {
            // Pitched percussion (less common for drums)
            const step = pitch.querySelector('step')?.textContent;
            const octave = parseInt(pitch.querySelector('octave')?.textContent || '4');
            
            // Map based on MIDI note numbers for standard drum kit
            if (step === 'C' && octave <= 2) instrumentName = 'kick-drum';
            else if (step === 'D' && octave === 4) instrumentName = 'snare-drum';
            else if (step === 'F' && octave >= 4) instrumentName = 'hi-hat';
          }
          
          if (instrumentName) {
            const duration = parseInt(noteElement.querySelector('duration')?.textContent || '0');
            const velocity = parseInt(noteElement.querySelector('dynamics velocity')?.textContent || '64');
            
            notes.push({
              instrument: instrumentName,
              beat: currentBeat,
              duration: duration / divisions,
              velocity
            });
          }
          
          // Advance beat position
          const duration = parseInt(noteElement.querySelector('duration')?.textContent || '0');
          currentBeat += duration / divisions;
        }
      }
    }
    
    return notes;
  };

  const convertToPattern = (notes: MusicXMLNote[]): DrumPattern => {
    if (notes.length === 0) {
      return { length: 16 };
    }
    
    // Find the total length in beats
    const maxBeat = Math.max(...notes.map(note => note.beat + note.duration));
    const patternLength = Math.max(16, Math.ceil(maxBeat * 4)); // 4 steps per beat
    
    // Initialize pattern
    const pattern: DrumPattern = { length: patternLength };
    const instrumentsFound = new Set<string>();
    
    // Map instruments and collect unique types
    notes.forEach(note => {
      const drumType = musicXMLDrumMap[note.instrument] || note.instrument;
      instrumentsFound.add(drumType);
    });
    
    // Initialize arrays for each instrument
    instrumentsFound.forEach(instrument => {
      pattern[instrument] = new Array(patternLength).fill(false);
    });
    
    // Place notes in the pattern
    notes.forEach(note => {
      const drumType = musicXMLDrumMap[note.instrument] || note.instrument;
      if (pattern[drumType]) {
        const stepIndex = Math.round(note.beat * 4); // 4 steps per beat
        if (stepIndex >= 0 && stepIndex < patternLength) {
          (pattern[drumType] as boolean[])[stepIndex] = true;
        }
      }
    });
    
    return pattern;
  };

  const convertToCSV = (notes: MusicXMLNote[]): string => {
    let csv = 'Part,Offset (Beat),Duration (Quarter),Drum Component\n';
    
    notes.forEach(note => {
      const drumComponent = musicXMLDrumMap[note.instrument] || note.instrument;
      // Map back to single letter codes for compatibility
      let code = drumComponent;
      if (drumComponent === 'Kick') code = 'F';
      else if (drumComponent === 'Snare') code = 'C';
      else if (drumComponent === 'Hi-Hat') code = 'D';
      else if (drumComponent === 'openhat') code = 'A';
      
      csv += `Voice,${note.beat},${note.duration},${code}\n`;
    });
    
    return csv;
  };

  const parseFromMXL = async (file: File): Promise<{ pattern: DrumPattern; csv: string }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const xmlContent = await extractMXL(arrayBuffer);
      const notes = parseMusicXML(xmlContent);
      const pattern = convertToPattern(notes);
      const csv = convertToCSV(notes);
      
      return { pattern, csv };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse MXL file';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const parseFromMXLPath = async (filePath: string): Promise<{ pattern: DrumPattern; csv: string }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch MXL file: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const xmlContent = await extractMXL(arrayBuffer);
      const notes = parseMusicXML(xmlContent);
      const pattern = convertToPattern(notes);
      const csv = convertToCSV(notes);
      
      return { pattern, csv };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse MXL file';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    parseFromMXL,
    parseFromMXLPath,
    isLoading,
    error
  };
};