import { useState, useEffect, useRef, useCallback } from 'react';

interface BeatDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'beat';
}

export const useAudioClassification = () => {
  const [isListening, setIsListening] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<BeatDetection[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastBeatTimeRef = useRef<number>(0);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });
      
      mediaStreamRef.current = stream;

      // Create audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      // Configure analyser for beat detection
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);
      analyzeAudio();
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    setIsListening(false);
    setAudioLevel(0);
  }, []);

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const freqData = new Float32Array(bufferLength);
    
    analyserRef.current.getByteTimeDomainData(dataArray);
    analyserRef.current.getFloatFrequencyData(freqData);

    // Calculate RMS for audio level display
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);
    setAudioLevel(Math.min(rms * 10, 1)); // Scale and clamp

    // Frequency analysis for beat detection
    const currentTime = Date.now();
    
    // Define frequency ranges for different drum sounds
    const kickRange = { start: 1, end: 10 };    // ~20-200Hz (low freq)
    const snareRange = { start: 40, end: 120 }; // ~800-2400Hz (mid freq)
    const hihatRange = { start: 200, end: 400 }; // ~4000-8000Hz (high freq)

    // Calculate energy in each frequency range
    const kickEnergy = calculateEnergyInRange(freqData, kickRange);
    const snareEnergy = calculateEnergyInRange(freqData, snareRange);
    const hihatEnergy = calculateEnergyInRange(freqData, hihatRange);
    const totalEnergy = kickEnergy + snareEnergy + hihatEnergy;

    // Beat detection thresholds (further lowered for more sensitivity)
    const kickThreshold = -50;
    const snareThreshold = -55;
    const hihatThreshold = -60;
    const generalThreshold = -45;
    
    // Minimum time between beats to avoid double detection
    const minTimeBetweenBeats = 100;
    const timeSinceLastBeat = currentTime - lastBeatTimeRef.current;

    if (timeSinceLastBeat > minTimeBetweenBeats) {
      let detectedBeat: BeatDetection | null = null;

      // Check for specific drum types
      if (kickEnergy > kickThreshold) {
        detectedBeat = {
          timestamp: currentTime,
          confidence: Math.min((kickEnergy + 50) / 20, 1),
          type: 'kick'
        };
      } else if (snareEnergy > snareThreshold) {
        detectedBeat = {
          timestamp: currentTime,
          confidence: Math.min((snareEnergy + 55) / 15, 1),
          type: 'snare'
        };
      } else if (hihatEnergy > hihatThreshold) {
        detectedBeat = {
          timestamp: currentTime,
          confidence: Math.min((hihatEnergy + 60) / 10, 1),
          type: 'hihat'
        };
      } else if (totalEnergy > generalThreshold) {
        detectedBeat = {
          timestamp: currentTime,
          confidence: Math.min((totalEnergy + 45) / 20, 1),
          type: 'beat'
        };
      }

      if (detectedBeat) {
        console.log('Simple model beat detected:', detectedBeat, {
          kickEnergy: kickEnergy.toFixed(2),
          snareEnergy: snareEnergy.toFixed(2), 
          hihatEnergy: hihatEnergy.toFixed(2),
          totalEnergy: totalEnergy.toFixed(2)
        });
        setDetectedBeats(prev => [...prev.slice(-19), detectedBeat]); // Keep last 20 beats
        lastBeatTimeRef.current = currentTime;
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, []);

  const calculateEnergyInRange = (freqData: Float32Array, range: { start: number; end: number }) => {
    let energy = 0;
    for (let i = range.start; i < Math.min(range.end, freqData.length); i++) {
      energy += freqData[i];
    }
    return energy / (range.end - range.start);
  };

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
    startListening,
    stopListening,
    clearBeats
  };
};