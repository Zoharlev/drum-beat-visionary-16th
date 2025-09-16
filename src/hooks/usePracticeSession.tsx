import { useState, useCallback, useMemo } from 'react';

interface DrumDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'openhat';
}

interface DrumPattern {
  [key: string]: boolean[];
}

interface PracticeStats {
  totalBeats: number;
  correctBeats: number;
  accuracy: number;
  timing: {
    early: number;
    onTime: number;
    late: number;
  };
}

interface UsePracticeSessionProps {
  targetPattern: DrumPattern;
  bpm: number;
  toleranceMs?: number;
}

export const usePracticeSession = ({ targetPattern, bpm, toleranceMs = 100 }: UsePracticeSessionProps) => {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [detectedBeats, setDetectedBeats] = useState<DrumDetection[]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const stepDuration = (60 / bpm / 2) * 1000; // 8th notes in ms to match 8 steps/bar

  const startSession = useCallback(() => {
    setSessionActive(true);
    setSessionStartTime(Date.now());
    setDetectedBeats([]);
    setCurrentStep(0);
  }, []);

  const stopSession = useCallback(() => {
    setSessionActive(false);
    setSessionStartTime(null);
  }, []);

  const addDetectedBeat = useCallback((beat: DrumDetection) => {
    if (sessionActive) {
      setDetectedBeats(prev => [...prev, beat]);
    }
  }, [sessionActive]);

  const updateCurrentStep = useCallback((step: number) => {
    setCurrentStep(step % 16);
  }, []);

  // Calculate practice statistics
  const practiceStats: PracticeStats = useMemo(() => {
    if (!sessionStartTime || detectedBeats.length === 0) {
      return {
        totalBeats: 0,
        correctBeats: 0,
        accuracy: 0,
        timing: { early: 0, onTime: 0, late: 0 }
      };
    }

    let totalTargetBeats = 0;
    let correctBeats = 0;
    const timing = { early: 0, onTime: 0, late: 0 };

    // Count total expected beats in target pattern
    Object.values(targetPattern).forEach(steps => {
      steps.forEach(active => {
        if (active) totalTargetBeats++;
      });
    });

    if (totalTargetBeats === 0) {
      return {
        totalBeats: 0,
        correctBeats: 0,
        accuracy: 0,
        timing
      };
    }

    // Check each detected beat against target pattern
    detectedBeats.forEach(beat => {
      const relativeTime = beat.timestamp - sessionStartTime;
      const expectedStep = Math.round(relativeTime / stepDuration) % 16;
      const timingOffset = relativeTime - (expectedStep * stepDuration);

      // Check if this beat type should be active at this step
      if (targetPattern[beat.type] && targetPattern[beat.type][expectedStep]) {
        correctBeats++;

        // Categorize timing
        if (Math.abs(timingOffset) <= toleranceMs) {
          timing.onTime++;
        } else if (timingOffset < 0) {
          timing.early++;
        } else {
          timing.late++;
        }
      }
    });

    return {
      totalBeats: totalTargetBeats,
      correctBeats,
      accuracy: totalTargetBeats > 0 ? (correctBeats / totalTargetBeats) * 100 : 0,
      timing
    };
  }, [detectedBeats, sessionStartTime, targetPattern, stepDuration, toleranceMs]);

  // Get accuracy for current step
  const getCurrentStepAccuracy = useCallback((step: number) => {
    if (!sessionStartTime) return null;

    const stepBeats = detectedBeats.filter(beat => {
      const relativeTime = beat.timestamp - sessionStartTime;
      const beatStep = Math.round(relativeTime / stepDuration) % 16;
      return beatStep === step;
    });

    const expectedBeats = Object.entries(targetPattern).filter(([_, steps]) => steps[step]);
    
    if (expectedBeats.length === 0) return null;

    const correctBeats = stepBeats.filter(beat => 
      targetPattern[beat.type] && targetPattern[beat.type][step]
    );

    return {
      expected: expectedBeats.length,
      detected: stepBeats.length,
      correct: correctBeats.length,
      accuracy: expectedBeats.length > 0 ? (correctBeats.length / expectedBeats.length) * 100 : 100
    };
  }, [detectedBeats, sessionStartTime, targetPattern, stepDuration]);

  return {
    sessionActive,
    sessionStartTime,
    detectedBeats,
    currentStep,
    practiceStats,
    startSession,
    stopSession,
    addDetectedBeat,
    updateCurrentStep,
    getCurrentStepAccuracy,
    stepDuration
  };
};