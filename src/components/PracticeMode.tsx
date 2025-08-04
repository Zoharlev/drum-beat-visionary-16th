import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, RotateCcw, Plus, Minus } from 'lucide-react';
import { useDrumListener } from '@/hooks/useDrumListener';
import { BeatTimeline } from './BeatTimeline';
import { cn } from '@/lib/utils';

interface DrumPattern {
  [key: string]: boolean[];
}

export const PracticeMode = () => {
  const [bpm, setBpm] = useState(120);
  const [pattern, setPattern] = useState<DrumPattern>({
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

  // Step timing based on BPM (16th notes)
  const stepDuration = (60 / bpm / 4) * 1000; // milliseconds per step

  // Convert detected beats to pattern grid positions
  const patternFromBeats = useMemo(() => {
    if (!isListening || detectedBeats.length === 0) return pattern;

    const newPattern: DrumPattern = {
      kick: new Array(16).fill(false),
      snare: new Array(16).fill(false),
      hihat: new Array(16).fill(false),
      openhat: new Array(16).fill(false),
    };

    const firstBeatTime = detectedBeats[0]?.timestamp || Date.now();
    
    detectedBeats.forEach(beat => {
      const relativeTime = beat.timestamp - firstBeatTime; // ms since first beat
      const stepPosition = Math.round(relativeTime / stepDuration) % 16;
      
      if (stepPosition >= 0 && stepPosition < 16 && beat.confidence > 0.6) {
        newPattern[beat.type][stepPosition] = true;
      }
    });

    return newPattern;
  }, [detectedBeats, stepDuration, isListening, pattern]);

  // Update pattern when beats are detected
  useEffect(() => {
    if (isListening) {
      setPattern(patternFromBeats);
    }
  }, [patternFromBeats, isListening]);

  const handleStart = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleClear = () => {
    clearBeats();
    setPattern({
      kick: new Array(16).fill(false),
      snare: new Array(16).fill(false),
      hihat: new Array(16).fill(false),
      openhat: new Array(16).fill(false),
    });
  };

  const changeBpm = (delta: number) => {
    setBpm(prev => Math.max(60, Math.min(200, prev + delta)));
  };

  const drumLabels = {
    kick: { name: 'Kick', symbol: '🥁' },
    snare: { name: 'Snare', symbol: '🥁' },
    hihat: { name: 'Hi-Hat', symbol: '🔸' },
    openhat: { name: 'Open Hat', symbol: '🔹' }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Practice Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                onClick={handleStart}
                variant={isListening ? "destructive" : "default"}
                size="lg"
                className="flex items-center gap-2"
                disabled={!isModelLoaded}
              >
                {isListening ? (
                  <>
                    <MicOff className="h-4 w-4" />
                    Stop Listening
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Start Listening
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleClear}
                variant="outline"
                size="lg"
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Clear Pattern
              </Button>

              {/* BPM Controls */}
              <div className="flex items-center gap-2 bg-secondary rounded-lg p-2">
                <Button
                  onClick={() => changeBpm(-10)}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
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
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
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

            {/* Practice Pattern Grid */}
            {isListening && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Detected Pattern</h3>
                <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                  {/* Beat Numbers */}
                  <div className="flex items-center mb-2">
                    <div className="w-24 text-xs font-medium text-muted-foreground">Beat</div>
                    {Array.from({ length: 16 }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 min-w-[32px] text-center text-xs font-medium text-muted-foreground"
                      >
                        {Math.floor(i / 4) + 1}
                      </div>
                    ))}
                  </div>

                  {/* Step Numbers */}
                  <div className="flex items-center mb-4">
                    <div className="w-24 text-xs font-medium text-muted-foreground">Step</div>
                    {Array.from({ length: 16 }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 min-w-[32px] text-center text-xs text-muted-foreground"
                      >
                        {(i % 4) + 1}
                      </div>
                    ))}
                  </div>

                  {/* Drum Rows */}
                  {Object.entries(drumLabels).map(([drumKey, drumInfo]) => (
                    <div key={drumKey} className="flex items-center mb-2">
                      <div className="w-24 text-sm font-medium flex items-center gap-2">
                        <span>{drumInfo.symbol}</span>
                        <span>{drumInfo.name}</span>
                      </div>
                      {Array.from({ length: 16 }, (_, stepIndex) => (
                        <div
                          key={stepIndex}
                          className={cn(
                            "flex-1 min-w-[32px] h-8 mx-[2px] rounded flex items-center justify-center border-2 transition-all",
                            pattern[drumKey][stepIndex]
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-background border-muted hover:border-muted-foreground/50",
                            stepIndex % 4 === 0 && "border-l-4 border-l-accent"
                          )}
                        >
                          {pattern[drumKey][stepIndex] && (
                            <div className="w-2 h-2 bg-current rounded-full" />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="text-sm text-muted-foreground">
              {!isModelLoaded ? (
                <>
                  <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse" />
                  Loading drum recognition model...
                </>
              ) : isListening ? (
                <>
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                  Listening for drum beats... ({detectedBeats.length} beats detected)
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full mr-2" />
                  Ready to start listening
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Beat Timeline */}
      <BeatTimeline beats={detectedBeats} />
    </div>
  );
};