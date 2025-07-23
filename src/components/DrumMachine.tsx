import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Settings, Plus, Minus } from "lucide-react";
import { DrumGrid } from "./DrumGrid";
import { useToast } from "@/hooks/use-toast";

interface DrumPattern {
  [key: string]: boolean[];
}

export const DrumMachine = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [pattern, setPattern] = useState<DrumPattern>(() => {
    // Initialize with your specific Hi-Hat pattern
    // Times: 0.25s, 0.73s, 1.22s, 1.7s
    // Converting to 16-step grid positions based on timing
    const hihatPattern = new Array(16).fill(false);
    
    // At 120 BPM, each step is about 0.125s (125ms)
    // 0.25s ≈ step 2, 0.73s ≈ step 6, 1.22s ≈ step 10, 1.7s ≈ step 14
    hihatPattern[2] = true;  // 0.25s
    hihatPattern[6] = true;  // 0.73s  
    hihatPattern[10] = true; // 1.22s
    hihatPattern[14] = true; // 1.7s
    
    return {
      kick: new Array(16).fill(false),
      snare: new Array(16).fill(false),
      hihat: hihatPattern,
      openhat: new Array(16).fill(false),
    };
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { toast } = useToast();

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Step timing based on BPM
  const stepDuration = (60 / bpm / 4) * 1000; // 16th notes

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          const nextStep = (prev + 1) % 16;
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
      Object.entries(pattern).forEach(([drum, steps]) => {
        if (steps[currentStep]) {
          playDrumSound(drum);
        }
      });

      // Play metronome on beat 1
      if (metronomeEnabled && currentStep % 4 === 0) {
        playMetronome();
      }
    }
  }, [currentStep, isPlaying, pattern, metronomeEnabled]);

  const playDrumSound = (drum: string) => {
    if (!audioContextRef.current) return;

    const context = audioContextRef.current;

    if (drum === 'hihat' || drum === 'openhat') {
      // Create white noise for hi-hat sounds
      const bufferSize = context.sampleRate * 0.1; // 100ms of noise
      const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const data = buffer.getChannelData(0);
      
      // Generate white noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      
      if (drum === 'openhat') {
        // Open hat: Lower frequency, more resonant, longer decay
        const highpassFilter = context.createBiquadFilter();
        highpassFilter.type = 'highpass';
        highpassFilter.frequency.setValueAtTime(6000, context.currentTime);
        highpassFilter.Q.setValueAtTime(0.5, context.currentTime);
        
        // Resonant bandpass for more metallic ring
        const resonantFilter = context.createBiquadFilter();
        resonantFilter.type = 'bandpass';
        resonantFilter.frequency.setValueAtTime(9000, context.currentTime);
        resonantFilter.Q.setValueAtTime(4, context.currentTime);
        
        // Additional high shelf for brightness
        const shelfFilter = context.createBiquadFilter();
        shelfFilter.type = 'highshelf';
        shelfFilter.frequency.setValueAtTime(10000, context.currentTime);
        shelfFilter.gain.setValueAtTime(6, context.currentTime);
        
        const gainNode = context.createGain();
        
        // Connect the chain for open hat
        noise.connect(highpassFilter);
        highpassFilter.connect(resonantFilter);
        resonantFilter.connect(shelfFilter);
        shelfFilter.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Open hat envelope: quick attack, slower decay with sustain
        const duration = 0.4;
        gainNode.gain.setValueAtTime(0, context.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.35, context.currentTime + 0.002);
        gainNode.gain.linearRampToValueAtTime(0.15, context.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
        
        noise.start(context.currentTime);
        noise.stop(context.currentTime + duration);
      } else {
        // Closed hi-hat: Original tighter sound
        const highpassFilter = context.createBiquadFilter();
        highpassFilter.type = 'highpass';
        highpassFilter.frequency.setValueAtTime(8000, context.currentTime);
        highpassFilter.Q.setValueAtTime(1, context.currentTime);
        
        const bandpassFilter = context.createBiquadFilter();
        bandpassFilter.type = 'bandpass';
        bandpassFilter.frequency.setValueAtTime(12000, context.currentTime);
        bandpassFilter.Q.setValueAtTime(2, context.currentTime);
        
        const gainNode = context.createGain();
        
        // Connect the chain for closed hi-hat
        noise.connect(highpassFilter);
        highpassFilter.connect(bandpassFilter);
        bandpassFilter.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Closed hi-hat envelope: tight and short
        const duration = 0.08;
        gainNode.gain.setValueAtTime(0, context.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.001);
        gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
        
        noise.start(context.currentTime);
        noise.stop(context.currentTime + duration);
      }
    } else if (drum === 'snare') {
      // Complex snare sound with tonal and noise components
      
      // Tonal component (drum body)
      const oscillator1 = context.createOscillator();
      const oscillator2 = context.createOscillator();
      const toneGain = context.createGain();
      
      oscillator1.frequency.setValueAtTime(200, context.currentTime);
      oscillator2.frequency.setValueAtTime(150, context.currentTime);
      oscillator1.type = 'triangle';
      oscillator2.type = 'sine';
      
      // Pitch envelope for snare crack
      oscillator1.frequency.exponentialRampToValueAtTime(80, context.currentTime + 0.02);
      oscillator2.frequency.exponentialRampToValueAtTime(60, context.currentTime + 0.02);
      
      oscillator1.connect(toneGain);
      oscillator2.connect(toneGain);
      
      // Noise component (snares)
      const noiseBufferSize = context.sampleRate * 0.1;
      const noiseBuffer = context.createBuffer(1, noiseBufferSize, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      
      for (let i = 0; i < noiseBufferSize; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
      
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      
      // Shape the noise for snare character
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(3000, context.currentTime);
      noiseFilter.Q.setValueAtTime(0.5, context.currentTime);
      
      const noiseGain = context.createGain();
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      
      // Mix tonal and noise components
      const mixGain = context.createGain();
      toneGain.connect(mixGain);
      noiseGain.connect(mixGain);
      mixGain.connect(context.destination);
      
      // Envelope for overall snare
      const duration = 0.15;
      mixGain.gain.setValueAtTime(0, context.currentTime);
      mixGain.gain.linearRampToValueAtTime(0.4, context.currentTime + 0.002);
      mixGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Individual component envelopes
      toneGain.gain.setValueAtTime(0.7, context.currentTime);
      toneGain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.03);
      
      noiseGain.gain.setValueAtTime(0.4, context.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      oscillator1.start(context.currentTime);
      oscillator1.stop(context.currentTime + 0.03);
      oscillator2.start(context.currentTime);
      oscillator2.stop(context.currentTime + 0.03);
      noise.start(context.currentTime);
      noise.stop(context.currentTime + duration);
      
    } else {
      // Improved kick drum with sub-bass and attack click
      
      // Main kick oscillator (fundamental)
      const kickOsc = context.createOscillator();
      const kickGain = context.createGain();
      
      kickOsc.frequency.setValueAtTime(60, context.currentTime);
      kickOsc.frequency.exponentialRampToValueAtTime(35, context.currentTime + 0.05);
      kickOsc.type = 'sine';
      
      // Sub-bass oscillator for weight
      const subOsc = context.createOscillator();
      const subGain = context.createGain();
      
      subOsc.frequency.setValueAtTime(30, context.currentTime);
      subOsc.frequency.exponentialRampToValueAtTime(20, context.currentTime + 0.08);
      subOsc.type = 'sine';
      
      // Attack click for punch
      const clickOsc = context.createOscillator();
      const clickGain = context.createGain();
      
      clickOsc.frequency.setValueAtTime(1000, context.currentTime);
      clickOsc.frequency.exponentialRampToValueAtTime(100, context.currentTime + 0.005);
      clickOsc.type = 'square';
      
      // Low-pass filter for warmth
      const lowPassFilter = context.createBiquadFilter();
      lowPassFilter.type = 'lowpass';
      lowPassFilter.frequency.setValueAtTime(120, context.currentTime);
      lowPassFilter.Q.setValueAtTime(1, context.currentTime);
      
      // Mix all components
      const mixGain = context.createGain();
      
      kickOsc.connect(kickGain);
      subOsc.connect(subGain);
      clickOsc.connect(clickGain);
      
      kickGain.connect(lowPassFilter);
      subGain.connect(lowPassFilter);
      clickGain.connect(mixGain);
      lowPassFilter.connect(mixGain);
      mixGain.connect(context.destination);
      
      // Envelope for main kick
      const duration = 0.3;
      kickGain.gain.setValueAtTime(0.6, context.currentTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      // Sub-bass envelope
      subGain.gain.setValueAtTime(0.4, context.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration * 0.8);
      
      // Click envelope (very short)
      clickGain.gain.setValueAtTime(0.3, context.currentTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.01);
      
      // Overall mix envelope
      mixGain.gain.setValueAtTime(0.5, context.currentTime);
      mixGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      kickOsc.start(context.currentTime);
      kickOsc.stop(context.currentTime + duration);
      subOsc.start(context.currentTime);
      subOsc.stop(context.currentTime + duration);
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

  const togglePlay = () => {
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
    toast({
      title: "Reset",
      description: "Pattern reset to beginning",
    });
  };

  const changeBpm = (delta: number) => {
    setBpm(prev => Math.max(60, Math.min(200, prev + delta)));
  };

  const toggleStep = (drum: string, step: number) => {
    setPattern(prev => ({
      ...prev,
      [drum]: prev[drum].map((active, index) => 
        index === step ? !active : active
      )
    }));
  };

  const clearPattern = () => {
    setPattern({
      kick: new Array(16).fill(false),
      snare: new Array(16).fill(false),
      hihat: new Array(16).fill(false),
      openhat: new Array(16).fill(false),
    });
    toast({
      title: "Cleared",
      description: "All patterns cleared",
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header Controls */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <RotateCcw className="h-5 w-5" />
            </Button>
            
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

            {/* Play Controls */}
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="h-12 w-12 bg-primary/10 hover:bg-primary/20"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 text-primary" />
              ) : (
                <Play className="h-6 w-6 text-primary" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={reset}
              className="h-12 w-12"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>

          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Pattern Instructions */}
        <div className="text-center mb-6">
          <p className="text-muted-foreground text-lg">
            Play the following notes
          </p>
        </div>

        {/* Drum Grid */}
        <DrumGrid
          pattern={pattern}
          currentStep={currentStep}
          onStepToggle={toggleStep}
          onClearPattern={clearPattern}
          metronomeEnabled={metronomeEnabled}
          onMetronomeToggle={() => setMetronomeEnabled(!metronomeEnabled)}
        />
      </div>
    </div>
  );
};