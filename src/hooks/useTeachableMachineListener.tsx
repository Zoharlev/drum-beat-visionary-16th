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
      
      classifierRef.current = await window.ml5.soundClassifier(modelURL, () => {
        console.log('Teachable Machine model loaded successfully');
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
    const normalizedLabel = label.toLowerCase();
    
    // Direct mappings for common drum sounds
    if (normalizedLabel.includes('kick')) return 'kick';
    if (normalizedLabel.includes('snare')) return 'snare';
    if (normalizedLabel.includes('hihat') || normalizedLabel.includes('hi-hat')) return 'hihat';
    
    // Map cymbal sounds to openhat
    if (normalizedLabel.includes('crash') || 
        normalizedLabel.includes('splash') || 
        normalizedLabel.includes('ride') ||
        normalizedLabel.includes('openhat') || 
        normalizedLabel.includes('open-hat')) return 'openhat';
    
    // Map tom sounds to kick for now (could be expanded later)
    if (normalizedLabel.includes('tom') || 
        normalizedLabel.includes('floor tom') || 
        normalizedLabel.includes('high tom') || 
        normalizedLabel.includes('mid tom')) return 'kick';
    
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
          const level = average / 255;
          setAudioLevel(level);
          
          // Debug audio level (log every 100th frame to avoid spam)
          if (Math.random() < 0.01) {
            console.log('Audio level:', level.toFixed(3));
          }
          
          requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();

      // Setup classification callback for Teachable Machine model
      classifierRef.current.classifyStart((error: any, results: any[]) => {
        if (error) {
          console.error('Classification error:', error);
          return;
        }

        if (results && results.length > 0) {
          const topResult = results[0];
          const drumType = mapLabelToDrumType(topResult.label);
          
          // Lower confidence threshold to 0.35 for better detection
          if (drumType && topResult.confidence > 0.35) {
            console.log(`🥁 Beat detected: ${drumType} (${topResult.label}) - confidence: ${topResult.confidence.toFixed(3)}`);
            
            const detection: DrumDetection = {
              timestamp: Date.now(),
              confidence: topResult.confidence,
              type: drumType
            };

            setDetectedBeats(prev => {
              const filtered = prev.filter(beat => Date.now() - beat.timestamp < 10000);
              return [...filtered, detection].slice(-50);
            });
          } else if (topResult.confidence > 0.2) {
            // Debug log for near misses
            console.log(`Near miss: ${topResult.label} - confidence: ${topResult.confidence.toFixed(3)} (mapped to: ${drumType || 'none'})`);
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

    if (classifierRef.current && classifierRef.current.classifyStop) {
      classifierRef.current.classifyStop();
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