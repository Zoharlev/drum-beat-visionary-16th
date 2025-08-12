import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline } from '@huggingface/transformers';

interface DrumDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'openhat';
  modelPredictions?: any;
}

type ModelType = 'wav2vec2-drums' | 'yamnet';

export const usePretrainedDrumClassification = (modelType: ModelType = 'wav2vec2-drums') => {
  const [isListening, setIsListening] = useState(false);
  const [detectedBeats, setDetectedBeats] = useState<DrumDetection[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pipelineRef = useRef<any>(null);
  const processingRef = useRef<boolean>(false);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const lastProcessTimeRef = useRef<number>(0);

  // Model configurations with local and remote paths
  const modelConfigs = {
    'wav2vec2-drums': {
      localPath: '/models/wav2vec2-base-960h',
      remotePath: 'onnx-community/wav2vec2-base-960h',
      task: 'audio-classification' as const,
      device: 'webgpu' as const,
      drumMapping: {
        // Generic audio classification - map speech/audio features to drum types
        'music': 'kick',
        'speech': 'snare',
        'sound': 'hihat',
        'noise': 'openhat',
        'audio': 'kick'
      }
    },
    'yamnet': {
      localPath: '/models/yamnet',
      remotePath: 'onnx-community/yamnet',
      task: 'audio-classification' as const,
      device: 'webgpu' as const,
      drumMapping: {
        'Drum': 'kick',
        'Snare drum': 'snare',
        'Hi-hat': 'hihat',
        'Cymbal': 'hihat',
        'Bass drum': 'kick',
        'Percussion': 'kick',
        'Tom-tom': 'kick',
        'Clapping': 'snare'
      }
    }
  };

  // Validate local model files
  const validateLocalModel = async (localPath: string): Promise<boolean> => {
    try {
      // Check for required model files
      const requiredFiles = ['model.onnx', 'config.json'];
      const fileChecks = await Promise.all(
        requiredFiles.map(async (file) => {
          try {
            const response = await fetch(`${localPath}/${file}`, { method: 'HEAD' });
            return response.ok;
          } catch {
            return false;
          }
        })
      );
      
      return fileChecks.every(exists => exists);
    } catch {
      return false;
    }
  };

  // Initialize the Hugging Face model with local fallback
  const initializeModel = useCallback(async () => {
    try {
      setError(null);
      setLoadingProgress(0);
      setIsModelLoaded(false);

      const config = modelConfigs[modelType];
      console.log(`Initializing ${modelType} model...`);

      let modelPath = config.remotePath;
      let isLocalModel = false;
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

      // Try local model first
      console.log(`Checking for local model at: ${config.localPath}`);
      const localModelValid = await validateLocalModel(config.localPath);
      
      if (localModelValid) {
        modelPath = config.localPath;
        isLocalModel = true;
        console.log(`Using local model: ${modelPath}`);
      } else {
        if (isOffline) {
          throw new Error('Offline and local model not found. Please download models to public/models.');
        }
        console.log(`Local model not found or invalid, using remote: ${config.remotePath}`);
      }

      // Create pipeline with progress tracking
      const classifier = await pipeline(
        config.task,
        modelPath,
        { 
          device: config.device,
          progress_callback: (progress: any) => {
            if (!isLocalModel && progress.status === 'downloading') {
              const percentage = Math.round((progress.loaded / progress.total) * 100);
              setLoadingProgress(Number.isFinite(percentage) ? percentage : 0);
            } else if (isLocalModel) {
              // For local models, show immediate progress
              setLoadingProgress(90);
            }
          }
        }
      );

      pipelineRef.current = classifier;
      setIsModelLoaded(true);
      setLoadingProgress(100);
      console.log(`${modelType} model loaded successfully ${isLocalModel ? '(local)' : '(remote)'}`);

    } catch (err) {
      console.error('Error initializing model:', err);
      setError(`Failed to load ${modelType} model. Trying CPU fallback...`);
      
      // Fallback to CPU if WebGPU fails
      try {
        const config = modelConfigs[modelType];
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        
        // Try local first, then remote on CPU
        let modelPath = config.remotePath;
        const localModelValid = await validateLocalModel(config.localPath);
        
        if (localModelValid) {
          modelPath = config.localPath;
          console.log('Using local model for CPU fallback');
        } else if (isOffline) {
          throw new Error('Offline and local model not found.');
        }

        const classifier = await pipeline(config.task, modelPath, { 
          device: 'cpu',
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              const percentage = Math.round((progress.loaded / progress.total) * 100);
              setLoadingProgress(Number.isFinite(percentage) ? percentage : 0);
            } else if (localModelValid) {
              setLoadingProgress(90);
            }
          }
        });
        
        pipelineRef.current = classifier;
        setIsModelLoaded(true);
        setLoadingProgress(100);
        console.log(`${modelType} model loaded on CPU`);
        setError(`Model loaded on CPU (WebGPU unavailable)`);
      } catch (fallbackErr) {
        console.error('CPU fallback failed:', fallbackErr);
        setError(`Failed to load ${modelType} model on both WebGPU and CPU. Please check network connection or download models locally.`);
      }
    }
  }, [modelType]);

  // Initialize model when hook mounts or model type changes
  useEffect(() => {
    initializeModel();
  }, [initializeModel]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      
      if (!isModelLoaded || !pipelineRef.current) {
        setError('Model not loaded yet');
        return;
      }

      // Get microphone access with high quality settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
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
      
      // Configure analyser for high-quality feature extraction
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.1;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start audio processing loop
      audioBufferRef.current = [];
      setIsListening(true);
      processAudioLoop();
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  }, [isModelLoaded]);

  const processAudioLoop = useCallback(() => {
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

    // Collect audio buffer for processing
    audioBufferRef.current.push(new Float32Array(dataArray));
    
    // Process audio every 100ms if we have enough data
    const currentTime = Date.now();
    if (currentTime - lastProcessTimeRef.current > 100 && audioBufferRef.current.length > 0) {
      processAudioBuffer();
      lastProcessTimeRef.current = currentTime;
    }

    if (isListening) {
      requestAnimationFrame(processAudioLoop);
    }
  }, [isListening]);

  const processAudioBuffer = useCallback(async () => {
    if (!pipelineRef.current || processingRef.current || audioBufferRef.current.length === 0) {
      return;
    }

    processingRef.current = true;

    try {
      // Concatenate audio buffers
      const totalLength = audioBufferRef.current.reduce((sum, buffer) => sum + buffer.length, 0);
      const combinedBuffer = new Float32Array(totalLength);
      
      let offset = 0;
      for (const buffer of audioBufferRef.current) {
        combinedBuffer.set(buffer, offset);
        offset += buffer.length;
      }

      // Clear the buffer
      audioBufferRef.current = [];

      // Only process if we have significant audio energy
      const energy = combinedBuffer.reduce((sum, sample) => sum + Math.abs(sample), 0) / combinedBuffer.length;
      
      if (energy > 0.001) {
        // Run inference
        const predictions = await pipelineRef.current(combinedBuffer);
        
        if (predictions && Array.isArray(predictions)) {
          analyzePredictions(predictions);
        }
      }
    } catch (err) {
      console.error('Error processing audio:', err);
    } finally {
      processingRef.current = false;
    }
  }, []);

  const analyzePredictions = useCallback((predictions: any[]) => {
    const config = modelConfigs[modelType];
    const currentTime = Date.now();

    // Find the highest confidence drum-related prediction
    let bestDrumPrediction = null;
    let maxConfidence = 0;

    for (const prediction of predictions) {
      const { label, score } = prediction;
      const normalizedLabel = label.toLowerCase();
      
      // Check if this prediction matches any of our drum types
      for (const [modelLabel, drumType] of Object.entries(config.drumMapping)) {
        if (normalizedLabel.includes(modelLabel.toLowerCase()) && score > maxConfidence) {
          maxConfidence = score;
          bestDrumPrediction = {
            drumType: drumType as 'kick' | 'snare' | 'hihat' | 'openhat',
            confidence: score,
            originalLabel: label
          };
        }
      }
    }

    // Only trigger detection if confidence is above threshold
    if (bestDrumPrediction && bestDrumPrediction.confidence > 0.3) {
      const detection: DrumDetection = {
        timestamp: currentTime,
        confidence: bestDrumPrediction.confidence,
        type: bestDrumPrediction.drumType,
        modelPredictions: {
          model: modelType,
          originalLabel: bestDrumPrediction.originalLabel,
          allPredictions: predictions.slice(0, 5) // Keep top 5 predictions
        }
      };

      console.log('Drum detected with pre-trained model:', detection);
      setDetectedBeats(prev => [...prev.slice(-19), detection]);
    }
  }, [modelType]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    audioBufferRef.current = [];
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
    modelType,
    startListening,
    stopListening,
    clearBeats
  };
};