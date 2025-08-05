import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, RotateCcw, Plus, Minus, Play, Pause, Timer } from 'lucide-react';
import { useDrumListener } from '@/hooks/useDrumListener';
import { useCountdown } from '@/hooks/useCountdown';
import { usePracticeSession } from '@/hooks/usePracticeSession';
import { useAudioFeedback } from '@/hooks/useAudioFeedback';
import { BeatTimeline } from './BeatTimeline';
import { CountdownDisplay } from './CountdownDisplay';
import { PracticeGrid } from './PracticeGrid';
import { PracticeStats } from './PracticeStats';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface DrumPattern {
  [key: string]: boolean[];
}

export const PracticeMode = () => {
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [practiceSessionDuration, setPracticeSessionDuration] = useState(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const { toast } = useToast();

  // Audio feedback hooks
  const audioFeedback = useAudioFeedback();

  // Target pattern (default Hi-Hat pattern from DrumMachine)
  const [targetPattern, setTargetPattern] = useState<DrumPattern>(() => {
    const hihatPattern = new Array(16).fill(false);
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

  // Detected pattern for real-time visualization
  const [detectedPattern, setDetectedPattern] = useState<DrumPattern>({
    kick: new Array(16).fill(false),
    snare: new Array(16).fill(false),
    hihat: new Array(16).fill(false),
    openhat: new Array(16).fill(false),
  });

  const {
    isListening,
    detectedBeats,
    audioLevel,
    error,
    isModelLoaded,
    startListening,
    stopListening,
    clearBeats
  } = useDrumListener();

  // Countdown for listener activation
  const countdown = useCountdown({
    initialCount: 3,
    onComplete: () => {
      startListening();
      practiceSession.startSession();
      // Start playback after a brief delay to ensure everything is ready
      setTimeout(() => setIsPlaying(true), 100);
      toast({
        title: "Practice Started!",
        description: "Play along with the target pattern"
      });
    },
    onTick: (count) => {
      if (count === 0) {
        // Flash "GO!" message handled by CountdownDisplay
      }
    }
  });

  // Practice session management
  const practiceSession = usePracticeSession({
    targetPattern,
    bpm,
    toleranceMs: 150 // Timing tolerance in milliseconds
  });

  // Step timing based on BPM (16th notes)
  const stepDuration = (60 / bpm / 4) * 1000; // milliseconds per step

  // Convert detected beats to pattern grid positions for real-time visualization
  const patternFromBeats = useMemo(() => {
    if (!practiceSession.sessionActive || detectedBeats.length === 0) {
      return {
        kick: new Array(16).fill(false),
        snare: new Array(16).fill(false),
        hihat: new Array(16).fill(false),
        openhat: new Array(16).fill(false),
      };
    }

    const newPattern: DrumPattern = {
      kick: new Array(16).fill(false),
      snare: new Array(16).fill(false),
      hihat: new Array(16).fill(false),
      openhat: new Array(16).fill(false),
    };

    const sessionStart = practiceSession.sessionStartTime || Date.now();
    
    detectedBeats.forEach(beat => {
      if (beat.timestamp >= sessionStart) {
        // Synchronize with playback timing by accounting for step progression
        const sessionTime = beat.timestamp - sessionStart;
        const playbackStep = Math.floor(sessionTime / stepDuration);
        const stepPosition = playbackStep % 16;
        
        if (stepPosition >= 0 && stepPosition < 16 && beat.confidence > 0.6) {
          newPattern[beat.type][stepPosition] = true;
        }
      }
    });

    return newPattern;
  }, [detectedBeats, stepDuration, practiceSession.sessionActive, practiceSession.sessionStartTime]);

  // Update detected pattern for visualization
  useEffect(() => {
    if (practiceSession.sessionActive) {
      setDetectedPattern(patternFromBeats);
    }
  }, [patternFromBeats, practiceSession.sessionActive]);

  // Add detected beats to practice session
  useEffect(() => {
    const latestBeat = detectedBeats[detectedBeats.length - 1];
    if (latestBeat && practiceSession.sessionActive) {
      practiceSession.addDetectedBeat(latestBeat);
    }
  }, [detectedBeats, practiceSession]);

  // Metronome and step progression with audio feedback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentStep(prev => {
        const nextStep = (prev + 1) % 16;
        practiceSession.updateCurrentStep(nextStep);
        
        // Play metronome click
        if (metronomeEnabled) {
          const isDownbeat = nextStep % 4 === 0;
          audioFeedback.playMetronome(isDownbeat);
        }
        
        return nextStep;
      });
    }, stepDuration);

    return () => clearInterval(interval);
  }, [isPlaying, stepDuration, practiceSession, metronomeEnabled, audioFeedback]);

  // Audio feedback for detected beats
  useEffect(() => {
    if (!practiceSession.sessionActive || detectedBeats.length === 0) return;

    const latestBeat = detectedBeats[detectedBeats.length - 1];
    const sessionStart = practiceSession.sessionStartTime;
    
    if (!sessionStart || latestBeat.timestamp < sessionStart) return;

    const relativeTime = latestBeat.timestamp - sessionStart;
    const expectedStep = Math.round(relativeTime / stepDuration) % 16;
    const timingOffset = relativeTime - (expectedStep * stepDuration);
    const toleranceMs = 150;

    // Check if this beat should be at this step
    const shouldBeActive = targetPattern[latestBeat.type]?.[expectedStep];
    
    if (shouldBeActive) {
      // Correct beat type at correct time
      if (Math.abs(timingOffset) <= toleranceMs) {
        audioFeedback.playSuccessSound();
      } else {
        // Correct beat type but wrong timing
        const timing = timingOffset < 0 ? 'early' : 'late';
        audioFeedback.playTimingFeedback(timing);
      }
    } else {
      // Wrong beat type or at wrong time
      audioFeedback.playErrorSound();
    }
  }, [detectedBeats, practiceSession.sessionActive, practiceSession.sessionStartTime, targetPattern, stepDuration, audioFeedback]);

  // Practice session timer
  useEffect(() => {
    if (!practiceSession.sessionActive) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      setPracticeSessionDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [practiceSession.sessionActive]);

  const handleStartPractice = () => {
    if (practiceSession.sessionActive) {
      // Stop current session
      setIsPlaying(false);
      practiceSession.stopSession();
      stopListening();
      countdown.reset();
      toast({
        title: "Practice Stopped",
        description: "Session ended"
      });
    } else {
      // Start countdown to begin practice
      countdown.start();
    }
  };

  const handleClear = () => {
    clearBeats();
    setDetectedPattern({
      kick: new Array(16).fill(false),
      snare: new Array(16).fill(false),
      hihat: new Array(16).fill(false),
      openhat: new Array(16).fill(false),
    });
    setCurrentStep(0);
    setPracticeSessionDuration(0);
  };

  const toggleTargetStep = (drum: string, step: number) => {
    setTargetPattern(prev => ({
      ...prev,
      [drum]: prev[drum].map((active, index) => 
        index === step ? !active : active
      )
    }));
  };

  const changeBpm = (delta: number) => {
    if (!practiceSession.sessionActive) {
      setBpm(prev => Math.max(60, Math.min(200, prev + delta)));
    }
  };

  const toggleMetronome = () => {
    setMetronomeEnabled(prev => !prev);
  };

  // Get current step accuracy for display
  const currentStepAccuracy = practiceSession.getCurrentStepAccuracy(currentStep);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Countdown Overlay */}
      <CountdownDisplay 
        count={countdown.count}
        isActive={countdown.isActive}
        isCompleted={countdown.isCompleted}
      />

      {/* Main Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Enhanced Practice Mode
            {practiceSession.sessionActive && (
              <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                Live Session • {Math.floor(practiceSessionDuration / 60)}:{(practiceSessionDuration % 60).toString().padStart(2, '0')}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Main Controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                onClick={handleStartPractice}
                variant={practiceSession.sessionActive ? "destructive" : "default"}
                size="lg"
                className="flex items-center gap-2"
                disabled={!isModelLoaded || countdown.isActive}
              >
                {practiceSession.sessionActive ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Stop Practice
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Start Practice
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleClear}
                variant="outline"
                size="lg"
                className="flex items-center gap-2"
                disabled={practiceSession.sessionActive}
              >
                <RotateCcw className="h-4 w-4" />
                Clear Results
              </Button>

              {/* BPM Controls */}
              <div className="flex items-center gap-2 bg-secondary rounded-lg p-2">
                <Button
                  onClick={() => changeBpm(-10)}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={practiceSession.sessionActive}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium min-w-[60px] text-center">
                  {bpm} BPM
                </div>
                <Button
                  onClick={() => changeBpm(10)}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={practiceSession.sessionActive}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Metronome Toggle */}
              <Button
                onClick={toggleMetronome}
                variant={metronomeEnabled ? "default" : "outline"}
                size="sm"
                className="flex items-center gap-2"
              >
                <span className="text-xs">♪</span>
                Metronome
              </Button>

              {/* Metronome indicator */}
              {isPlaying && (
                <div className="flex items-center gap-2 text-sm">
                  <div className={cn(
                    "w-3 h-3 rounded-full transition-all duration-100",
                    currentStep % 4 === 0 ? "bg-red-500 scale-125" : "bg-gray-300"
                  )} />
                  <span className="text-muted-foreground">
                    Beat {Math.floor(currentStep / 4) + 1}
                  </span>
                </div>
              )}
            </div>

            {/* Audio Level Indicator */}
            {isListening && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Audio Level</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-100"
                      style={{ width: `${audioLevel * 100}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground w-12">
                    {Math.round(audioLevel * 100)}%
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}

            {/* Status */}
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              {!isModelLoaded ? (
                <>
                  <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  Loading drum recognition model...
                </>
              ) : countdown.isActive ? (
                <>
                  <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  Get ready to play...
                </>
              ) : practiceSession.sessionActive ? (
                <>
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Practice session active • {detectedBeats.length} beats detected
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full" />
                  Ready to start practice session
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Practice Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PracticeGrid
            targetPattern={targetPattern}
            detectedPattern={detectedPattern}
            currentStep={currentStep}
            stepAccuracy={currentStepAccuracy}
            showComparison={practiceSession.sessionActive}
          />
        </div>
        
        <div className="space-y-6">
          <PracticeStats
            stats={practiceSession.practiceStats}
            sessionActive={practiceSession.sessionActive}
            sessionDuration={practiceSessionDuration}
          />
        </div>
      </div>

      {/* Beat Timeline */}
      <BeatTimeline beats={detectedBeats} />
    </div>
  );
};