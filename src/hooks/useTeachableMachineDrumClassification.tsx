import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';

interface DrumDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'openhat';
  modelPredictions?: any;
}

export const useTeachableMachineDrumClassification = () => {
  const [isListening, setIsListening] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<DrumDetection[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const modelRef = useRef<any>(null);
  const recognizerRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Teachable Machine model URL
  const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/X4kj9rYWZ/';

  // Class mapping from Teachable Machine to drum types
  const classMapping: Record<string, 'kick' | 'snare' | 'hihat' | 'openhat'> = {
    'Kick': 'kick',
    'Snare': 'snare',
    'Hi-Hat': 'hihat',
    'Open Hi-Hat': 'openhat',
    'Hihat': 'hihat',
    'kick': 'kick',
    'snare': 'snare',
    'hihat': 'hihat',
    'openhat': 'openhat'
  };

  // Initialize the Teachable Machine model
  const initializeModel = useCallback(async () => {
    try {
      setError(null);
      setLoadingProgress(20);
      setIsModelLoaded(false);

      console.log('Loading Teachable Machine model...');
      
      // Load the model and metadata using TensorFlow.js
      const modelURL = MODEL_URL + 'model.json';
      const metadataURL = MODEL_URL + 'metadata.json';
      
      setLoadingProgress(40);
      
      // Load both model and metadata
      const [model, metadataResponse] = await Promise.all([
        tf.loadLayersModel(modelURL),
        fetch(metadataURL)
      ]);
      
      setLoadingProgress(70);
      
      const metadata = await metadataResponse.json();
      
      modelRef.current = {
        model,
        metadata,
        inputShape: model.inputs[0].shape,
        outputShape: model.outputs[0].shape,
        classLabels: metadata.labels || []
      };
      
      setIsModelLoaded(true);
      setLoadingProgress(100);
      console.log('Teachable Machine model loaded successfully', modelRef.current);

    } catch (err) {
      console.error('Error initializing Teachable Machine model:', err);
      setError('Failed to load Teachable Machine model. Please check network connection.');
    }
  }, []);

  // Initialize model when hook mounts
  useEffect(() => {
    initializeModel();
  }, [initializeModel]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      
      if (!isModelLoaded || !modelRef.current) {
        setError('Model not loaded yet');
        return;
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000, // Teachable Machine typically uses 16kHz
          channelCount: 1
        } 
      });
      
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
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

      setIsListening(true);
      
      // Start audio processing and level monitoring
      processAudioLoop();
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  }, [isModelLoaded]);

  const processAudioLoop = useCallback(() => {
    if (!analyserRef.current || !isListening || !modelRef.current) return;

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

    // Process audio if we have significant energy
    const energy = rms;
    if (energy > 0.01) {
      processAudioChunk(dataArray);
    }

    if (isListening) {
      requestAnimationFrame(processAudioLoop);
    }
  }, [isListening]);

  const processAudioChunk = useCallback(async (audioData: Float32Array) => {
    if (!modelRef.current || !modelRef.current.model) return;

    try {
      // Convert audio data to spectrogram-like features (simplified approach)
      const inputTensor = tf.tensor(audioData).expandDims(0).expandDims(-1);
      
      // Run inference
      const prediction = modelRef.current.model.predict(inputTensor) as tf.Tensor;
      const scores = await prediction.data();
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      const currentTime = Date.now();
      
      // Find the highest confidence prediction
      let maxScore = 0;
      let maxIndex = 0;
      
      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > maxScore) {
          maxScore = scores[i];
          maxIndex = i;
        }
      }

      // Only proceed if confidence is high enough
      if (maxScore > 0.7) {
        const predictedClass = modelRef.current.classLabels[maxIndex] || `Class ${maxIndex}`;
        
        // Map the predicted class to drum type
        const drumType = classMapping[predictedClass] || classMapping[predictedClass.toLowerCase()];
        
        if (drumType) {
          const detection: DrumDetection = {
            timestamp: currentTime,
            confidence: maxScore,
            type: drumType,
            modelPredictions: {
              model: 'teachable-machine',
              originalLabel: predictedClass,
              allPredictions: Array.from(scores).map((score, index) => ({
                label: modelRef.current?.classLabels[index] || `Class ${index}`,
                score
              })).slice(0, 5)
            }
          };

          console.log('Drum detected with Teachable Machine:', detection);
          setDetectedBeats(prev => [...prev.slice(-19), detection]);
        }
      }
    } catch (err) {
      console.error('Error processing audio chunk:', err);
    }
  }, []);


  const stopListening = useCallback(async () => {
    setIsListening(false);
    
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
    modelType: 'teachable-machine' as const,
    startListening,
    stopListening,
    clearBeats
  };
};