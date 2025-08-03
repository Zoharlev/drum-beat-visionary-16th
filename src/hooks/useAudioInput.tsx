import { useState, useRef, useCallback, useEffect } from 'react';

interface AudioInputConfig {
  sampleRate: number;
  fftSize: number;
  bufferSize: number;
}

export const useAudioInput = (config: AudioInputConfig = {
  sampleRate: 44100,
  fftSize: 2048,
  bufferSize: 4096
}) => {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const processAudioData = useCallback((audioBuffer: Float32Array) => {
    // Calculate RMS (Root Mean Square) for audio level
    let sum = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      sum += audioBuffer[i] * audioBuffer[i];
    }
    const rms = Math.sqrt(sum / audioBuffer.length);
    setAudioLevel(rms);

    return {
      audioBuffer,
      rms,
      timestamp: Date.now()
    };
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: config.sampleRate,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      mediaStreamRef.current = stream;
      
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: config.sampleRate
      });
      audioContextRef.current = audioContext;

      // Create analyser for frequency analysis
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = config.fftSize;
      analyser.smoothingTimeConstant = 0.1;
      analyserRef.current = analyser;

      // Create source from microphone
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create script processor for audio data
      const processor = audioContext.createScriptProcessor(config.bufferSize, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const audioData = inputBuffer.getChannelData(0);
        
        // Process the audio data
        const processedData = processAudioData(new Float32Array(audioData));
        
        // Dispatch custom event with audio data
        window.dispatchEvent(new CustomEvent('audioData', { 
          detail: processedData 
        }));
      };

      // Connect the audio graph
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      
    } catch (err) {
      console.error('Error starting audio input:', err);
      setError(err instanceof Error ? err.message : 'Failed to start audio input');
    }
  }, [config, processAudioData]);

  const stopListening = useCallback(() => {
    try {
      // Stop animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Disconnect audio nodes
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      setIsListening(false);
      setAudioLevel(0);
      setError(null);
      
    } catch (err) {
      console.error('Error stopping audio input:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop audio input');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    audioLevel,
    error,
    startListening,
    stopListening
  };
};