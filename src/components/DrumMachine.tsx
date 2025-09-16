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
      // Improved snare with better balance
      
      // Body oscillators
      const osc1 = context.createOscillator();
      const osc2 = context.createOscillator();
      const bodyGain = context.createGain();
      
      osc1.frequency.setValueAtTime(220, context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(80, context.currentTime + 0.03);
      osc1.type = 'triangle';
      
      osc2.frequency.setValueAtTime(150, context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(60, context.currentTime + 0.03);
      osc2.type = 'sine';
      
      osc1.connect(bodyGain);
      osc2.connect(bodyGain);
      
      // Snare noise
      const noiseSize = context.sampleRate * 0.12;
      const noiseBuffer = context.createBuffer(1, noiseSize, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      
      for (let i = 0; i < noiseSize; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
      
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(2000, context.currentTime);
      
      const noiseGain = context.createGain();
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      
      // Mix components
      const mixGain = context.createGain();
      bodyGain.connect(mixGain);
      noiseGain.connect(mixGain);
      mixGain.connect(context.destination);
      
      // Envelopes
      const duration = 0.12;
      
      bodyGain.gain.setValueAtTime(0.6, context.currentTime);
      bodyGain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.02);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.06);
      
      noiseGain.gain.setValueAtTime(0.35, context.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      mixGain.gain.setValueAtTime(0.4, context.currentTime);
      mixGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      osc1.start(context.currentTime);
      osc1.stop(context.currentTime + 0.06);
      osc2.start(context.currentTime);
      osc2.stop(context.currentTime + 0.06);
      noise.start(context.currentTime);
      noise.stop(context.currentTime + duration);
      
    } else {
      // Enhanced kick drum with powerful sub-bass
      
      // Primary kick oscillator (fundamental)
      const kickOsc = context.createOscillator();
      const kickGain = context.createGain();
      
      kickOsc.frequency.setValueAtTime(75, context.currentTime);
      kickOsc.frequency.exponentialRampToValueAtTime(45, context.currentTime + 0.04);
      kickOsc.frequency.exponentialRampToValueAtTime(32, context.currentTime + 0.12);
      kickOsc.frequency.exponentialRampToValueAtTime(25, context.currentTime + 0.25);
      kickOsc.type = 'sine';
      
      // Deep sub-bass (octave below)
      const subOsc1 = context.createOscillator();
      const subGain1 = context.createGain();
      
      subOsc1.frequency.setValueAtTime(37.5, context.currentTime); // Half frequency
      subOsc1.frequency.exponentialRampToValueAtTime(22.5, context.currentTime + 0.06);
      subOsc1.frequency.exponentialRampToValueAtTime(16, context.currentTime + 0.15);
      subOsc1.frequency.exponentialRampToValueAtTime(12.5, context.currentTime + 0.3);
      subOsc1.type = 'sine';
      
      // Ultra-deep sub (two octaves below for massive low-end)
      const subOsc2 = context.createOscillator();
      const subGain2 = context.createGain();
      
      subOsc2.frequency.setValueAtTime(18.75, context.currentTime);
      subOsc2.frequency.exponentialRampToValueAtTime(11.25, context.currentTime + 0.08);
      subOsc2.frequency.exponentialRampToValueAtTime(8, context.currentTime + 0.2);
      subOsc2.type = 'sine';
      
      // Harmonic for body warmth
      const harmonicOsc = context.createOscillator();
      const harmonicGain = context.createGain();
      
      harmonicOsc.frequency.setValueAtTime(150, context.currentTime); // 2nd harmonic
      harmonicOsc.frequency.exponentialRampToValueAtTime(90, context.currentTime + 0.03);
      harmonicOsc.frequency.exponentialRampToValueAtTime(64, context.currentTime + 0.08);
      harmonicOsc.type = 'triangle';
      
      // Attack transient for punch
      const clickOsc = context.createOscillator();
      const clickGain = context.createGain();
      
      clickOsc.frequency.setValueAtTime(2200, context.currentTime);
      clickOsc.frequency.exponentialRampToValueAtTime(180, context.currentTime + 0.005);
      clickOsc.type = 'square';
      
      // Saturation for warmth and character
      const waveshaper = context.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i - 128) / 128;
        // Gentle saturation curve
        curve[i] = Math.tanh(x * 1.5) * 0.9;
      }
      waveshaper.curve = curve;
      
      // Low-pass filter with resonance for punch
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, context.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, context.currentTime + 0.06);
      filter.Q.setValueAtTime(2, context.currentTime); // More resonance for punch
      
      // High-pass to clean up mud
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(25, context.currentTime);
      
      // Connect signal chain
      kickOsc.connect(kickGain);
      subOsc1.connect(subGain1);
      subOsc2.connect(subGain2);
      harmonicOsc.connect(harmonicGain);
      clickOsc.connect(clickGain);
      
      // Mix low-frequency components
      const bassGain = context.createGain();
      kickGain.connect(bassGain);
      subGain1.connect(bassGain);
      subGain2.connect(bassGain);
      harmonicGain.connect(bassGain);
      
      // Process bass through saturation and filtering
      bassGain.connect(waveshaper);
      waveshaper.connect(filter);
      filter.connect(highpass);
      
      // Mix with click
      const finalMix = context.createGain();
      highpass.connect(finalMix);
      clickGain.connect(finalMix);
      finalMix.connect(context.destination);
      
      // Improved envelopes for maximum impact
      const duration = 0.45;
      
      // Main kick envelope - punchy attack, controlled decay
      kickGain.gain.setValueAtTime(0.85, context.currentTime);
      kickGain.gain.linearRampToValueAtTime(0.75, context.currentTime + 0.008);
      kickGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration * 0.7);
      
      // Sub-bass 1 envelope - deeper and longer
      subGain1.gain.setValueAtTime(0.7, context.currentTime);
      subGain1.gain.linearRampToValueAtTime(0.6, context.currentTime + 0.015);
      subGain1.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration * 0.85);
      
      // Ultra-deep sub envelope - longest sustain
      subGain2.gain.setValueAtTime(0.5, context.currentTime);
      subGain2.gain.linearRampToValueAtTime(0.4, context.currentTime + 0.02);
      subGain2.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Harmonic envelope - quick decay for punch
      harmonicGain.gain.setValueAtTime(0.3, context.currentTime);
      harmonicGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.05);
      
      // Click envelope - very short for attack
      clickGain.gain.setValueAtTime(0.4, context.currentTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.008);
      
      // Final mix envelope
      finalMix.gain.setValueAtTime(0.8, context.currentTime);
      finalMix.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Start all oscillators
      kickOsc.start(context.currentTime);
      kickOsc.stop(context.currentTime + duration);
      subOsc1.start(context.currentTime);
      subOsc1.stop(context.currentTime + duration);
      subOsc2.start(context.currentTime);
      subOsc2.stop(context.currentTime + duration);
      harmonicOsc.start(context.currentTime);
      harmonicOsc.stop(context.currentTime + 0.08);
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