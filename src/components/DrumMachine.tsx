import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Settings, Plus, Minus, Mic, MicOff } from "lucide-react";
import { DrumGrid } from "./DrumGrid";
import { PatternNavigation } from "./PatternNavigation";
import { useToast } from "@/hooks/use-toast";
import { useDrumListener } from "@/hooks/useDrumListener";
import { useCSVPatternLoader } from "@/hooks/useCSVPatternLoader";
import { cn } from "@/lib/utils";

interface DrumPattern {
  [key: string]: boolean[] | number;
  length: number;
}

export const DrumMachine = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentView, setCurrentView] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(120); // 2:00 in seconds
  const [pattern, setPattern] = useState<DrumPattern>(() => {
    return {
      'Kick': new Array(16).fill(false),
      'Snare': new Array(16).fill(false),
      'Hi-Hat': new Array(16).fill(false),
      length: 16,
    };
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { toast } = useToast();
  
  // Drum listener hook for microphone beat detection
  const {
    isListening,
    detectedBeats,
    audioLevel,
    error: listenerError,
    isModelLoaded,
    startListening,
    stopListening,
    clearBeats
  } = useDrumListener();

  const { loadPatternFromFile, loadPatternFromMXL, loadPatternFromTextNotation, isLoading: isLoadingPattern, error: csvError } = useCSVPatternLoader();
  const [loadedPatternInfo, setLoadedPatternInfo] = useState<{
    componentsFound: string[];
    totalBeats: number;
  } | null>(null);

  // Load text notation pattern on component mount
  useEffect(() => {
    const loadTextPattern = async () => {
      try {
        const newPattern = await loadPatternFromTextNotation('/patterns/come_as_you_are_drum_notation_by_beat.txt');
        setPattern(newPattern);
        
        // Update pattern info
        const componentsFound = Object.keys(newPattern).filter(key => key !== 'length');
        setLoadedPatternInfo({
          componentsFound,
          totalBeats: newPattern.length
        });
        
        toast({
          title: "Pattern Loaded",
          description: `Loaded "Come As You Are" drum notation with ${componentsFound.length} drum components (${newPattern.length} steps)`
        });
      } catch (error) {
        console.error('Failed to load text notation pattern:', error);
        toast({
          title: "Pattern Load Failed",
          description: "Using default pattern",
          variant: "destructive"
        });
      }
    };

    loadTextPattern();
  }, [loadPatternFromTextNotation, toast]);

  // Handle listener state changes and errors
  useEffect(() => {
    if (listenerError) {
      toast({
        title: "Listener Error",
        description: listenerError,
        variant: "destructive"
      });
    }
  }, [listenerError, toast]);

  const handleListenerToggle = async () => {
    if (isListening) {
      stopListening();
      toast({
        title: "Listening Stopped",
        description: "Drum detection disabled"
      });
    } else {
      try {
        await startListening();
        toast({
          title: "Listening Started",
          description: "Drum detection enabled"
        });
      } catch (error) {
        toast({
          title: "Failed to Start",
          description: "Could not access microphone",
          variant: "destructive"
        });
      }
    }
  };

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Step timing based on BPM
  const stepDuration = (60 / bpm / 4) * 1000; // 16th notes

  // Convert detected beats to pattern grid positions when listening
  const detectedPattern = useMemo(() => {
    if (!isListening || detectedBeats.length === 0) return null;

    const newPattern: DrumPattern = {
      kick: new Array(pattern.length).fill(false),
      snare: new Array(pattern.length).fill(false),
      hihat: new Array(pattern.length).fill(false),
      openhat: new Array(pattern.length).fill(false),
      length: pattern.length,
    };

    const firstBeatTime = detectedBeats[0]?.timestamp || Date.now();
    
    detectedBeats.forEach(beat => {
      const relativeTime = beat.timestamp - firstBeatTime;
      const stepPosition = Math.round(relativeTime / stepDuration) % pattern.length;
      
      if (stepPosition >= 0 && stepPosition < pattern.length && beat.confidence > 0.6) {
        newPattern[beat.type][stepPosition] = true;
      }
    });

    return newPattern;
  }, [detectedBeats, stepDuration, isListening]);

  // Display pattern: use detected pattern when listening, otherwise use manual pattern
  const displayPattern = isListening && detectedPattern ? detectedPattern : pattern;

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          const nextStep = (prev + 1) % displayPattern.length;
          // Auto-scroll to next view if needed
          const stepsPerView = 16;
          const newView = Math.floor(nextStep / stepsPerView);
          if (newView !== currentView) {
            setCurrentView(newView);
          }
          return nextStep;
        });
      }, stepDuration);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, stepDuration]);

  // Separate effect for playing sounds based on currentStep
  useEffect(() => {
    if (isPlaying) {
      // Play sounds for active notes at current step
      Object.entries(displayPattern).forEach(([drum, steps]) => {
        if (steps[currentStep]) {
          playDrumSound(drum);
        }
      });

      // Play metronome on beat 1
      if (metronomeEnabled && currentStep % 4 === 0) {
        playMetronome();
      }
    }
  }, [currentStep, isPlaying, displayPattern, metronomeEnabled]);

  // Countdown timer effect
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsPlaying(false);
            toast({
              title: "Time's up!",
              description: "2-minute practice session completed",
            });
            return 120; // Reset to 2:00
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, toast]);

  const playDrumSound = (drum: string) => {
    if (!audioContextRef.current) {
      console.error('Audio context not available');
      return;
    }

    const context = audioContextRef.current;
    
    if (context.state === 'suspended') {
      console.warn('Audio context is suspended, cannot play sound');
      return;
    }

    console.log(`Playing drum sound: ${drum}`);

    // Normalize drum name for consistent matching
    const normalizedDrum = drum.toLowerCase().replace(/[-\s]/g, '');

    if (normalizedDrum.includes('hihat') || normalizedDrum.includes('hat')) {
      // Hi-hat sounds with improved synthesis
      const bufferSize = context.sampleRate * 0.15;
      const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const data = buffer.getChannelData(0);
      
      // Generate metallic noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / bufferSize * 8);
      }
      
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      
      // Filter chain for hi-hat character
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(7000, context.currentTime);
      
      const bandpass = context.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(10000, context.currentTime);
      bandpass.Q.setValueAtTime(1.5, context.currentTime);
      
      const gainNode = context.createGain();
      
      noise.connect(highpass);
      highpass.connect(bandpass);
      bandpass.connect(gainNode);
      gainNode.connect(context.destination);
      
      // Different envelope for open vs closed hat
      const isOpenHat = normalizedDrum.includes('open') || normalizedDrum.includes('crash');
      const duration = isOpenHat ? 0.3 : 0.06;
      
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.25, context.currentTime + 0.001);
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      noise.start(context.currentTime);
      noise.stop(context.currentTime + duration);
      
    } else if (normalizedDrum.includes('snare') || normalizedDrum.includes('rim')) {
      // Realistic snare with complex acoustic modeling
      
      // Shell body resonance (multiple modes)
      const shellOsc1 = context.createOscillator();
      const shellOsc2 = context.createOscillator();
      const shellOsc3 = context.createOscillator();
      const shellGain = context.createGain();
      
      // Fundamental and overtones for shell body
      shellOsc1.frequency.setValueAtTime(240, context.currentTime);
      shellOsc1.frequency.exponentialRampToValueAtTime(100, context.currentTime + 0.04);
      shellOsc1.frequency.exponentialRampToValueAtTime(85, context.currentTime + 0.08);
      shellOsc1.type = 'triangle';
      
      shellOsc2.frequency.setValueAtTime(180, context.currentTime);
      shellOsc2.frequency.exponentialRampToValueAtTime(75, context.currentTime + 0.05);
      shellOsc2.type = 'sine';
      
      shellOsc3.frequency.setValueAtTime(320, context.currentTime); // Higher overtone
      shellOsc3.frequency.exponentialRampToValueAtTime(140, context.currentTime + 0.03);
      shellOsc3.type = 'sawtooth';
      
      shellOsc1.connect(shellGain);
      shellOsc2.connect(shellGain);
      shellOsc3.connect(shellGain);
      
      // Snare buzz (multiple filtered noise sources)
      const buzzSize = context.sampleRate * 0.15;
      const buzzBuffer = context.createBuffer(1, buzzSize, context.sampleRate);
      const buzzData = buzzBuffer.getChannelData(0);
      
      // Create realistic snare buzz pattern
      for (let i = 0; i < buzzSize; i++) {
        const decay = Math.exp(-i / buzzSize * 6);
        buzzData[i] = (Math.random() * 2 - 1) * decay;
      }
      
      const buzz = context.createBufferSource();
      buzz.buffer = buzzBuffer;
      
      // Multiple filters for snare character
      const buzzHighpass = context.createBiquadFilter();
      buzzHighpass.type = 'highpass';
      buzzHighpass.frequency.setValueAtTime(1800, context.currentTime);
      buzzHighpass.Q.setValueAtTime(0.7, context.currentTime);
      
      const buzzBandpass = context.createBiquadFilter();
      buzzBandpass.type = 'bandpass';
      buzzBandpass.frequency.setValueAtTime(4500, context.currentTime);
      buzzBandpass.Q.setValueAtTime(1.2, context.currentTime);
      
      const buzzGain = context.createGain();
      buzz.connect(buzzHighpass);
      buzzHighpass.connect(buzzBandpass);
      buzzBandpass.connect(buzzGain);
      
      // Stick attack transient
      const attackNoise = context.createBuffer(1, context.sampleRate * 0.02, context.sampleRate);
      const attackData = attackNoise.getChannelData(0);
      
      for (let i = 0; i < attackData.length; i++) {
        const envelope = Math.exp(-i / attackData.length * 20);
        attackData[i] = (Math.random() * 2 - 1) * envelope;
      }
      
      const attack = context.createBufferSource();
      attack.buffer = attackNoise;
      
      const attackFilter = context.createBiquadFilter();
      attackFilter.type = 'highpass';
      attackFilter.frequency.setValueAtTime(3000, context.currentTime);
      
      const attackGain = context.createGain();
      attack.connect(attackFilter);
      attackFilter.connect(attackGain);
      
      // Wooden rim sound component
      const rimOsc = context.createOscillator();
      const rimGain = context.createGain();
      
      rimOsc.frequency.setValueAtTime(800, context.currentTime);
      rimOsc.frequency.exponentialRampToValueAtTime(400, context.currentTime + 0.015);
      rimOsc.type = 'square';
      
      rimOsc.connect(rimGain);
      
      // Body resonance filtering
      const bodyFilter = context.createBiquadFilter();
      bodyFilter.type = 'peaking';
      bodyFilter.frequency.setValueAtTime(200, context.currentTime);
      bodyFilter.Q.setValueAtTime(2, context.currentTime);
      bodyFilter.gain.setValueAtTime(4, context.currentTime);
      
      // Presence boost for realism
      const presenceFilter = context.createBiquadFilter();
      presenceFilter.type = 'peaking';
      presenceFilter.frequency.setValueAtTime(2500, context.currentTime);
      presenceFilter.Q.setValueAtTime(1.5, context.currentTime);
      presenceFilter.gain.setValueAtTime(3, context.currentTime);
      
      // Compression for punch
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-20, context.currentTime);
      compressor.knee.setValueAtTime(15, context.currentTime);
      compressor.ratio.setValueAtTime(8, context.currentTime);
      compressor.attack.setValueAtTime(0.001, context.currentTime);
      compressor.release.setValueAtTime(0.1, context.currentTime);
      
      // Mix all components
      const snarePreMix = context.createGain();
      shellGain.connect(bodyFilter);
      bodyFilter.connect(snarePreMix);
      buzzGain.connect(snarePreMix);
      attackGain.connect(snarePreMix);
      rimGain.connect(snarePreMix);
      
      // Process through presence and compression
      snarePreMix.connect(presenceFilter);
      presenceFilter.connect(compressor);
      
      const snareMix = context.createGain();
      compressor.connect(snareMix);
      snareMix.connect(context.destination);
      
      // Realistic envelopes
      const duration = 0.18;
      
      // Shell body envelope - natural drum decay
      shellGain.gain.setValueAtTime(0.7, context.currentTime);
      shellGain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
      shellGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
      
      // Snare buzz envelope - characteristic buzz decay
      buzzGain.gain.setValueAtTime(0.5, context.currentTime);
      buzzGain.gain.linearRampToValueAtTime(0.4, context.currentTime + 0.005);
      buzzGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Attack transient envelope - very short and punchy
      attackGain.gain.setValueAtTime(0.6, context.currentTime);
      attackGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.01);
      
      // Rim component envelope
      rimGain.gain.setValueAtTime(0.25, context.currentTime);
      rimGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.02);
      
      // Overall mix envelope
      snareMix.gain.setValueAtTime(0.5, context.currentTime);
      snareMix.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Start all sound sources
      shellOsc1.start(context.currentTime);
      shellOsc1.stop(context.currentTime + 0.1);
      shellOsc2.start(context.currentTime);
      shellOsc2.stop(context.currentTime + 0.1);
      shellOsc3.start(context.currentTime);
      shellOsc3.stop(context.currentTime + 0.05);
      
      buzz.start(context.currentTime);
      buzz.stop(context.currentTime + duration);
      
      attack.start(context.currentTime);
      attack.stop(context.currentTime + 0.02);
      
      rimOsc.start(context.currentTime);
      rimOsc.stop(context.currentTime + 0.025);
      
    } else {
      // Ultimate bass-heavy kick drum
      
      // Primary kick oscillator (fundamental)
      const kickOsc = context.createOscillator();
      const kickGain = context.createGain();
      
      kickOsc.frequency.setValueAtTime(80, context.currentTime);
      kickOsc.frequency.exponentialRampToValueAtTime(50, context.currentTime + 0.04);
      kickOsc.frequency.exponentialRampToValueAtTime(35, context.currentTime + 0.12);
      kickOsc.frequency.exponentialRampToValueAtTime(28, context.currentTime + 0.25);
      kickOsc.type = 'sine';
      
      // Deep sub-bass (octave below)
      const subOsc1 = context.createOscillator();
      const subGain1 = context.createGain();
      
      subOsc1.frequency.setValueAtTime(40, context.currentTime);
      subOsc1.frequency.exponentialRampToValueAtTime(25, context.currentTime + 0.06);
      subOsc1.frequency.exponentialRampToValueAtTime(17.5, context.currentTime + 0.15);
      subOsc1.frequency.exponentialRampToValueAtTime(14, context.currentTime + 0.3);
      subOsc1.type = 'sine';
      
      // Ultra-deep sub (two octaves below)
      const subOsc2 = context.createOscillator();
      const subGain2 = context.createGain();
      
      subOsc2.frequency.setValueAtTime(20, context.currentTime);
      subOsc2.frequency.exponentialRampToValueAtTime(12.5, context.currentTime + 0.08);
      subOsc2.frequency.exponentialRampToValueAtTime(8.75, context.currentTime + 0.2);
      subOsc2.frequency.exponentialRampToValueAtTime(7, context.currentTime + 0.35);
      subOsc2.type = 'sine';
      
      // Extreme sub-bass (almost infrasonic)
      const subOsc3 = context.createOscillator();
      const subGain3 = context.createGain();
      
      subOsc3.frequency.setValueAtTime(10, context.currentTime);
      subOsc3.frequency.exponentialRampToValueAtTime(6.25, context.currentTime + 0.1);
      subOsc3.frequency.exponentialRampToValueAtTime(4.4, context.currentTime + 0.25);
      subOsc3.type = 'sine';
      
      // Bass harmonic for fullness
      const bassHarmonic = context.createOscillator();
      const bassHarmonicGain = context.createGain();
      
      bassHarmonic.frequency.setValueAtTime(160, context.currentTime);
      bassHarmonic.frequency.exponentialRampToValueAtTime(100, context.currentTime + 0.03);
      bassHarmonic.frequency.exponentialRampToValueAtTime(70, context.currentTime + 0.08);
      bassHarmonic.type = 'triangle';
      
      // Attack transient
      const clickOsc = context.createOscillator();
      const clickGain = context.createGain();
      
      clickOsc.frequency.setValueAtTime(2500, context.currentTime);
      clickOsc.frequency.exponentialRampToValueAtTime(200, context.currentTime + 0.005);
      clickOsc.type = 'square';
      
      // Bass enhancement with gentle saturation
      const bassShaper = context.createWaveShaper();
      const bassCurve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i - 128) / 128;
        // Gentle bass enhancement curve
        bassCurve[i] = Math.tanh(x * 2.2) * 0.95;
      }
      bassShaper.curve = bassCurve;
      bassShaper.oversample = '2x';
      
      // Multi-stage filtering for bass shaping
      const bassBoost = context.createBiquadFilter();
      bassBoost.type = 'peaking';
      bassBoost.frequency.setValueAtTime(45, context.currentTime);
      bassBoost.Q.setValueAtTime(1.5, context.currentTime);
      bassBoost.gain.setValueAtTime(6, context.currentTime); // 6dB boost at 45Hz
      
      const subBoost = context.createBiquadFilter();
      subBoost.type = 'peaking';
      subBoost.frequency.setValueAtTime(25, context.currentTime);
      subBoost.Q.setValueAtTime(2, context.currentTime);
      subBoost.gain.setValueAtTime(8, context.currentTime); // 8dB boost at 25Hz
      
      const lowPass = context.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.setValueAtTime(200, context.currentTime);
      lowPass.frequency.exponentialRampToValueAtTime(120, context.currentTime + 0.06);
      lowPass.Q.setValueAtTime(2.5, context.currentTime);
      
      // High-pass to prevent speaker damage
      const protectiveHP = context.createBiquadFilter();
      protectiveHP.type = 'highpass';
      protectiveHP.frequency.setValueAtTime(20, context.currentTime);
      
      // Connect the bass-heavy signal chain
      kickOsc.connect(kickGain);
      subOsc1.connect(subGain1);
      subOsc2.connect(subGain2);
      subOsc3.connect(subGain3);
      bassHarmonic.connect(bassHarmonicGain);
      clickOsc.connect(clickGain);
      
      // Mix all bass components
      const bassMix = context.createGain();
      kickGain.connect(bassMix);
      subGain1.connect(bassMix);
      subGain2.connect(bassMix);
      subGain3.connect(bassMix);
      bassHarmonicGain.connect(bassMix);
      
      // Process bass through enhancement chain
      bassMix.connect(bassShaper);
      bassShaper.connect(bassBoost);
      bassBoost.connect(subBoost);
      subBoost.connect(lowPass);
      lowPass.connect(protectiveHP);
      
      // Final mix with attack click
      const finalMix = context.createGain();
      protectiveHP.connect(finalMix);
      clickGain.connect(finalMix);
      finalMix.connect(context.destination);
      
      // Bass-optimized envelopes
      const duration = 0.5;
      
      // Main kick envelope
      kickGain.gain.setValueAtTime(0.9, context.currentTime);
      kickGain.gain.linearRampToValueAtTime(0.8, context.currentTime + 0.01);
      kickGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration * 0.65);
      
      // Sub-bass 1 envelope - powerful and sustained
      subGain1.gain.setValueAtTime(0.8, context.currentTime);
      subGain1.gain.linearRampToValueAtTime(0.7, context.currentTime + 0.02);
      subGain1.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration * 0.8);
      
      // Ultra-deep sub envelope - maximum sustain
      subGain2.gain.setValueAtTime(0.6, context.currentTime);
      subGain2.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.03);
      subGain2.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration * 0.9);
      
      // Extreme sub envelope - longest tail for maximum bass
      subGain3.gain.setValueAtTime(0.4, context.currentTime);
      subGain3.gain.linearRampToValueAtTime(0.35, context.currentTime + 0.04);
      subGain3.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Bass harmonic envelope
      bassHarmonicGain.gain.setValueAtTime(0.35, context.currentTime);
      bassHarmonicGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.06);
      
      // Click envelope
      clickGain.gain.setValueAtTime(0.45, context.currentTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.008);
      
      // Final mix envelope with bass emphasis
      finalMix.gain.setValueAtTime(0.85, context.currentTime);
      finalMix.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Start all oscillators
      kickOsc.start(context.currentTime);
      kickOsc.stop(context.currentTime + duration);
      subOsc1.start(context.currentTime);
      subOsc1.stop(context.currentTime + duration);
      subOsc2.start(context.currentTime);
      subOsc2.stop(context.currentTime + duration);
      subOsc3.start(context.currentTime);
      subOsc3.stop(context.currentTime + duration);
      bassHarmonic.start(context.currentTime);
      bassHarmonic.stop(context.currentTime + 0.08);
      clickOsc.start(context.currentTime);
      clickOsc.stop(context.currentTime + 0.01);
    }
  };

  const playMetronome = () => {
    if (!audioContextRef.current) return;

    const context = audioContextRef.current;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.frequency.setValueAtTime(1000, context.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.05);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.05);
  };

  const togglePlay = async () => {
    // Resume audio context if suspended (required by browser autoplay policies)
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('Audio context resumed successfully');
      } catch (error) {
        console.error('Failed to resume audio context:', error);
        toast({
          title: "Audio Error",
          description: "Failed to start audio. Please check your browser settings.",
          variant: "destructive"
        });
        return;
      }
    }

    setIsPlaying(!isPlaying);
    if (!isPlaying) {
      toast({
        title: "Playing",
        description: "Drum pattern started",
      });
    }
  };

  const reset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    setTimeRemaining(120); // Reset timer to 2:00
    toast({
      title: "Reset",
      description: "Pattern reset to beginning",
    });
  };

  const changeBpm = (delta: number) => {
    setBpm(prev => Math.max(60, Math.min(200, prev + delta)));
  };

  // Helper function to get drum display info
  const getDrumInfo = (instrument: string) => {
    const drumMap: Record<string, { name: string; symbol: string; color: string }> = {
      'Kick': { name: 'Kick Drum', symbol: '●', color: 'text-red-500' },
      'Snare': { name: 'Snare Drum', symbol: '×', color: 'text-orange-500' },
      'Hi-Hat': { name: 'Hi-Hat', symbol: '○', color: 'text-blue-500' },
      'kick': { name: 'Kick Drum', symbol: '●', color: 'text-red-500' },
      'snare': { name: 'Snare Drum', symbol: '×', color: 'text-orange-500' },
      'hihat': { name: 'Hi-Hat (Closed)', symbol: '○', color: 'text-blue-500' },
      'openhat': { name: 'Hi-Hat (Open)', symbol: '◎', color: 'text-cyan-500' }
    };
    
    return drumMap[instrument] || { name: instrument, symbol: '●', color: 'text-gray-500' };
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const toggleStep = (drum: string, step: number) => {
    setPattern(prev => ({
      ...prev,
      [drum]: (prev[drum] as boolean[]).map((active, index) => 
        index === step ? !active : active
      )
    }));
  };

  const clearPattern = () => {
    const clearedPattern: DrumPattern = { length: pattern.length };
    
    // Clear all instrument patterns
    Object.keys(pattern).forEach(key => {
      if (key !== 'length') {
        clearedPattern[key] = new Array(pattern.length).fill(false);
      }
    });
    
    setPattern(clearedPattern);
    toast({
      title: "Cleared",
      description: "All patterns cleared",
    });
  };

  const loadCSVPattern = async () => {
    try {
      const newPattern = await loadPatternFromFile();
      setPattern(newPattern);
      
      // Analyze loaded pattern to show component info
      const activeComponents: string[] = [];
      let totalBeats = 0;
      
      Object.entries(newPattern).forEach(([drumType, steps]) => {
        if (drumType !== 'length' && Array.isArray(steps)) {
          const activeSteps = (steps as boolean[]).filter(Boolean).length;
          if (activeSteps > 0) {
            activeComponents.push(drumType);
            totalBeats += activeSteps;
          }
        }
      });
      
      setLoadedPatternInfo({
        componentsFound: activeComponents,
        totalBeats
      });
      
      toast({
        title: "Pattern Loaded",
        description: `Found ${activeComponents.length} drum components with ${totalBeats} beats`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load drum pattern",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Pattern Instructions */}
        <div className="text-center mb-6">
          <p className="text-muted-foreground text-lg">
            Practice Name
          </p>
        </div>

        {/* Drum Components Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Available Drum Components */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Available Drum Components</h3>
            <div className="space-y-2">
              {/* Drum Info */}
              {Object.keys(displayPattern).filter(key => key !== 'length').map((instrument) => {
                const steps = displayPattern[instrument] as boolean[];
                if (!Array.isArray(steps)) return null;
                
                const isActive = steps.some(Boolean);
                const drumInfo = getDrumInfo(instrument);
                
                return (
                  <div key={instrument} className={cn("flex items-center gap-3 p-2 rounded", isActive ? "bg-accent/10" : "opacity-60")}>
                    <span className={cn("text-lg font-mono", drumInfo.color)}>{drumInfo.symbol}</span>
                    <span className="text-sm font-medium">{drumInfo.name}</span>
                    {isActive && (
                      <span className="ml-auto text-xs text-accent font-medium">
                        {steps.filter(Boolean).length} beats
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Loaded Pattern Info */}
          {loadedPatternInfo && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Loaded Pattern Info</h3>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Components Found:</span>
                  <span className="ml-2 font-medium">{loadedPatternInfo.componentsFound.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Total Beats:</span>
                  <span className="ml-2 font-medium">{loadedPatternInfo.totalBeats}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Active: {loadedPatternInfo.componentsFound.join(', ')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detection Status */}
        {isListening && detectedBeats.length > 0 && (
          <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mb-4">
            <div className="text-sm font-medium text-accent mb-2">
              Detected Beats ({detectedBeats.length})
            </div>
            <div className="text-xs text-muted-foreground">
              Last detected: {detectedBeats[detectedBeats.length - 1]?.type} 
              (confidence: {Math.round((detectedBeats[detectedBeats.length - 1]?.confidence || 0) * 100)}%)
            </div>
          </div>
        )}

        {/* Main Pattern Content */}
        <div className="space-y-6">
          {/* Drum Components Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Available Drum Components */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Available Drum Components</h3>
              <div className="space-y-2">
                {Object.keys(displayPattern).filter(key => key !== 'length').map((instrument) => {
                  const steps = displayPattern[instrument] as boolean[];
                  if (!Array.isArray(steps)) return null;
                  
                  const isActive = steps.some(Boolean);
                  const drumInfo = getDrumInfo(instrument);
                  
                  return (
                    <div key={instrument} className={cn("flex items-center gap-3 p-2 rounded", isActive ? "bg-accent/10" : "opacity-60")}>
                      <span className={cn("text-lg font-mono", drumInfo.color)}>{drumInfo.symbol}</span>
                      <span className="text-sm font-medium">{drumInfo.name}</span>
                      {isActive && (
                        <span className="ml-auto text-xs text-accent font-medium">
                          {steps.filter(Boolean).length} beats
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Loaded Pattern Info */}
            {loadedPatternInfo && (
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Loaded Pattern Info</h3>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Components Found:</span>
                    <span className="ml-2 font-medium">{loadedPatternInfo.componentsFound.length}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total Beats:</span>
                    <span className="ml-2 font-medium">{loadedPatternInfo.totalBeats}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Active: {loadedPatternInfo.componentsFound.join(', ')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Detection Status */}
          {isListening && detectedBeats.length > 0 && (
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mb-4">
              <div className="text-sm font-medium text-accent mb-2">
                Detected Beats ({detectedBeats.length})
              </div>
              <div className="text-xs text-muted-foreground">
                Last detected: {detectedBeats[detectedBeats.length - 1]?.type} 
                (confidence: {Math.round((detectedBeats[detectedBeats.length - 1]?.confidence || 0) * 100)}%)
              </div>
            </div>
          )}

          {/* Pattern Navigation */}
          <PatternNavigation
            currentView={currentView}
            totalSteps={displayPattern.length}
            stepsPerView={16}
            onViewChange={setCurrentView}
          />

          {/* Drum Grid */}
            <DrumGrid
              pattern={displayPattern}
              currentStep={currentStep}
              currentView={currentView}
              stepsPerView={16}
              onStepToggle={toggleStep}
              onClearPattern={clearPattern}
              metronomeEnabled={metronomeEnabled}
              onMetronomeToggle={() => setMetronomeEnabled(!metronomeEnabled)}
              onTogglePlay={togglePlay}
              isPlaying={isPlaying}
              onLoadPattern={loadCSVPattern}
              isLoadingPattern={isLoadingPattern}
            />

          {/* Bottom Toolbar */}
          <div className="flex justify-between items-center mt-8 max-w-4xl mx-auto">
            {/* Left Side Controls */}
            <div className="flex items-center gap-4">
              {/* Custom Metronome Toggle */}
              <div className="flex items-center gap-3 rounded-[20px] px-4 py-2" style={{ backgroundColor: '#333537' }}>
                <button
                  onClick={() => setMetronomeEnabled(!metronomeEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2",
                    metronomeEnabled ? "bg-violet-600" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-lg",
                      metronomeEnabled ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
                
                {/* Metronome Icon */}
                <div className="flex items-center justify-center w-8 h-8 rounded-full" style={{ backgroundColor: metronomeEnabled ? '#BFA5C4' : '#786C7D' }}>
                  <img 
                    src="/lovable-uploads/6591da94-1dfe-488c-93dc-4572ae65a891.png" 
                    alt="Metronome"
                    className="w-8 h-8"
                  />
                </div>
              </div>

              {/* Drum Listener Toggle */}
              <div className="flex items-center gap-3 rounded-[20px] px-4 py-2" style={{ backgroundColor: '#333537' }}>
                <button
                  onClick={handleListenerToggle}
                  disabled={!isModelLoaded}
                  className={cn(
                    "relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
                    isListening ? "bg-red-600" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-lg",
                      isListening ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
                
                {/* Microphone Icon */}
                <div className="flex items-center justify-center w-8 h-8 rounded-full" style={{ backgroundColor: isListening ? '#ff6b6b' : '#786C7D' }}>
                  {isListening ? (
                    <Mic className="h-4 w-4 text-white" />
                  ) : (
                    <MicOff className="h-4 w-4 text-white" />
                  )}
                </div>
                
                {/* Audio Level Indicator */}
                {isListening && (
                  <div className="w-8 h-4 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-400 transition-all duration-100 rounded-full"
                      style={{ width: `${audioLevel * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Main Controls - Center/Right */}
            <div className="flex items-center gap-4">
              {/* Tempo Controls */}
              <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => changeBpm(-5)}
                  className="h-8 w-8"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center gap-2 px-3">
                  <div className="w-3 h-3 rounded-full bg-tempo-accent"></div>
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-2xl font-bold text-foreground mx-3">
                    {bpm}
                  </span>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => changeBpm(5)}
                  className="h-8 w-8"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Timer Display */}
              <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
                <div className="text-2xl font-bold text-foreground">
                  {formatTime(timeRemaining)}
                </div>
              </div>

              {/* Play Controls */}
              <Button
                variant="ghost"
                size="icon"
                onClick={reset}
                className="h-12 w-12"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};