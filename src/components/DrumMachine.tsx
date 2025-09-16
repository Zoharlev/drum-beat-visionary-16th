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
  const [patternLength, setPatternLength] = useState<8 | 16>(16);
  const [pattern, setPattern] = useState<DrumPattern>(() => {
    const initialLength = 16;
    return {
      'Kick': new Array(initialLength).fill(false),
      'Snare': new Array(initialLength).fill(false),
      'HH Closed': new Array(initialLength).fill(false),
      'HH Open': new Array(initialLength).fill(false),
      length: initialLength,
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

  const { loadPatternFromFile, isLoading: isLoadingPattern, error: csvError } = useCSVPatternLoader();
  const [loadedPatternInfo, setLoadedPatternInfo] = useState<{
    componentsFound: string[];
    totalBeats: number;
  } | null>(null);

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
      'Kick': new Array(patternLength).fill(false),
      'Snare': new Array(patternLength).fill(false),
      'HH Closed': new Array(patternLength).fill(false),
      'HH Open': new Array(patternLength).fill(false),
      length: patternLength,
    };

    const firstBeatTime = detectedBeats[0]?.timestamp || Date.now();
    
    detectedBeats.forEach(beat => {
      const relativeTime = beat.timestamp - firstBeatTime;
      const stepPosition = Math.round(relativeTime / stepDuration) % patternLength;
      
      if (stepPosition >= 0 && stepPosition < patternLength && beat.confidence > 0.6) {
        // Map detected beat types to instrument names
        let instrumentKey = '';
        if (beat.type === 'kick') instrumentKey = 'Kick';
        else if (beat.type === 'snare') instrumentKey = 'Snare';
        else if (beat.type === 'hihat') instrumentKey = 'HH Closed';
        else if (beat.type === 'openhat') instrumentKey = 'HH Open';
        
        if (instrumentKey && newPattern[instrumentKey]) {
          (newPattern[instrumentKey] as boolean[])[stepPosition] = true;
        }
      }
    });

    return newPattern;
  }, [detectedBeats, stepDuration, isListening, patternLength]);

  // Display pattern: use detected pattern when listening, otherwise use manual pattern
  const displayPattern = isListening && detectedPattern ? detectedPattern : pattern;

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          const nextStep = (prev + 1) % displayPattern.length;
          // Auto-scroll to next view if needed
          const stepsPerView = patternLength;
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
      // Enhanced realistic snare with improved acoustic modeling
      
      // 1. Shell body resonance with better tuning
      const shellOsc1 = context.createOscillator();
      const shellOsc2 = context.createOscillator();
      const shellOsc3 = context.createOscillator();
      const shellGain = context.createGain();
      
      // Improved fundamental frequencies for realistic snare body
      shellOsc1.frequency.setValueAtTime(220, context.currentTime);
      shellOsc1.frequency.exponentialRampToValueAtTime(180, context.currentTime + 0.01);
      shellOsc1.frequency.exponentialRampToValueAtTime(160, context.currentTime + 0.03);
      shellOsc1.frequency.exponentialRampToValueAtTime(140, context.currentTime + 0.08);
      shellOsc1.type = 'sine';
      
      shellOsc2.frequency.setValueAtTime(340, context.currentTime);
      shellOsc2.frequency.exponentialRampToValueAtTime(280, context.currentTime + 0.02);
      shellOsc2.frequency.exponentialRampToValueAtTime(240, context.currentTime + 0.06);
      shellOsc2.type = 'triangle';
      
      shellOsc3.frequency.setValueAtTime(480, context.currentTime);
      shellOsc3.frequency.exponentialRampToValueAtTime(380, context.currentTime + 0.015);
      shellOsc3.frequency.exponentialRampToValueAtTime(320, context.currentTime + 0.04);
      shellOsc3.type = 'sawtooth';
      
      shellOsc1.connect(shellGain);
      shellOsc2.connect(shellGain);
      shellOsc3.connect(shellGain);
      
      // 2. Enhanced snare buzz with more realistic rattle
      const buzzSize = context.sampleRate * 0.2;
      const buzzBuffer = context.createBuffer(1, buzzSize, context.sampleRate);
      const buzzData = buzzBuffer.getChannelData(0);
      
      // Create more authentic snare buzz with irregular pattern
      for (let i = 0; i < buzzSize; i++) {
        const phase = i / buzzSize;
        const decay = Math.exp(-phase * 8);
        const flutter = 1 + Math.sin(phase * 150) * 0.3; // Wire flutter effect
        const randomness = (Math.random() * 2 - 1) * 0.7 + (Math.random() * 2 - 1) * 0.3;
        buzzData[i] = randomness * decay * flutter;
      }
      
      const buzz = context.createBufferSource();
      buzz.buffer = buzzBuffer;
      
      // Improved snare buzz filtering chain
      const buzzHighpass1 = context.createBiquadFilter();
      buzzHighpass1.type = 'highpass';
      buzzHighpass1.frequency.setValueAtTime(2200, context.currentTime);
      buzzHighpass1.Q.setValueAtTime(0.8, context.currentTime);
      
      const buzzBandpass = context.createBiquadFilter();
      buzzBandpass.type = 'bandpass';
      buzzBandpass.frequency.setValueAtTime(5200, context.currentTime);
      buzzBandpass.Q.setValueAtTime(1.8, context.currentTime);
      
      const buzzHighpass2 = context.createBiquadFilter();
      buzzHighpass2.type = 'highpass';
      buzzHighpass2.frequency.setValueAtTime(8000, context.currentTime);
      buzzHighpass2.Q.setValueAtTime(0.5, context.currentTime);
      
      const buzzGain = context.createGain();
      buzz.connect(buzzHighpass1);
      buzzHighpass1.connect(buzzBandpass);
      buzzBandpass.connect(buzzHighpass2);
      buzzHighpass2.connect(buzzGain);
      
      // 3. Sharper stick attack transient
      const attackNoise = context.createBuffer(1, context.sampleRate * 0.008, context.sampleRate);
      const attackData = attackNoise.getChannelData(0);
      
      for (let i = 0; i < attackData.length; i++) {
        const phase = i / attackData.length;
        const envelope = Math.exp(-phase * 35); // Sharper attack
        const crack = Math.sin(phase * 80) * 0.4; // Adding crack character
        attackData[i] = ((Math.random() * 2 - 1) * 0.8 + crack) * envelope;
      }
      
      const attack = context.createBufferSource();
      attack.buffer = attackNoise;
      
      const attackFilter1 = context.createBiquadFilter();
      attackFilter1.type = 'bandpass';
      attackFilter1.frequency.setValueAtTime(4500, context.currentTime);
      attackFilter1.Q.setValueAtTime(2.5, context.currentTime);
      
      const attackFilter2 = context.createBiquadFilter();
      attackFilter2.type = 'highpass';
      attackFilter2.frequency.setValueAtTime(6000, context.currentTime);
      attackFilter2.Q.setValueAtTime(1, context.currentTime);
      
      const attackGain = context.createGain();
      attack.connect(attackFilter1);
      attackFilter1.connect(attackFilter2);
      attackFilter2.connect(attackGain);
      
      // 4. Improved rim/wood component
      const rimOsc = context.createOscillator();
      const rimGain = context.createGain();
      
      rimOsc.frequency.setValueAtTime(1200, context.currentTime);
      rimOsc.frequency.exponentialRampToValueAtTime(800, context.currentTime + 0.008);
      rimOsc.frequency.exponentialRampToValueAtTime(600, context.currentTime + 0.02);
      rimOsc.type = 'square';
      
      rimOsc.connect(rimGain);
      
      // 5. Enhanced filtering chain
      const bodyFilter = context.createBiquadFilter();
      bodyFilter.type = 'peaking';
      bodyFilter.frequency.setValueAtTime(180, context.currentTime);
      bodyFilter.Q.setValueAtTime(1.8, context.currentTime);
      bodyFilter.gain.setValueAtTime(6, context.currentTime);
      
      const crackFilter = context.createBiquadFilter();
      crackFilter.type = 'peaking';
      crackFilter.frequency.setValueAtTime(3200, context.currentTime);
      crackFilter.Q.setValueAtTime(2.2, context.currentTime);
      crackFilter.gain.setValueAtTime(4, context.currentTime);
      
      const presenceFilter = context.createBiquadFilter();
      presenceFilter.type = 'peaking';
      presenceFilter.frequency.setValueAtTime(6800, context.currentTime);
      presenceFilter.Q.setValueAtTime(1.2, context.currentTime);
      presenceFilter.gain.setValueAtTime(3, context.currentTime);
      
      // 6. Improved compression for more punch
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, context.currentTime);
      compressor.knee.setValueAtTime(8, context.currentTime);
      compressor.ratio.setValueAtTime(12, context.currentTime);
      compressor.attack.setValueAtTime(0.0005, context.currentTime);
      compressor.release.setValueAtTime(0.08, context.currentTime);
      
      // 7. Signal routing with better balance
      const snarePreMix = context.createGain();
      shellGain.connect(bodyFilter);
      bodyFilter.connect(snarePreMix);
      buzzGain.connect(snarePreMix);
      attackGain.connect(crackFilter);
      crackFilter.connect(snarePreMix);
      rimGain.connect(snarePreMix);
      
      // Processing chain
      snarePreMix.connect(presenceFilter);
      presenceFilter.connect(compressor);
      
      const snareMix = context.createGain();
      compressor.connect(snareMix);
      snareMix.connect(context.destination);
      
      // 8. Improved envelopes for more realistic decay
      const duration = 0.16;
      
      // Shell body envelope with more natural curve
      shellGain.gain.setValueAtTime(0, context.currentTime);
      shellGain.gain.linearRampToValueAtTime(0.6, context.currentTime + 0.002);
      shellGain.gain.exponentialRampToValueAtTime(0.35, context.currentTime + 0.015);
      shellGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
      
      // Snare buzz envelope with authentic rattle decay
      buzzGain.gain.setValueAtTime(0, context.currentTime);
      buzzGain.gain.linearRampToValueAtTime(0.7, context.currentTime + 0.001);
      buzzGain.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.003);
      buzzGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Attack transient envelope - sharper and more punchy
      attackGain.gain.setValueAtTime(0, context.currentTime);
      attackGain.gain.linearRampToValueAtTime(0.8, context.currentTime + 0.0005);
      attackGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.008);
      
      // Rim component envelope
      rimGain.gain.setValueAtTime(0, context.currentTime);
      rimGain.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.001);
      rimGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.025);
      
      // Overall mix envelope
      snareMix.gain.setValueAtTime(0.6, context.currentTime);
      snareMix.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Start all sound sources
      shellOsc1.start(context.currentTime);
      shellOsc1.stop(context.currentTime + 0.12);
      shellOsc2.start(context.currentTime);
      shellOsc2.stop(context.currentTime + 0.08);
      shellOsc3.start(context.currentTime);
      shellOsc3.stop(context.currentTime + 0.06);
      
      buzz.start(context.currentTime);
      buzz.stop(context.currentTime + duration);
      
      attack.start(context.currentTime);
      attack.stop(context.currentTime + 0.01);
      
      rimOsc.start(context.currentTime);
      rimOsc.stop(context.currentTime + 0.03);
      
    } else {
      // Enhanced professional kick drum with ultra-realistic acoustic modeling
      
      // 1. Improved beater attack transient with sharper impact
      const beaterNoise = context.createBuffer(1, context.sampleRate * 0.006, context.sampleRate);
      const beaterData = beaterNoise.getChannelData(0);
      
      // Generate more realistic beater impact with click character
      for (let i = 0; i < beaterData.length; i++) {
        const phase = i / beaterData.length;
        const envelope = Math.exp(-phase * 40); // Sharper attack
        const click = Math.sin(phase * 120) * 0.3; // Beater click resonance
        beaterData[i] = ((Math.random() * 2 - 1) * 0.8 + click) * envelope;
      }
      
      const beater = context.createBufferSource();
      beater.buffer = beaterNoise;
      
      const beaterFilter1 = context.createBiquadFilter();
      beaterFilter1.type = 'bandpass';
      beaterFilter1.frequency.setValueAtTime(5500, context.currentTime);
      beaterFilter1.Q.setValueAtTime(3, context.currentTime);
      
      const beaterFilter2 = context.createBiquadFilter();
      beaterFilter2.type = 'peaking';
      beaterFilter2.frequency.setValueAtTime(3200, context.currentTime);
      beaterFilter2.Q.setValueAtTime(2, context.currentTime);
      beaterFilter2.gain.setValueAtTime(4, context.currentTime);
      
      const beaterGain = context.createGain();
      beater.connect(beaterFilter1);
      beaterFilter1.connect(beaterFilter2);
      beaterFilter2.connect(beaterGain);
      
      // 2. Enhanced kick fundamental with more aggressive frequency sweep
      const kickOsc = context.createOscillator();
      const kickGain = context.createGain();
      
      kickOsc.frequency.setValueAtTime(72, context.currentTime);
      kickOsc.frequency.exponentialRampToValueAtTime(48, context.currentTime + 0.008);
      kickOsc.frequency.exponentialRampToValueAtTime(35, context.currentTime + 0.025);
      kickOsc.frequency.exponentialRampToValueAtTime(28, context.currentTime + 0.08);
      kickOsc.frequency.exponentialRampToValueAtTime(24, context.currentTime + 0.18);
      kickOsc.type = 'sine';
      
      // 3. Deeper sub-bass layer with enhanced low-end
      const subOsc = context.createOscillator();
      const subGain = context.createGain();
      
      subOsc.frequency.setValueAtTime(36, context.currentTime);
      subOsc.frequency.exponentialRampToValueAtTime(26, context.currentTime + 0.015);
      subOsc.frequency.exponentialRampToValueAtTime(18, context.currentTime + 0.06);
      subOsc.frequency.exponentialRampToValueAtTime(15, context.currentTime + 0.15);
      subOsc.frequency.exponentialRampToValueAtTime(12, context.currentTime + 0.28);
      subOsc.type = 'sine';
      
      // 4. Enhanced body resonance with more harmonic content
      const bodyOsc1 = context.createOscillator();
      const bodyOsc2 = context.createOscillator();
      const bodyOsc3 = context.createOscillator();
      const bodyGain = context.createGain();
      
      bodyOsc1.frequency.setValueAtTime(144, context.currentTime);
      bodyOsc1.frequency.exponentialRampToValueAtTime(108, context.currentTime + 0.02);
      bodyOsc1.frequency.exponentialRampToValueAtTime(84, context.currentTime + 0.08);
      bodyOsc1.type = 'triangle';
      
      bodyOsc2.frequency.setValueAtTime(96, context.currentTime);
      bodyOsc2.frequency.exponentialRampToValueAtTime(72, context.currentTime + 0.03);
      bodyOsc2.frequency.exponentialRampToValueAtTime(56, context.currentTime + 0.1);
      bodyOsc2.type = 'sawtooth';
      
      bodyOsc3.frequency.setValueAtTime(192, context.currentTime); // Higher harmonic
      bodyOsc3.frequency.exponentialRampToValueAtTime(144, context.currentTime + 0.015);
      bodyOsc3.frequency.exponentialRampToValueAtTime(112, context.currentTime + 0.05);
      bodyOsc3.type = 'triangle';
      
      bodyOsc1.connect(bodyGain);
      bodyOsc2.connect(bodyGain);
      bodyOsc3.connect(bodyGain);
      
      // 5. Enhanced punch oscillator with better attack character
      const punchOsc = context.createOscillator();
      const punchGain = context.createGain();
      
      punchOsc.frequency.setValueAtTime(180, context.currentTime);
      punchOsc.frequency.exponentialRampToValueAtTime(120, context.currentTime + 0.005);
      punchOsc.frequency.exponentialRampToValueAtTime(80, context.currentTime + 0.012);
      punchOsc.frequency.exponentialRampToValueAtTime(45, context.currentTime + 0.025);
      punchOsc.type = 'square';
      
      punchOsc.connect(punchGain);
      
      // 6. Enhanced filtering chain for better tone shaping
      
      // Kick fundamental boost
      const kickEQ = context.createBiquadFilter();
      kickEQ.type = 'peaking';
      kickEQ.frequency.setValueAtTime(65, context.currentTime);
      kickEQ.Q.setValueAtTime(1.8, context.currentTime);
      kickEQ.gain.setValueAtTime(6, context.currentTime);
      
      // Sub-bass enhancement
      const subBoost = context.createBiquadFilter();
      subBoost.type = 'lowshelf';
      subBoost.frequency.setValueAtTime(85, context.currentTime);
      subBoost.gain.setValueAtTime(8, context.currentTime);
      
      // Attack presence with better definition
      const presenceBoost = context.createBiquadFilter();
      presenceBoost.type = 'peaking';
      presenceBoost.frequency.setValueAtTime(3200, context.currentTime);
      presenceBoost.Q.setValueAtTime(2.5, context.currentTime);
      presenceBoost.gain.setValueAtTime(5, context.currentTime);
      
      // Improved mud removal
      const mudCut = context.createBiquadFilter();
      mudCut.type = 'peaking';
      mudCut.frequency.setValueAtTime(380, context.currentTime);
      mudCut.Q.setValueAtTime(1.8, context.currentTime);
      mudCut.gain.setValueAtTime(-6, context.currentTime);
      
      // High-mid clarity
      const clarityFilter = context.createBiquadFilter();
      clarityFilter.type = 'peaking';
      clarityFilter.frequency.setValueAtTime(1800, context.currentTime);
      clarityFilter.Q.setValueAtTime(1.5, context.currentTime);
      clarityFilter.gain.setValueAtTime(2, context.currentTime);
      
      // Enhanced compression for maximum punch
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-10, context.currentTime);
      compressor.knee.setValueAtTime(6, context.currentTime);
      compressor.ratio.setValueAtTime(8, context.currentTime);
      compressor.attack.setValueAtTime(0.0003, context.currentTime);
      compressor.release.setValueAtTime(0.04, context.currentTime);
      
      // Improved wave shaping for character
      const saturator = context.createWaveShaper();
      const satCurve = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        const x = (i - 256) / 256;
        // Enhanced asymmetric saturation for warmth
        satCurve[i] = Math.tanh(x * 2.2) * 0.85 + Math.sin(x * 3.14159) * 0.1;
      }
      saturator.curve = satCurve;
      saturator.oversample = '4x';
      
      // 7. Enhanced signal routing
      kickOsc.connect(kickGain);
      subOsc.connect(subGain);
      
      // Pre-mix for main kick components
      const kickMix = context.createGain();
      kickGain.connect(kickEQ);
      kickEQ.connect(kickMix);
      subGain.connect(subBoost);
      subBoost.connect(kickMix);
      bodyGain.connect(kickMix);
      punchGain.connect(kickMix);
      
      // Enhanced processing chain
      kickMix.connect(saturator);
      saturator.connect(mudCut);
      mudCut.connect(clarityFilter);
      clarityFilter.connect(presenceBoost);
      presenceBoost.connect(compressor);
      
      // Final mix
      const finalKick = context.createGain();
      compressor.connect(finalKick);
      beaterGain.connect(finalKick);
      finalKick.connect(context.destination);
      
      // 8. Enhanced realistic envelopes with better curves
      const duration = 0.35;
      
      // Beater attack envelope - ultra-punchy
      beaterGain.gain.setValueAtTime(0, context.currentTime);
      beaterGain.gain.linearRampToValueAtTime(0.6, context.currentTime + 0.0003);
      beaterGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.006);
      
      // Main kick envelope with more natural curve
      kickGain.gain.setValueAtTime(0, context.currentTime);
      kickGain.gain.linearRampToValueAtTime(0.9, context.currentTime + 0.003);
      kickGain.gain.exponentialRampToValueAtTime(0.4, context.currentTime + 0.02);
      kickGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      
      // Sub-bass envelope for maximum weight
      subGain.gain.setValueAtTime(0, context.currentTime);
      subGain.gain.linearRampToValueAtTime(0.8, context.currentTime + 0.008);
      subGain.gain.exponentialRampToValueAtTime(0.5, context.currentTime + 0.03);
      subGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
      
      // Body resonance envelope
      bodyGain.gain.setValueAtTime(0, context.currentTime);
      bodyGain.gain.linearRampToValueAtTime(0.4, context.currentTime + 0.005);
      bodyGain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.025);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      
      // Punch envelope for sharp attack
      punchGain.gain.setValueAtTime(0, context.currentTime);
      punchGain.gain.linearRampToValueAtTime(0.7, context.currentTime + 0.002);
      punchGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.018);
      
      // Final mix envelope
      finalKick.gain.setValueAtTime(0.8, context.currentTime);
      finalKick.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // 9. Start all sound sources with precise timing
      beater.start(context.currentTime);
      beater.stop(context.currentTime + 0.008);
      
      kickOsc.start(context.currentTime);
      kickOsc.stop(context.currentTime + 0.2);
      
      subOsc.start(context.currentTime);
      subOsc.stop(context.currentTime + 0.3);
      
      bodyOsc1.start(context.currentTime);
      bodyOsc1.stop(context.currentTime + 0.15);
      
      bodyOsc2.start(context.currentTime);
      bodyOsc2.stop(context.currentTime + 0.12);
      
      bodyOsc3.start(context.currentTime);
      bodyOsc3.stop(context.currentTime + 0.08);
      
      punchOsc.start(context.currentTime);
      punchOsc.stop(context.currentTime + 0.02);
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

  const changePatternLength = (newLength: 8 | 16) => {
    setPatternLength(newLength);
    setCurrentStep(0);
    setCurrentView(0);
    
    const newPattern: DrumPattern = { length: newLength };
    
    Object.keys(pattern).forEach(key => {
      if (key !== 'length') {
        const oldSteps = pattern[key] as boolean[];
        if (newLength === 8) {
          // Take first 8 steps when going from 16 to 8
          newPattern[key] = oldSteps.slice(0, 8);
        } else {
          // Extend to 16 steps when going from 8 to 16, duplicating the pattern
          newPattern[key] = [...oldSteps, ...oldSteps];
        }
      }
    });
    
    setPattern(newPattern);
    toast({
      title: "Pattern Length Changed",
      description: `Now using ${newLength}-step pattern (${newLength === 8 ? '1 bar' : '2 bars'})`,
    });
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
    const clearedPattern: DrumPattern = { length: patternLength };
    
    // Clear all instrument patterns
    Object.keys(pattern).forEach(key => {
      if (key !== 'length') {
        clearedPattern[key] = new Array(patternLength).fill(false);
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

          {/* Pattern Length Controls */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className="text-sm font-medium text-muted-foreground">Pattern Length:</span>
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
              <Button
                variant={patternLength === 8 ? "default" : "ghost"}
                size="sm"
                onClick={() => changePatternLength(8)}
                className="h-8 px-3"
              >
                8 Steps (1 Bar)
              </Button>
              <Button
                variant={patternLength === 16 ? "default" : "ghost"}
                size="sm"
                onClick={() => changePatternLength(16)}
                className="h-8 px-3"
              >
                16 Steps (2 Bars)
              </Button>
            </div>
          </div>

          {/* Pattern Navigation */}
          <PatternNavigation
            currentView={currentView}
            totalSteps={displayPattern.length}
            stepsPerView={patternLength}
            onViewChange={setCurrentView}
          />

          {/* Drum Grid */}
            <DrumGrid
              pattern={displayPattern}
              currentStep={currentStep}
              currentView={currentView}
              stepsPerView={patternLength}
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