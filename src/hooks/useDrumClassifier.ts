import { useEffect, useRef, useState } from 'react';
import { pipeline, Pipeline } from '@huggingface/transformers';

export interface DrumClassification {
  drum: string;
  confidence: number;
  timestamp: number;
}

export interface DrumClassifierHook {
  isLoading: boolean;
  isReady: boolean;
  classify: (audioData: Float32Array) => Promise<DrumClassification | null>;
  recentClassifications: DrumClassification[];
}

// Audio feature extraction for drum classification
const extractAudioFeatures = (audioData: Float32Array): Float32Array => {
  // Simple feature extraction - we'll use spectral features
  const windowSize = 1024;
  const hopSize = 512;
  const features: number[] = [];
  
  // Extract multiple windows
  for (let i = 0; i < audioData.length - windowSize; i += hopSize) {
    const window = audioData.slice(i, i + windowSize);
    
    // Apply Hamming window
    const hammingWindow = new Float32Array(windowSize);
    for (let j = 0; j < windowSize; j++) {
      hammingWindow[j] = 0.54 - 0.46 * Math.cos(2 * Math.PI * j / (windowSize - 1));
      window[j] *= hammingWindow[j];
    }
    
    // Simple FFT approximation using energy in frequency bands
    const numBands = 13; // Mel-scale inspired bands
    const bandEnergies = new Array(numBands).fill(0);
    
    for (let band = 0; band < numBands; band++) {
      const startFreq = Math.floor((band * windowSize) / (numBands * 2));
      const endFreq = Math.floor(((band + 1) * windowSize) / (numBands * 2));
      
      let energy = 0;
      for (let k = startFreq; k < endFreq && k < windowSize / 2; k++) {
        energy += window[k] * window[k];
      }
      bandEnergies[band] = Math.log(energy + 1e-10); // Log energy
    }
    
    features.push(...bandEnergies);
  }
  
  return new Float32Array(features);
};

// Simple rule-based classifier for drum sounds
const classifyDrumSound = (features: Float32Array): DrumClassification => {
  // Calculate feature statistics
  const mean = features.reduce((sum, val) => sum + val, 0) / features.length;
  const variance = features.reduce((sum, val) => sum + (val - mean) ** 2, 0) / features.length;
  const maxValue = Math.max(...features);
  const minValue = Math.min(...features);
  
  // Simple heuristic-based classification
  const lowFreqEnergy = features.slice(0, 4).reduce((sum, val) => sum + val, 0) / 4;
  const midFreqEnergy = features.slice(4, 8).reduce((sum, val) => sum + val, 0) / 4;
  const highFreqEnergy = features.slice(8, 12).reduce((sum, val) => sum + val, 0) / 4;
  
  let drum = 'unknown';
  let confidence = 0;
  
  // Classification rules based on frequency content
  if (lowFreqEnergy > midFreqEnergy && lowFreqEnergy > highFreqEnergy) {
    if (variance > 2) {
      drum = 'kick';
      confidence = Math.min(lowFreqEnergy / 10, 0.9);
    } else {
      drum = 'kick';
      confidence = Math.min(lowFreqEnergy / 15, 0.7);
    }
  } else if (midFreqEnergy > lowFreqEnergy && midFreqEnergy > highFreqEnergy) {
    if (variance > 3) {
      drum = 'snare';
      confidence = Math.min(midFreqEnergy / 8, 0.85);
    } else {
      drum = 'snare';
      confidence = Math.min(midFreqEnergy / 12, 0.7);
    }
  } else if (highFreqEnergy > lowFreqEnergy && highFreqEnergy > midFreqEnergy) {
    if (maxValue - minValue > 5) {
      drum = 'openhat';
      confidence = Math.min(highFreqEnergy / 6, 0.8);
    } else {
      drum = 'hihat';
      confidence = Math.min(highFreqEnergy / 8, 0.75);
    }
  }
  
  // Minimum confidence threshold
  if (confidence < 0.3) {
    drum = 'unknown';
    confidence = 0;
  }
  
  return {
    drum,
    confidence,
    timestamp: Date.now()
  };
};

export const useDrumClassifier = (): DrumClassifierHook => {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(true); // True for rule-based classifier
  const [recentClassifications, setRecentClassifications] = useState<DrumClassification[]>([]);
  
  const classify = async (audioData: Float32Array): Promise<DrumClassification | null> => {
    try {
      // Extract features from audio data
      const features = extractAudioFeatures(audioData);
      
      if (features.length === 0) {
        return null;
      }
      
      // Classify using rule-based approach
      const classification = classifyDrumSound(features);
      
      // Add to recent classifications
      setRecentClassifications(prev => {
        const updated = [...prev, classification].slice(-10); // Keep last 10
        return updated;
      });
      
      return classification;
    } catch (error) {
      console.error('Classification error:', error);
      return null;
    }
  };

  return {
    isLoading,
    isReady,
    classify,
    recentClassifications
  };
};