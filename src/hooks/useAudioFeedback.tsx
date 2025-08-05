import { useCallback, useRef } from 'react';

export const useAudioFeedback = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play metronome click
  const playMetronome = useCallback((isDownbeat = false) => {
    const context = initAudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    // Different pitch for downbeat vs regular beats
    oscillator.frequency.setValueAtTime(isDownbeat ? 1200 : 800, context.currentTime);
    oscillator.type = 'sine';

    // Sharp attack, quick decay
    gainNode.gain.setValueAtTime(0.15, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.08);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.08);
  }, [initAudioContext]);

  // Play success sound for correct hits
  const playSuccessSound = useCallback(() => {
    const context = initAudioContext();
    const oscillator1 = context.createOscillator();
    const oscillator2 = context.createOscillator();
    const gainNode = context.createGain();

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(context.destination);

    // Major chord for success
    oscillator1.frequency.setValueAtTime(523.25, context.currentTime); // C5
    oscillator2.frequency.setValueAtTime(659.25, context.currentTime); // E5
    
    oscillator1.type = 'sine';
    oscillator2.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2);

    oscillator1.start(context.currentTime);
    oscillator2.start(context.currentTime);
    oscillator1.stop(context.currentTime + 0.2);
    oscillator2.stop(context.currentTime + 0.2);
  }, [initAudioContext]);

  // Play error sound for missed or incorrect hits
  const playErrorSound = useCallback(() => {
    const context = initAudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    // Lower, dissonant tone for errors
    oscillator.frequency.setValueAtTime(200, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(150, context.currentTime + 0.15);
    oscillator.type = 'sawtooth';

    gainNode.gain.setValueAtTime(0.08, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.15);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.15);
  }, [initAudioContext]);

  // Play timing feedback sounds
  const playTimingFeedback = useCallback((timing: 'early' | 'onTime' | 'late') => {
    const context = initAudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    switch (timing) {
      case 'early':
        oscillator.frequency.setValueAtTime(400, context.currentTime);
        oscillator.type = 'triangle';
        break;
      case 'onTime':
        oscillator.frequency.setValueAtTime(800, context.currentTime);
        oscillator.type = 'sine';
        break;
      case 'late':
        oscillator.frequency.setValueAtTime(300, context.currentTime);
        oscillator.type = 'square';
        break;
    }

    gainNode.gain.setValueAtTime(0.06, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.1);
  }, [initAudioContext]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  return {
    playMetronome,
    playSuccessSound,
    playErrorSound,
    playTimingFeedback,
    cleanup
  };
};