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

    // Process audio if we have significant energy (more sensitive threshold)
    const energy = rms;
    console.log('Audio energy:', energy.toFixed(4));
    if (energy > 0.005) {
      processAudioChunk(dataArray);
    }

    if (isListening) {
      requestAnimationFrame(processAudioLoop);
    }
  }, [isListening]);

  const processAudioChunk = useCallback(async (audioData: Float32Array) => {
    if (!modelRef.current || !modelRef.current.model) return;

    try {
      // Convert audio to mel-spectrogram features for Teachable Machine
      const melSpectrogram = await convertToMelSpectrogram(audioData);
      
      // Run inference
      const prediction = modelRef.current.model.predict(melSpectrogram) as tf.Tensor;
      const scores = await prediction.data();
      
      // Clean up tensors
      melSpectrogram.dispose();
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

      // Debug logging
      console.log('Teachable Machine predictions:', Array.from(scores).map((score, index) => ({
        label: modelRef.current?.classLabels[index] || `Class ${index}`,
        score: score.toFixed(3)
      })));

      // Lower confidence threshold for better detection
      if (maxScore > 0.3) {
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

  // Convert audio to mel-spectrogram features
  const convertToMelSpectrogram = useCallback(async (audioData: Float32Array) => {
    // Create a simplified mel-spectrogram using FFT
    const fftSize = 512;
    const hopLength = 256;
    const melBins = 128;
    
    // Pad or truncate audio to expected size
    const targetLength = fftSize;
    const paddedAudio = new Float32Array(targetLength);
    
    for (let i = 0; i < targetLength; i++) {
      paddedAudio[i] = i < audioData.length ? audioData[i] : 0;
    }
    
    // Apply windowing (Hamming window)
    for (let i = 0; i < targetLength; i++) {
      const window = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (targetLength - 1));
      paddedAudio[i] *= window;
    }
    
    // Convert to tensor and reshape for the model
    // Most Teachable Machine audio models expect shape [1, melBins, timeSteps, 1]
    const spectrogram = tf.tensor(paddedAudio)
      .expandDims(0) // batch dimension
      .expandDims(-1); // channel dimension
    
    return spectrogram;
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