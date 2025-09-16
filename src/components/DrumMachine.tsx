import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Settings, Plus, Minus, Mic, MicOff, Music } from "lucide-react";
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
  const [backingTrackEnabled, setBackingTrackEnabled] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const snareBufferRef = useRef<AudioBuffer | null>(null);
  const kickBufferRef = useRef<AudioBuffer | null>(null);
  const hhOpenBufferRef = useRef<AudioBuffer | null>(null);
  const hhClosedBufferRef = useRef<AudioBuffer | null>(null);
  const backingTrackRef = useRef<HTMLAudioElement | null>(null);
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

  // Load snare sample
  const loadSnareBuffer = async () => {
    if (audioContextRef.current && !snareBufferRef.current) {
      try {
        const response = await fetch('/samples/snare-acoustic-raw-2.wav');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        snareBufferRef.current = audioBuffer;
      } catch (error) {
        console.error('Failed to load snare sample:', error);
      }
    }
  };

  // Load kick sample
  const loadKickBuffer = async () => {
    if (audioContextRef.current && !kickBufferRef.current) {
      try {
        const response = await fetch('/samples/synth-click-drum-kick.wav');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        kickBufferRef.current = audioBuffer;
      } catch (error) {
        console.error('Failed to load kick sample:', error);
      }
    }
  };

  // Load HH Open sample
  const loadHHOpenBuffer = async () => {
    if (audioContextRef.current && !hhOpenBufferRef.current) {
      try {
        const response = await fetch('/samples/vibrant-metal-waves-afro-hi-hats.wav');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        hhOpenBufferRef.current = audioBuffer;
      } catch (error) {
        console.error('Failed to load HH Open sample:', error);
      }
    }
  };

  // Load HH Closed sample
  const loadHHClosedBuffer = async () => {
    if (audioContextRef.current && !hhClosedBufferRef.current) {
      try {
        const response = await fetch('/samples/cloed-hi-hat-808-rome.wav');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        hhClosedBufferRef.current = audioBuffer;
      } catch (error) {
        console.error('Failed to load HH Closed sample:', error);
      }
    }
  };

  // Initialize audio context and load samples
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    loadSnareBuffer();
    loadKickBuffer();
    loadHHOpenBuffer();
    loadHHClosedBuffer();
    
    // Initialize backing track
    backingTrackRef.current = new Audio('/samples/come_as_you_are_backing_track.mp3');
    backingTrackRef.current.loop = true;
    backingTrackRef.current.volume = 0.3;
    
    return () => {
      audioContextRef.current?.close();
      if (backingTrackRef.current) {
        backingTrackRef.current.pause();
        backingTrackRef.current = null;
      }
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
      
      // Start backing track if enabled
      if (backingTrackEnabled && backingTrackRef.current) {
        backingTrackRef.current.play().catch(console.error);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Pause backing track
      if (backingTrackRef.current) {
        backingTrackRef.current.pause();
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, stepDuration, backingTrackEnabled]);

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
      const isOpenHat = normalizedDrum.includes('open') || normalizedDrum.includes('crash');
      
      if (isOpenHat && hhOpenBufferRef.current) {
        // Play loaded HH Open sample
        const source = context.createBufferSource();
        source.buffer = hhOpenBufferRef.current;
        
        // Add some processing to the HH Open sample
        const gainNode = context.createGain();
        const highpass = context.createBiquadFilter();
        const presence = context.createBiquadFilter();
        
        // High-pass to clean up low-end
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(8000, context.currentTime);
        highpass.Q.setValueAtTime(0.7, context.currentTime);
        
        // Presence boost for sparkle
        presence.type = 'peaking';
        presence.frequency.setValueAtTime(12000, context.currentTime);
        presence.Q.setValueAtTime(1.2, context.currentTime);
        presence.gain.setValueAtTime(2, context.currentTime);
        
        // Signal chain
        source.connect(highpass);
        highpass.connect(presence);
        presence.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Volume envelope
        gainNode.gain.setValueAtTime(0.6, context.currentTime);
        
        source.start(context.currentTime);
      } else if (hhClosedBufferRef.current) {
        // Play loaded HH Closed sample
        const source = context.createBufferSource();
        source.buffer = hhClosedBufferRef.current;
        
        // Add some processing to the HH Closed sample
        const gainNode = context.createGain();
        const highpass = context.createBiquadFilter();
        const crisp = context.createBiquadFilter();
        
        // High-pass for tightness
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(10000, context.currentTime);
        highpass.Q.setValueAtTime(0.8, context.currentTime);
        
        // Crisp boost for definition
        crisp.type = 'peaking';
        crisp.frequency.setValueAtTime(14000, context.currentTime);
        crisp.Q.setValueAtTime(1.5, context.currentTime);
        crisp.gain.setValueAtTime(1.5, context.currentTime);
        
        // Signal chain
        source.connect(highpass);
        highpass.connect(crisp);
        crisp.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Volume envelope
        gainNode.gain.setValueAtTime(0.5, context.currentTime);
        
        source.start(context.currentTime);
      } else {
        // Fallback synthesized closed hi-hat if sample not loaded
        const bufferSize = context.sampleRate * 0.06;
        const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate metallic noise for closed hat
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / bufferSize * 12);
        }
        
        const noise = context.createBufferSource();
        noise.buffer = buffer;
        
        // Filter chain for closed hi-hat character
        const highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(9000, context.currentTime);
        
        const bandpass = context.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(11000, context.currentTime);
        bandpass.Q.setValueAtTime(2, context.currentTime);
        
        const gainNode = context.createGain();
        
        noise.connect(highpass);
        highpass.connect(bandpass);
        bandpass.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Tight envelope for closed hat
        gainNode.gain.setValueAtTime(0, context.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.001);
        gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.06);
        
        noise.start(context.currentTime);
        noise.stop(context.currentTime + 0.06);
      }
      
    } else if (normalizedDrum.includes('snare') || normalizedDrum.includes('rim')) {
      // Play loaded snare sample
      if (snareBufferRef.current) {
        const source = context.createBufferSource();
        source.buffer = snareBufferRef.current;
        
        // Add some EQ and compression to the sample
        const gainNode = context.createGain();
        const compressor = context.createDynamicsCompressor();
        const eqFilter = context.createBiquadFilter();
        
        // Subtle EQ to enhance the sample
        eqFilter.type = 'peaking';
        eqFilter.frequency.setValueAtTime(3000, context.currentTime);
        eqFilter.Q.setValueAtTime(1.5, context.currentTime);
        eqFilter.gain.setValueAtTime(2, context.currentTime);
        
        // Light compression for consistency
        compressor.threshold.setValueAtTime(-12, context.currentTime);
        compressor.knee.setValueAtTime(6, context.currentTime);
        compressor.ratio.setValueAtTime(4, context.currentTime);
        compressor.attack.setValueAtTime(0.003, context.currentTime);
        compressor.release.setValueAtTime(0.1, context.currentTime);
        
        // Signal chain
        source.connect(eqFilter);
        eqFilter.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Volume envelope for consistency with other drums
        gainNode.gain.setValueAtTime(0.7, context.currentTime);
        
        source.start(context.currentTime);
      } else {
        console.warn('Snare sample not loaded yet');
      }
      
    } else {
      // Play loaded kick sample
      if (kickBufferRef.current) {
        const source = context.createBufferSource();
        source.buffer = kickBufferRef.current;
        
        // Add EQ and compression to enhance the kick sample
        const gainNode = context.createGain();
        const compressor = context.createDynamicsCompressor();
        const lowEQ = context.createBiquadFilter();
        const midEQ = context.createBiquadFilter();
        
        // Low-end boost for punch
        lowEQ.type = 'lowshelf';
        lowEQ.frequency.setValueAtTime(80, context.currentTime);
        lowEQ.gain.setValueAtTime(4, context.currentTime);
        
        // Mid clarity
        midEQ.type = 'peaking';
        midEQ.frequency.setValueAtTime(2500, context.currentTime);
        midEQ.Q.setValueAtTime(1.5, context.currentTime);
        midEQ.gain.setValueAtTime(2, context.currentTime);
        
        // Compression for punch
        compressor.threshold.setValueAtTime(-8, context.currentTime);
        compressor.knee.setValueAtTime(4, context.currentTime);
        compressor.ratio.setValueAtTime(6, context.currentTime);
        compressor.attack.setValueAtTime(0.001, context.currentTime);
        compressor.release.setValueAtTime(0.06, context.currentTime);
        
        // Signal chain
        source.connect(lowEQ);
        lowEQ.connect(midEQ);
        midEQ.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Volume envelope for consistency with other drums
        gainNode.gain.setValueAtTime(0.8, context.currentTime);
        
        source.start(context.currentTime);
      } else {
        console.warn('Kick sample not loaded yet');
      }
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

              {/* Backing Track Toggle */}
              <div className="flex items-center gap-3 rounded-[20px] px-4 py-2" style={{ backgroundColor: '#333537' }}>
                <button
                  onClick={() => setBackingTrackEnabled(!backingTrackEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2",
                    backingTrackEnabled ? "bg-blue-600" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-lg",
                      backingTrackEnabled ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
                
                {/* Music Icon */}
                <div className="flex items-center justify-center w-8 h-8 rounded-full" style={{ backgroundColor: backingTrackEnabled ? '#3B82F6' : '#786C7D' }}>
                  <Music className="h-4 w-4 text-white" />
                </div>
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