import { useState, useEffect, useCallback } from 'react';

export interface DrumSample {
  id: string;
  name: string;
  type: 'kick' | 'snare' | 'hihat' | 'openhat' | 'tom';
  audioBlob: Blob;
  audioUrl: string;
  createdAt: Date;
}

export const useCustomSamples = () => {
  const [samples, setSamples] = useState<DrumSample[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSamplesFromStorage = useCallback(async () => {
    try {
      const storageKey = 'drumMachine_customSamples';
      const storedSamples = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      const loadedSamples: DrumSample[] = [];
      
      for (const storedSample of storedSamples) {
        if (storedSample.audioData) {
          try {
            // Convert base64 back to blob
            const response = await fetch(storedSample.audioData);
            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            
            const sample: DrumSample = {
              ...storedSample,
              audioBlob: blob,
              audioUrl,
              createdAt: new Date(storedSample.createdAt)
            };
            
            loadedSamples.push(sample);
          } catch (error) {
            console.error('Error loading sample:', storedSample.name, error);
          }
        }
      }
      
      setSamples(loadedSamples);
    } catch (error) {
      console.error('Error loading samples from storage:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSample = useCallback(async (sample: DrumSample) => {
    try {
      const storageKey = 'drumMachine_customSamples';
      const existingSamples = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      // Convert blob to base64 for storage
      const reader = new FileReader();
      reader.onload = () => {
        const sampleData = {
          ...sample,
          audioData: reader.result,
          audioBlob: undefined, // Remove blob from storage
          audioUrl: undefined   // Remove URL from storage
        };
        
        const updatedSamples = [...existingSamples, sampleData];
        localStorage.setItem(storageKey, JSON.stringify(updatedSamples));
        setSamples(prev => [...prev, sample]);
      };
      reader.readAsDataURL(sample.audioBlob);
    } catch (error) {
      console.error('Error saving sample:', error);
      throw error;
    }
  }, []);

  const deleteSample = useCallback((sampleId: string) => {
    try {
      const storageKey = 'drumMachine_customSamples';
      const existingSamples = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const updatedSamples = existingSamples.filter((s: any) => s.id !== sampleId);
      localStorage.setItem(storageKey, JSON.stringify(updatedSamples));
      
      // Revoke object URL and remove from state
      const sample = samples.find(s => s.id === sampleId);
      if (sample) {
        URL.revokeObjectURL(sample.audioUrl);
      }
      
      setSamples(prev => prev.filter(s => s.id !== sampleId));
    } catch (error) {
      console.error('Error deleting sample:', error);
      throw error;
    }
  }, [samples]);

  const getSamplesByType = useCallback((type: DrumSample['type']) => {
    return samples.filter(sample => sample.type === type);
  }, [samples]);

  const playCustomSample = useCallback((sampleId: string) => {
    const sample = samples.find(s => s.id === sampleId);
    if (sample) {
      const audio = new Audio(sample.audioUrl);
      audio.play().catch(console.error);
      return audio;
    }
    return null;
  }, [samples]);

  // Load samples on mount
  useEffect(() => {
    loadSamplesFromStorage();
  }, [loadSamplesFromStorage]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      samples.forEach(sample => {
        URL.revokeObjectURL(sample.audioUrl);
      });
    };
  }, [samples]);

  return {
    samples,
    isLoading,
    saveSample,
    deleteSample,
    getSamplesByType,
    playCustomSample,
    reloadSamples: loadSamplesFromStorage
  };
};