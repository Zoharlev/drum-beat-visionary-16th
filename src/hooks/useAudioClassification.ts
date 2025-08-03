import { useState, useRef, useCallback } from 'react';
import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js to always download models
env.allowLocalModels = false;
env.useBrowserCache = false;

interface AudioClassificationResult {
  label: string;
  confidence: number;
}

export const useAudioClassification = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [detectedDrum, setDetectedDrum] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const classifierRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  // Map ML model predictions to drum names
  const mapToDrumName = (label: string): string => {
    const drumMappings: { [key: string]: string } = {
      'bass': 'Kick',
      'kick': 'Kick',
      'snare': 'Snare',
      'hihat': 'Hi-Hat',
      'hi-hat': 'Hi-Hat',
      'cymbal': 'Open Hat',
      'crash': 'Open Hat',
      'tom': 'Tom',
      'clap': 'Snare',
      'percussion': 'Percussion'
    };

    const lowerLabel = label.toLowerCase();
    for (const [key, drumName] of Object.entries(drumMappings)) {
      if (lowerLabel.includes(key)) {
        return drumName;
      }
    }
    return 'Unknown';
  };

  const initializeModel = useCallback(async () => {
    if (isInitialized) return;
    
    setIsLoading(true);
    try {
      console.log('Initializing audio classification model...');
      
      // Use a general audio classification model
      classifierRef.current = await pipeline(
        'audio-classification',
        'Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech', // Simple model for proof of concept
        { device: 'webgpu' }
      );
      
      setIsInitialized(true);
      console.log('Audio classification model initialized');
    } catch (error) {
      console.error('Failed to initialize model:', error);
      // Fallback to a simpler approach with audio analysis
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  const analyzeAudioBuffer = useCallback(async (audioBuffer: AudioBuffer) => {
    try {
      // Simple frequency analysis for drum detection
      const channelData = audioBuffer.getChannelData(0);
      const fftSize = 2048;
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Create a buffer source and connect it
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      
      // Get frequency data
      analyser.getByteFrequencyData(dataArray);
      
      // Analyze frequencies to detect drum type
      let maxAmplitude = 0;
      let dominantFrequency = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxAmplitude) {
          maxAmplitude = dataArray[i];
          dominantFrequency = i * audioContext.sampleRate / 2 / bufferLength;
        }
      }
      
      // Simple frequency-based drum classification
      let drumType = 'Unknown';
      const confidence = Math.min(maxAmplitude / 255, 1);
      
      if (dominantFrequency < 100) {
        drumType = 'Kick';
      } else if (dominantFrequency >= 100 && dominantFrequency < 300) {
        drumType = 'Snare';
      } else if (dominantFrequency >= 5000) {
        drumType = 'Hi-Hat';
      } else if (dominantFrequency >= 300 && dominantFrequency < 1000) {
        drumType = 'Tom';
      } else if (dominantFrequency >= 1000 && dominantFrequency < 5000) {
        drumType = 'Open Hat';
      }
      
      // Only update if confidence is high enough
      if (confidence > 0.3) {
        setDetectedDrum(drumType);
        setConfidence(confidence);
      }
      
      audioContext.close();
    } catch (error) {
      console.error('Error analyzing audio:', error);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isListening) return;
    
    try {
      await initializeModel();
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      
      streamRef.current = stream;
      
      // Create audio context for real-time analysis
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create analyser for frequency analysis
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      source.connect(analyserRef.current);
      
      setIsListening(true);
      
      // Start real-time analysis
      const analyze = () => {
        if (!analyserRef.current || !isListening) return;
        
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Look for peaks that might indicate drum hits
        let maxAmplitude = 0;
        let dominantFrequency = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > maxAmplitude) {
            maxAmplitude = dataArray[i];
            dominantFrequency = i * (audioContextRef.current?.sampleRate || 44100) / 2 / bufferLength;
          }
        }
        
        // Detect drum hits based on amplitude threshold
        if (maxAmplitude > 100) { // Threshold for drum hit detection
          let drumType = 'Unknown';
          const confidence = Math.min(maxAmplitude / 255, 1);
          
          // Frequency-based classification
          if (dominantFrequency < 100) {
            drumType = 'Kick';
          } else if (dominantFrequency >= 100 && dominantFrequency < 300) {
            drumType = 'Snare';
          } else if (dominantFrequency >= 5000) {
            drumType = 'Hi-Hat';
          } else if (dominantFrequency >= 300 && dominantFrequency < 1000) {
            drumType = 'Tom';
          } else if (dominantFrequency >= 1000 && dominantFrequency < 5000) {
            drumType = 'Open Hat';
          }
          
          setDetectedDrum(drumType);
          setConfidence(confidence);
          
          // Clear detection after a short delay
          setTimeout(() => {
            setDetectedDrum('');
            setConfidence(0);
          }, 1000);
        }
        
        animationFrameRef.current = requestAnimationFrame(analyze);
      };
      
      analyze();
      
    } catch (error) {
      console.error('Error starting audio classification:', error);
      setIsListening(false);
    }
  }, [isListening, initializeModel]);

  const stopListening = useCallback(() => {
    if (!isListening) return;
    
    setIsListening(false);
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Clear detection state
    setDetectedDrum('');
    setConfidence(0);
  }, [isListening]);

  return {
    isInitialized,
    isListening,
    detectedDrum,
    confidence,
    isLoading,
    startListening,
    stopListening,
    initializeModel
  };
};