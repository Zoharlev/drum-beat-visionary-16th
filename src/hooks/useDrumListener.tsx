import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import Meyda from 'meyda';

interface DrumDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'openhat';
  features?: any;
}

export const useDrumListener = () => {
  const [isListening, setIsListening] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<DrumDetection[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const lastBeatTimeRef = useRef<number>(0);

  // Initialize TensorFlow.js and load/create a simple drum classification model
  const initializeModel = useCallback(async () => {
    try {
      // Initialize TensorFlow.js backend
      await tf.ready();
      
      // Create a simple neural network for drum classification
      // This is a basic model - you would typically train this with real drum samples
      const model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [13], units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({ units: 4, activation: 'softmax' }) // 4 drum types
        ]
      });

      model.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });

      modelRef.current = model;
      setIsModelLoaded(true);
      console.log('Drum classification model initialized');
    } catch (err) {
      console.error('Error initializing model:', err);
      setError('Failed to initialize drum recognition model');
    }
  }, []);

  // Initialize model on hook mount
  useEffect(() => {
    initializeModel();
  }, [initializeModel]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      
      if (!isModelLoaded) {
        setError('Drum recognition model not loaded yet');
        return;
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100
        } 
      });
      
      mediaStreamRef.current = stream;

      // Create audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      // Configure analyser for feature extraction
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      // Create script processor for Meyda feature extraction
      const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = scriptProcessor;
      
      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      // Initialize Meyda
      Meyda.bufferSize = 2048;
      Meyda.sampleRate = audioContext.sampleRate;

      // Set up audio processing
      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Calculate audio level for visualization
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setAudioLevel(Math.min(rms * 20, 1));

        // Extract features using Meyda
        const features = Meyda.extract([
          'mfcc',
          'spectralCentroid',
          'spectralRolloff',
          'zcr',
          'energy',
          'rms'
        ], inputData);

        if (features && features.mfcc && features.energy > 0.005) { // Increased energy threshold
          analyzeDrumFeatures(features);
        }
      };

      setIsListening(true);
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  }, [isModelLoaded]);

  const analyzeDrumFeatures = useCallback((features: any) => {
    if (!modelRef.current || !features.mfcc) return;

    const currentTime = Date.now();
    const timeSinceLastBeat = currentTime - lastBeatTimeRef.current;
    
    // Minimum time between detections to avoid duplicates
    if (timeSinceLastBeat < 100) return;

    try {
      // Prepare features for the model (using first 13 MFCC coefficients)
      const mfccFeatures = features.mfcc.slice(0, 13);
      const inputTensor = tf.tensor2d([mfccFeatures]);

      // Get prediction from model
      const prediction = modelRef.current.predict(inputTensor) as tf.Tensor;
      const predictionData = prediction.dataSync();
      
      // Find the class with highest probability
      const maxIndex = predictionData.indexOf(Math.max(...predictionData));
      const confidence = predictionData[maxIndex];
      
      // Only trigger if confidence is above higher threshold for less sensitivity
      if (confidence > 0.8) {
        const drumTypes = ['kick', 'snare', 'hihat', 'openhat'];
        const detectedType = drumTypes[maxIndex] as 'kick' | 'snare' | 'hihat' | 'openhat';
        
        // Additional heuristics based on audio features
        let finalType = detectedType;
        let finalConfidence = confidence;

        // Use spectral features to refine classification
        if (features.spectralCentroid > 8000 && features.zcr > 0.1) {
          finalType = 'hihat';
          finalConfidence = Math.min(confidence + 0.1, 1);
        } else if (features.spectralCentroid < 200 && features.energy > 0.01) {
          finalType = 'kick';
          finalConfidence = Math.min(confidence + 0.15, 1);
        } else if (features.spectralCentroid > 2000 && features.spectralCentroid < 6000 && features.energy > 0.005) {
          finalType = 'snare';
          finalConfidence = Math.min(confidence + 0.1, 1);
        }

        const detection: DrumDetection = {
          timestamp: currentTime,
          confidence: finalConfidence,
          type: finalType,
          features: {
            spectralCentroid: features.spectralCentroid,
            zcr: features.zcr,
            energy: features.energy,
            rms: features.rms
          }
        };

        console.log('Drum detected:', detection);
        setDetectedBeats(prev => [...prev.slice(-19), detection]);
        lastBeatTimeRef.current = currentTime;
      }

      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();
    } catch (err) {
      console.error('Error in drum analysis:', err);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
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

  const clearBeats = useCallback(() => {
    setDetectedBeats([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      // Clean up model
      if (modelRef.current) {
        modelRef.current.dispose();
      }
    };
  }, [stopListening]);

  return {
    isListening,
    detectedBeats,
    audioLevel,
    error,
    isModelLoaded,
    startListening,
    stopListening,
    clearBeats
  };
};