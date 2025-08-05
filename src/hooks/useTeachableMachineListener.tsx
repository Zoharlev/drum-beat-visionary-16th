import { useState, useRef, useCallback, useEffect } from 'react';

declare global {
  interface Window {
    ml5: any;
  }
}

export interface DrumDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'openhat';
}

export const useTeachableMachineListener = () => {
  const [isListening, setIsListening] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<DrumDetection[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const classifierRef = useRef<any>(null);

  // Load ml5 script and initialize model
  const initializeModel = useCallback(async () => {
    try {
      setIsModelLoading(true);
      setError(null);

      // Load ml5 if not already loaded
      if (!window.ml5) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/ml5@latest/dist/ml5.min.js';
        script.async = true;
        
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Wait for ml5 to be ready
      await new Promise((resolve) => {
        if (window.ml5) {
          resolve(true);
        } else {
          const checkMl5 = () => {
            if (window.ml5) {
              resolve(true);
            } else {
              setTimeout(checkMl5, 100);
            }
          };
          checkMl5();
        }
      });

      // Initialize the sound classifier with the Teachable Machine model
      const modelURL = 'https://teachablemachine.withgoogle.com/models/bYQl7b5QM/model.json';
      
      classifierRef.current = await window.ml5.soundClassifier(modelURL, {
        probabilityThreshold: 0.7
      });

      setIsModelLoading(false);
    } catch (err) {
      console.error('Error initializing model:', err);
      setError('Failed to load the audio classification model');
      setIsModelLoading(false);
    }
  }, []);

  // Map model labels to drum types
  const mapLabelToDrumType = (label: string): 'kick' | 'snare' | 'hihat' | 'openhat' | null => {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('kick') || lowerLabel.includes('bass')) return 'kick';
    if (lowerLabel.includes('snare')) return 'snare';
    if (lowerLabel.includes('hihat') || lowerLabel.includes('hi-hat')) return 'hihat';
    if (lowerLabel.includes('open') || lowerLabel.includes('crash')) return 'openhat';
    return null;
  };

  const startListening = useCallback(async () => {
    try {
      setError(null);
      
      if (!classifierRef.current) {
        await initializeModel();
        if (!classifierRef.current) {
          throw new Error('Model not loaded');
        }
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      mediaStreamRef.current = stream;

      // Setup audio context for level monitoring
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Start audio level monitoring
      const updateAudioLevel = () => {
        if (analyserRef.current && isListening) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          setAudioLevel(average / 255);
          requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();

      // Setup classification callback
      classifierRef.current.classify((error: any, results: any[]) => {
        if (error) {
          console.error('Classification error:', error);
          return;
        }

        if (results && results.length > 0) {
          const topResult = results[0];
          const drumType = mapLabelToDrumType(topResult.label);
          
          if (drumType && topResult.confidence > 0.7) {
            const detection: DrumDetection = {
              timestamp: Date.now(),
              confidence: topResult.confidence,
              type: drumType
            };

            setDetectedBeats(prev => {
              const filtered = prev.filter(beat => Date.now() - beat.timestamp < 10000);
              return [...filtered, detection].slice(-50);
            });
          }
        }
      });

      setIsListening(true);
    } catch (err) {
      console.error('Error starting listener:', err);
      setError(err instanceof Error ? err.message : 'Failed to start audio listening');
    }
  }, [initializeModel, isListening]);

  const stopListening = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (classifierRef.current && classifierRef.current.classify) {
      classifierRef.current.classify(false);
    }

    analyserRef.current = null;
    setIsListening(false);
    setAudioLevel(0);
  }, []);

  const clearBeats = useCallback(() => {
    setDetectedBeats([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    detectedBeats,
    audioLevel,
    error,
    isModelLoading,
    startListening,
    stopListening,
    clearBeats
  };
};