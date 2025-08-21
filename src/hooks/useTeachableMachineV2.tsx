import { useState, useEffect, useRef, useCallback } from 'react';

interface DrumDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'openhat';
  modelPredictions?: any;
}

export const useTeachableMachineV2 = () => {
  const [isListening, setIsListening] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<DrumDetection[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const modelRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processingRef = useRef<boolean>(false);

  // Teachable Machine model URL
  const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/X4kj9rYWZ/';

  // Enhanced class mapping
  const classMapping: Record<string, 'kick' | 'snare' | 'hihat' | 'openhat'> = {
    'Kick': 'kick',
    'Snare': 'snare',
    'Hi-Hat': 'hihat',
    'Open Hi-Hat': 'openhat',
    'Hihat': 'hihat',
    'kick': 'kick',
    'snare': 'snare',
    'hihat': 'hihat',
    'openhat': 'openhat',
    'Background Noise': 'kick', // Fallback
    'Silence': 'kick' // Fallback
  };

  // Initialize the Teachable Machine model with enhanced loading
  const initializeModel = useCallback(async () => {
    try {
      setError(null);
      setLoadingProgress(10);
      setIsModelLoaded(false);

      console.log('Loading Teachable Machine V2 model...');
      
      // Load model using TensorFlow.js directly
      try {
        setLoadingProgress(40);
        console.log('Loading Teachable Machine V2 model with TensorFlow.js...');
        
        // Import TensorFlow.js
        const tf = await import('@tensorflow/tfjs');
        setLoadingProgress(50);
        
        // Load model and metadata
        const modelResponse = await fetch(MODEL_URL + 'model.json');
        const metadataResponse = await fetch(MODEL_URL + 'metadata.json');
        const metadata = await metadataResponse.json();
        
        setLoadingProgress(70);
        
        // Load the actual TensorFlow model
        const model = await tf.loadLayersModel(MODEL_URL + 'model.json');
        setLoadingProgress(90);
        
        modelRef.current = {
          model,
          metadata,
          classLabels: metadata.labels || ['Background Noise', 'Kick', 'Snare', 'Hi-Hat'],
          sampleRate: 16000,
          inputSize: 1024,
          isFallback: false
        };
        
        console.log('Model loaded with labels:', modelRef.current.classLabels);
        
        setIsModelLoaded(true);
        setLoadingProgress(100);
        console.log('Enhanced smart prediction model loaded successfully');
        
      } catch (fallbackErr) {
        console.error('TensorFlow model loading failed, using enhanced fallback:', fallbackErr);
        
        // Enhanced fallback with metadata
        const metadataResponse = await fetch(MODEL_URL + 'metadata.json');
        const metadata = await metadataResponse.json();
        
        modelRef.current = {
          model: null,
          metadata,
          classLabels: metadata.labels || ['Background Noise', 'Kick', 'Snare', 'Hi-Hat'],
          sampleRate: 16000,
          inputSize: 1024,
          isFallback: true
        };
        
        console.log('Using fallback mode with labels:', modelRef.current.classLabels);
        setError('Using fallback detection mode. Please check network connection for full model.');
      }
    } catch (err) {
      console.error('General error in model initialization:', err);
      setError('Failed to initialize model.');
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

      // Get microphone access with optimized settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100, // Higher sample rate for better quality
          channelCount: 1
        } 
      });
      
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 44100
      });
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 2048; // Larger FFT for better frequency resolution
      analyser.smoothingTimeConstant = 0.8;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);
      processingRef.current = false;
      
      // Start audio processing
      processAudioLoop();
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  }, [isModelLoaded]);

  const processAudioLoop = useCallback(() => {
    if (!analyserRef.current || !isListening || !modelRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDataArray = new Float32Array(analyserRef.current.fftSize);
    
    analyserRef.current.getByteFrequencyData(dataArray);
    analyserRef.current.getFloatTimeDomainData(timeDataArray);

    // Calculate audio level for visualization
    let sum = 0;
    for (let i = 0; i < timeDataArray.length; i++) {
      sum += timeDataArray[i] * timeDataArray[i];
    }
    const rms = Math.sqrt(sum / timeDataArray.length);
    setAudioLevel(Math.min(rms * 100, 1));

    // Process audio if we have significant energy and not already processing
    const energy = rms;
    console.log('Audio energy:', energy, 'RMS:', rms); // Debug logging
    if (energy > 0.001 && !processingRef.current) { // Lowered threshold
      processingRef.current = true;
      processAudioChunk(dataArray, timeDataArray).finally(() => {
        processingRef.current = false;
      });
    }

    if (isListening) {
      requestAnimationFrame(processAudioLoop);
    }
  }, [isListening]);

  const processAudioChunk = useCallback(async (frequencyData: Uint8Array, timeData: Float32Array) => {
    if (!modelRef.current) return;

    try {
      let predictions: any[] = [];
      
      if (modelRef.current.model && !modelRef.current.isFallback) {
        // Use actual TensorFlow.js model - need to prepare audio data properly
        const tf = await import('@tensorflow/tfjs');
        
        // Create tensor from time domain data
        const tensor = tf.tensor2d([Array.from(timeData.slice(0, 1024))]);
        const reshaped = tensor.reshape([1, 43, 232, 1]); // Model expects this shape
        
        const prediction = await modelRef.current.model.predict(reshaped) as any;
        predictions = await prediction.data();
        
        tensor.dispose();
        reshaped.dispose();
        prediction.dispose();
        
        console.log('TensorFlow predictions:', predictions); // Debug logging
      } else {
        // Enhanced fallback with frequency analysis
        predictions = generateSmartPredictions(frequencyData, timeData);
        console.log('Fallback predictions:', predictions); // Debug logging
      }

      const currentTime = Date.now();
      
      // Find the highest confidence prediction
      let maxScore = 0;
      let maxIndex = 0;
      
      for (let i = 0; i < predictions.length; i++) {
        const score = predictions[i].probability || predictions[i];
        if (score > maxScore) {
          maxScore = score;
          maxIndex = i;
        }
      }

      // Lower confidence threshold for better sensitivity  
      console.log('Max score:', maxScore, 'Index:', maxIndex); // Debug logging
      if (maxScore > 0.3) { // Much lower threshold
        const predictedClass = modelRef.current.classLabels[maxIndex] || `Class ${maxIndex}`;
        
        // Map the predicted class to drum type
        const drumType = classMapping[predictedClass] || classMapping[predictedClass.toLowerCase()];
        
        if (drumType) {
          const detection: DrumDetection = {
            timestamp: currentTime,
            confidence: maxScore,
            type: drumType,
            modelPredictions: {
              model: 'teachable-machine-v2',
              originalLabel: predictedClass,
              allPredictions: predictions.map((pred, index) => ({
                label: modelRef.current?.classLabels[index] || `Class ${index}`,
                score: pred.probability || pred
              })).slice(0, 5)
            }
          };

          console.log('Drum detected with Teachable Machine V2:', detection);
          setDetectedBeats(prev => [...prev.slice(-19), detection]);
        }
      }
    } catch (err) {
      console.error('Error processing audio chunk:', err);
    }
  }, []);

  // Enhanced fallback prediction based on frequency analysis - much more sensitive
  const generateSmartPredictions = (frequencyData: Uint8Array, timeData: Float32Array): number[] => {
    // Analyze frequency bins for different drum characteristics
    const lowFreq = frequencyData.slice(0, 50).reduce((a, b) => a + b, 0) / 50; // Kick
    const midFreq = frequencyData.slice(50, 200).reduce((a, b) => a + b, 0) / 150; // Snare
    const highFreq = frequencyData.slice(200, 400).reduce((a, b) => a + b, 0) / 200; // Hi-hat
    const veryHighFreq = frequencyData.slice(400, 600).reduce((a, b) => a + b, 0) / 200; // Open hi-hat
    
    // Calculate attack characteristics
    const attack = Math.abs(timeData[0] - timeData[Math.floor(timeData.length / 4)]);
    
    // Much more sensitive scoring - amplify the results
    const backgroundScore = 0.1; // Low baseline
    const kickScore = Math.min(0.9, (lowFreq / 255) * (attack > 0.02 ? 2.0 : 1.5));
    const snareScore = Math.min(0.9, (midFreq / 255) * (attack > 0.01 ? 1.8 : 1.3));
    const hihatScore = Math.min(0.9, (highFreq / 255) * (attack > 0.005 ? 1.5 : 1.0));
    
    const scores = [backgroundScore, kickScore, snareScore, hihatScore];
    console.log('Frequency analysis scores:', {
      lowFreq, midFreq, highFreq, veryHighFreq, attack, scores
    });
    
    return scores;
  };

  const stopListening = useCallback(async () => {
    setIsListening(false);
    processingRef.current = false;
    
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
    modelType: 'teachable-machine-v2' as const,
    startListening,
    stopListening,
    clearBeats
  };
};