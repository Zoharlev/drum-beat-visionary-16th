import { useEffect, useRef, useState } from 'react';

export interface AudioInputHook {
  isRecording: boolean;
  audioLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  getAudioData: () => Float32Array | null;
}

export const useAudioInput = (): AudioInputHook => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Float32Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      
      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 44100 });
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.3;
      
      source.connect(analyserRef.current);
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Float32Array(bufferLength);
      
      setIsRecording(true);
      
      // Start audio level monitoring
      const updateAudioLevel = () => {
        if (analyserRef.current && dataArrayRef.current) {
          analyserRef.current.getFloatTimeDomainData(dataArrayRef.current);
          
          // Calculate RMS (Root Mean Square) for audio level
          let sum = 0;
          for (let i = 0; i < dataArrayRef.current.length; i++) {
            sum += dataArrayRef.current[i] * dataArrayRef.current[i];
          }
          const rms = Math.sqrt(sum / dataArrayRef.current.length);
          setAudioLevel(Math.min(rms * 10, 1)); // Normalize to 0-1 range
        }
        
        if (isRecording) {
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      
      updateAudioLevel();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  };

  const stopRecording = () => {
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
    dataArrayRef.current = null;
    setIsRecording(false);
    setAudioLevel(0);
  };

  const getAudioData = (): Float32Array | null => {
    if (analyserRef.current && dataArrayRef.current) {
      analyserRef.current.getFloatTimeDomainData(dataArrayRef.current);
      return new Float32Array(dataArrayRef.current);
    }
    return null;
  };

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
    getAudioData
  };
};