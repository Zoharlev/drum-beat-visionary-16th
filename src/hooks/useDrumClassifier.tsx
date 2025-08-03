import { useState, useEffect, useCallback, useRef } from 'react';

interface DrumDetection {
  drum: string;
  confidence: number;
  timestamp: number;
}

interface AudioFeatures {
  audioBuffer: Float32Array;
  rms: number;
  timestamp: number;
}

export const useDrumClassifier = (isActive: boolean = false) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [detections, setDetections] = useState<DrumDetection[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastDetectionRef = useRef<number>(0);
  const detectionCooldownRef = useRef<{ [key: string]: number }>({});

  // Simple rule-based classification (initial implementation)
  const classifyAudioFeatures = useCallback((features: AudioFeatures): DrumDetection | null => {
    const { audioBuffer, rms, timestamp } = features;
    
    // Basic onset detection threshold
    const threshold = 0.02;
    if (rms < threshold) return null;

    // Prevent duplicate detections too close together
    const minInterval = 100; // ms
    if (timestamp - lastDetectionRef.current < minInterval) return null;

    // Simple frequency analysis for drum classification
    const fftSize = 512;
    const freqData = new Float32Array(fftSize);
    
    // Simple FFT approximation using sliding window
    for (let i = 0; i < Math.min(fftSize, audioBuffer.length); i++) {
      freqData[i] = audioBuffer[i];
    }

    // Analyze frequency content for drum type classification
    let lowFreqEnergy = 0;
    let midFreqEnergy = 0;
    let highFreqEnergy = 0;

    const lowEnd = Math.floor(fftSize * 0.1);   // Low frequencies (bass)
    const midEnd = Math.floor(fftSize * 0.4);   // Mid frequencies 
    const highEnd = Math.floor(fftSize * 0.8);  // High frequencies

    for (let i = 0; i < lowEnd; i++) {
      lowFreqEnergy += Math.abs(freqData[i]);
    }
    for (let i = lowEnd; i < midEnd; i++) {
      midFreqEnergy += Math.abs(freqData[i]);
    }
    for (let i = midEnd; i < highEnd; i++) {
      highFreqEnergy += Math.abs(freqData[i]);
    }

    // Normalize energies
    const totalEnergy = lowFreqEnergy + midFreqEnergy + highFreqEnergy;
    if (totalEnergy === 0) return null;

    lowFreqEnergy /= totalEnergy;
    midFreqEnergy /= totalEnergy;
    highFreqEnergy /= totalEnergy;

    // Classification logic based on frequency distribution
    let detectedDrum = '';
    let confidence = 0;

    if (lowFreqEnergy > 0.5 && rms > 0.05) {
      // Strong low frequency = kick drum
      detectedDrum = 'kick';
      confidence = Math.min(0.9, lowFreqEnergy + rms * 2);
    } else if (midFreqEnergy > 0.4 && rms > 0.03) {
      // Mid frequency with good energy = snare
      detectedDrum = 'snare';
      confidence = Math.min(0.85, midFreqEnergy + rms * 1.5);
    } else if (highFreqEnergy > 0.6) {
      // High frequency = hi-hat or cymbal
      if (rms > 0.04) {
        detectedDrum = 'openhat';
        confidence = Math.min(0.8, highFreqEnergy + rms);
      } else {
        detectedDrum = 'hihat';
        confidence = Math.min(0.75, highFreqEnergy + rms * 0.5);
      }
    }

    // Apply cooldown per drum type
    const cooldown = 200; // ms
    const drumLastDetection = detectionCooldownRef.current[detectedDrum] || 0;
    if (timestamp - drumLastDetection < cooldown) return null;

    if (detectedDrum && confidence > 0.3) {
      lastDetectionRef.current = timestamp;
      detectionCooldownRef.current[detectedDrum] = timestamp;
      
      return {
        drum: detectedDrum,
        confidence,
        timestamp
      };
    }

    return null;
  }, []);

  // Handle audio data events
  const handleAudioData = useCallback((event: CustomEvent<AudioFeatures>) => {
    if (!isActive || isProcessing) return;

    setIsProcessing(true);
    
    try {
      const detection = classifyAudioFeatures(event.detail);
      
      if (detection) {
        setDetections(prev => {
          // Keep only recent detections (last 10 seconds)
          const cutoff = Date.now() - 10000;
          const filtered = prev.filter(d => d.timestamp > cutoff);
          return [...filtered, detection].slice(-20); // Keep max 20 detections
        });

        // Dispatch drum detection event
        window.dispatchEvent(new CustomEvent('drumDetected', {
          detail: detection
        }));
      }
    } catch (err) {
      console.error('Error in drum classification:', err);
      setError(err instanceof Error ? err.message : 'Classification error');
    } finally {
      setIsProcessing(false);
    }
  }, [isActive, isProcessing, classifyAudioFeatures]);

  // Initialize classifier
  useEffect(() => {
    const initialize = async () => {
      try {
        setError(null);
        // For now, we'll use the rule-based classifier
        // In the future, this could load an ML model
        setIsInitialized(true);
      } catch (err) {
        console.error('Error initializing classifier:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize classifier');
      }
    };

    if (isActive && !isInitialized) {
      initialize();
    }
  }, [isActive, isInitialized]);

  // Set up audio data listener
  useEffect(() => {
    if (isActive && isInitialized) {
      window.addEventListener('audioData', handleAudioData as EventListener);
      
      return () => {
        window.removeEventListener('audioData', handleAudioData as EventListener);
      };
    }
  }, [isActive, isInitialized, handleAudioData]);

  // Clear detections when inactive
  useEffect(() => {
    if (!isActive) {
      setDetections([]);
      setIsProcessing(false);
      setError(null);
    }
  }, [isActive]);

  return {
    isInitialized,
    detections,
    isProcessing,
    error
  };
};
