import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Play, Square } from 'lucide-react';
import { useAudioClassification } from '@/hooks/useAudioClassification';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AudioLevelBars } from '@/components/AudioLevelBars';
import { BeatTimeline } from '@/components/BeatTimeline';

export const PracticeMode = () => {
  const [isActive, setIsActive] = useState(false);
  const { toast } = useToast();
  
  const {
    isInitialized,
    isListening,
    detectedDrum,
    confidence,
    isLoading,
    detectionMethod,
    analyserRef,
    startListening,
    stopListening,
    initializeModel
  } = useAudioClassification();

  const handleStart = async () => {
    if (!isInitialized && !isLoading) {
      await initializeModel();
    }
    
    try {
      await startListening();
      setIsActive(true);
      toast({
        title: "Practice Mode Started",
        description: "Listening for drum sounds...",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const handleStop = () => {
    stopListening();
    setIsActive(false);
    toast({
      title: "Practice Mode Stopped",
      description: "Microphone listening stopped",
    });
  };

  const getConfidenceColor = (conf: number) => {
    if (conf > 0.7) return 'text-green-500';
    if (conf > 0.4) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getDrumIcon = (drumName: string) => {
    const icons: { [key: string]: string } = {
      'Kick': '●',
      'Snare': '×',
      'Hi-Hat': '○',
      'Open Hat': '◎',
      'Tom': '◐',
      'Unknown': '?'
    };
    return icons[drumName] || '?';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Practice Mode</h2>
        <p className="text-muted-foreground">
          Play drums and see real-time detection
        </p>
      </div>

      {/* Main Practice Area */}
      <Card className="p-8">
        <div className="text-center space-y-6">
          {/* Status Indicator */}
          <div className="flex items-center justify-center gap-3">
            {isListening ? (
              <>
                <Mic className="h-6 w-6 text-green-500 animate-pulse" />
                <span className="text-green-500 font-medium">Listening...</span>
              </>
            ) : (
              <>
                <MicOff className="h-6 w-6 text-muted-foreground" />
                <span className="text-muted-foreground">Not listening</span>
              </>
            )}
          </div>

          {/* Detection Display */}
          <div className="py-8">
            {detectedDrum ? (
              <div className="space-y-4">
                <div className="text-6xl font-mono text-primary">
                  {getDrumIcon(detectedDrum)}
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold text-primary">
                    {detectedDrum}
                  </h3>
                  <p className={cn("text-lg font-medium", getConfidenceColor(confidence))}>
                    Confidence: {Math.round(confidence * 100)}%
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-muted-foreground">
                <div className="text-4xl mb-4">🥁</div>
                <p className="text-lg">
                  {isListening ? "Waiting for drum sounds..." : "Click Start to begin practice"}
                </p>
              </div>
            )}
          </div>

          {/* Audio Level Visualization */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Audio Levels</h4>
            <AudioLevelBars 
              isListening={isListening} 
              analyserRef={analyserRef}
              className="border border-border"
            />
          </div>

          {/* Beat Timeline */}
          <div className="space-y-3">
            <BeatTimeline
              detectedDrum={detectedDrum}
              confidence={confidence}
              isListening={isListening}
              className="border border-border"
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {!isActive ? (
              <Button
                onClick={handleStart}
                disabled={isLoading}
                className="px-8 py-3 text-lg"
                size="lg"
              >
                <Play className="h-5 w-5 mr-2" />
                {isLoading ? "Initializing..." : "Start Practice"}
              </Button>
            ) : (
              <Button
                onClick={handleStop}
                variant="destructive"
                className="px-8 py-3 text-lg"
                size="lg"
              >
                <Square className="h-5 w-5 mr-2" />
                Stop Practice
              </Button>
            )}
          </div>

          {/* Detection Method Status */}
          {isInitialized && (
            <div className="text-sm text-muted-foreground">
              Detection method: {detectionMethod === 'ml' ? 'Machine Learning' : 'Frequency Analysis'}
            </div>
          )}
          {isLoading && (
            <div className="text-sm text-muted-foreground">
              Loading audio classification model...
            </div>
          )}
        </div>
      </Card>

      {/* Information Panel */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">How Practice Mode Works</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs">1</span>
            <p>Click "Start Practice" to activate microphone listening</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs">2</span>
            <p>Play drums near your device's microphone</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs">3</span>
            <p>See real-time detection of kick, snare, hi-hat, and other drums</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs">4</span>
            <p>Uses enhanced frequency analysis with ML fallback for accurate drum detection</p>
          </div>
        </div>
      </Card>
    </div>
  );
};