import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Brain, Volume2 } from 'lucide-react';
import { useAudioInput } from '@/hooks/useAudioInput';
import { useDrumClassifier } from '@/hooks/useDrumClassifier';
import { cn } from '@/lib/utils';

interface DrumClassifierProps {
  isActive: boolean;
  onDrumDetected?: (drum: string, confidence: number) => void;
}

export const DrumClassifier = ({ isActive, onDrumDetected }: DrumClassifierProps) => {
  const {
    isListening,
    audioLevel,
    error: audioError,
    startListening,
    stopListening
  } = useAudioInput();

  const {
    isInitialized,
    detections,
    isProcessing,
    error: classifierError
  } = useDrumClassifier(isActive && isListening);

  // Handle listening state based on isActive prop
  useEffect(() => {
    if (isActive && !isListening && !audioError) {
      startListening();
    } else if (!isActive && isListening) {
      stopListening();
    }
  }, [isActive, isListening, audioError, startListening, stopListening]);

  // Handle drum detection events
  useEffect(() => {
    const handleDrumDetection = (event: CustomEvent) => {
      const { drum, confidence } = event.detail;
      onDrumDetected?.(drum, confidence);
    };

    window.addEventListener('drumDetected', handleDrumDetection as EventListener);
    return () => {
      window.removeEventListener('drumDetected', handleDrumDetection as EventListener);
    };
  }, [onDrumDetected]);

  const error = audioError || classifierError;
  const latestDetection = detections[detections.length - 1];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-secondary rounded-lg">
      {/* Microphone Status */}
      <div className="flex items-center gap-2">
        {isListening ? (
          <Mic className={cn(
            "h-4 w-4 transition-colors",
            audioLevel > 0.02 ? "text-red-500" : "text-green-500"
          )} />
        ) : (
          <MicOff className="h-4 w-4 text-muted-foreground" />
        )}
        
        {/* Audio Level Indicator */}
        {isListening && (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1 h-3 rounded-full transition-colors duration-100",
                  audioLevel * 50 > i ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Classifier Status */}
      <div className="flex items-center gap-2">
        <Brain className={cn(
          "h-4 w-4 transition-colors",
          isInitialized ? "text-blue-500" : "text-muted-foreground"
        )} />
        
        {isProcessing && (
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
        )}
      </div>

      {/* Latest Detection */}
      {latestDetection && (
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-green-500" />
          <Badge variant="secondary" className="text-xs">
            {latestDetection.drum}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {Math.round(latestDetection.confidence * 100)}%
          </span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Badge variant="destructive" className="text-xs">
          {error}
        </Badge>
      )}

      {/* Status Text */}
      {!error && (
        <span className="text-xs text-muted-foreground">
          {!isActive ? 'Inactive' :
           !isListening ? 'Starting...' :
           !isInitialized ? 'Initializing...' :
           isProcessing ? 'Processing...' :
           'Listening'}
        </span>
      )}
    </div>
  );
};