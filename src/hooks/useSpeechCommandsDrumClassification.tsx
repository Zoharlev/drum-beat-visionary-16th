import { useState, useEffect, useRef, useCallback } from 'react';
import * as speechCommands from '@tensorflow-models/speech-commands';

interface DrumDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'openhat';
  modelPredictions?: any;
}

export const useSpeechCommandsDrumClassification = () => {
  const [isListening, setIsListening] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<DrumDetection[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const recognizerRef = useRef<speechCommands.SpeechCommandRecognizer | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Teachable Machine model URL
  const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/X4kj9rYWZ/';

  // Class mapping from Teachable Machine to drum types
  const classMapping: Record<string, 'kick' | 'snare' | 'hihat' | 'openhat'> = {
    'Background Noise': 'kick', // Map background noise to kick as fallback
    'Hi Hat': 'hihat',
    'Kick': 'kick',
    'Snare': 'snare',
    'background noise': 'kick',
    'hi hat': 'hihat',
    'kick': 'kick',
    'snare': 'snare'
  };

  // Initialize the Speech Commands model
  const initializeModel = useCallback(async () => {
    try {
      setError(null);
      setLoadingProgress(20);
      setIsModelLoaded(false);

      console.log('Loading Speech Commands model...');
      
      const checkpointURL = MODEL_URL + 'model.json';
      const metadataURL = MODEL_URL + 'metadata.json';
      
      setLoadingProgress(40);
      
      // Create speech commands recognizer
      const recognizer = speechCommands.create(
        'BROWSER_FFT', // fourier transform type
        undefined, // speech commands vocabulary feature
        checkpointURL,
        metadataURL
      );
      
      setLoadingProgress(70);
      
      // Ensure model is loaded
      await recognizer.ensureModelLoaded();
      
      recognizerRef.current = recognizer;
      
      setIsModelLoaded(true);
      setLoadingProgress(100);
      console.log('Speech Commands model loaded successfully');
      console.log('Class labels:', recognizer.wordLabels());

    } catch (err) {
      console.error('Error initializing Speech Commands model:', err);
      setError('Failed to load Speech Commands model. Please check network connection.');
    }
  }, []);

  // Initialize model when hook mounts
  useEffect(() => {
    initializeModel();
  }, [initializeModel]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      
      if (!isModelLoaded || !recognizerRef.current) {
        setError('Model not loaded yet');
        return;
      }

      // Get microphone access for audio level monitoring
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } 
      });
      
      mediaStreamRef.current = stream;

      // Create audio context for level monitoring
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start audio level monitoring
      monitorAudioLevel();

      // Start speech commands listening
      recognizerRef.current.listen(async (result) => {
        const scores = result.scores;
        const classLabels = recognizerRef.current?.wordLabels() || [];
        
        // Find the highest confidence prediction
        let maxScore = 0;
        let maxIndex = 0;
        
        for (let i = 0; i < scores.length; i++) {
          const score = Array.isArray(scores) ? scores[i] : scores;
          const scoreValue = typeof score === 'number' ? score : score[0];
          if (scoreValue > maxScore) {
            maxScore = scoreValue;
            maxIndex = i;
          }
        }

        // Only proceed if confidence is high enough
        if (maxScore > 0.7) {
          const predictedClass = classLabels[maxIndex];
          
          // Map the predicted class to drum type
          const drumType = classMapping[predictedClass] || classMapping[predictedClass?.toLowerCase()];
          
          if (drumType && predictedClass !== 'Background Noise' && predictedClass !== 'background noise') {
            const detection: DrumDetection = {
              timestamp: Date.now(),
              confidence: maxScore,
              type: drumType,
              modelPredictions: {
                model: 'speech-commands',
                originalLabel: predictedClass,
                allPredictions: classLabels.map((label, index) => {
                  const score = Array.isArray(scores) ? scores[index] : scores;
                  const scoreValue = typeof score === 'number' ? score : score[0];
                  return {
                    label,
                    score: scoreValue
                  };
                }).slice(0, 5)
              }
            };

            console.log('Drum detected with Speech Commands:', detection);
            setDetectedBeats(prev => [...prev.slice(-19), detection]);
          }
        }
      }, {
        includeSpectrogram: true,
        probabilityThreshold: 0.75,
        invokeCallbackOnNoiseAndUnknown: true,
        overlapFactor: 0.50
      });

      setIsListening(true);
      
    } catch (err) {
      console.error('Error starting speech commands listening:', err);
      setError('Could not access microphone or start listening. Please check permissions.');
    }
  }, [isModelLoaded]);

  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isListening) return;

    const bufferLength = analyserRef.current.fftSize;
    const dataArray = new Float32Array(bufferLength);
    
    analyserRef.current.getFloatTimeDomainData(dataArray);

    // Calculate audio level for visualization
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength);
    setAudioLevel(Math.min(rms * 50, 1));

    if (isListening) {
      requestAnimationFrame(monitorAudioLevel);
    }
  }, [isListening]);

  const stopListening = useCallback(async () => {
    setIsListening(false);
    
    if (recognizerRef.current) {
      try {
        recognizerRef.current.stopListening();
      } catch (err) {
        console.warn('Error stopping speech commands recognizer:', err);
      }
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
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
    isModelLoaded,
    loadingProgress,
    modelType: 'speech-commands' as const,
    startListening,
    stopListening,
    clearBeats
  };
};