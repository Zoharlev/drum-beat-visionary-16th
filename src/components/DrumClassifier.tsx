import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAudioInput } from '@/hooks/useAudioInput';
import { useDrumClassifier, DrumClassification } from '@/hooks/useDrumClassifier';
import { cn } from '@/lib/utils';
import { Mic, MicOff, Volume2 } from 'lucide-react';

interface DrumClassifierProps {
  onDrumDetected?: (drum: string) => void;
  className?: string;
}

export const DrumClassifier: React.FC<DrumClassifierProps> = ({
  onDrumDetected,
  className
}) => {
  const [isActive, setIsActive] = useState(false);
  const [lastDetection, setLastDetection] = useState<DrumClassification | null>(null);
  const [detectionTimeout, setDetectionTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const { 
    isRecording, 
    audioLevel, 
    startRecording, 
    stopRecording, 
    getAudioData 
  } = useAudioInput();
  
  const { 
    isLoading, 
    isReady, 
    classify, 
    recentClassifications 
  } = useDrumClassifier();

  // Real-time classification
  useEffect(() => {
    if (!isRecording || !isReady) return;

    const classifyAudio = async () => {
      const audioData = getAudioData();
      if (!audioData) return;

      // Only classify if there's significant audio signal
      const rms = Math.sqrt(audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length);
      if (rms < 0.01) return; // Noise threshold

      try {
        const result = await classify(audioData);
        if (result && result.confidence > 0.5) {
          setLastDetection(result);
          onDrumDetected?.(result.drum);
          
          // Clear detection after 2 seconds
          if (detectionTimeout) clearTimeout(detectionTimeout);
          const timeout = setTimeout(() => setLastDetection(null), 2000);
          setDetectionTimeout(timeout);
        }
      } catch (error) {
        console.error('Classification failed:', error);
      }
    };

    const interval = setInterval(classifyAudio, 100); // Classify every 100ms
    return () => clearInterval(interval);
  }, [isRecording, isReady, classify, getAudioData, onDrumDetected, detectionTimeout]);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      setIsActive(false);
    } else {
      try {
        await startRecording();
        setIsActive(true);
      } catch (error) {
        console.error('Failed to start recording:', error);
        setIsActive(false);
      }
    }
  }, [isRecording, startRecording, stopRecording]);

  const getDrumColor = (drum: string) => {
    switch (drum) {
      case 'kick': return 'bg-red-500';
      case 'snare': return 'bg-blue-500';
      case 'hihat': return 'bg-yellow-500';
      case 'openhat': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getDrumLabel = (drum: string) => {
    switch (drum) {
      case 'kick': return 'Kick';
      case 'snare': return 'Snare';
      case 'hihat': return 'Hi-Hat';
      case 'openhat': return 'Open Hat';
      default: return 'Unknown';
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (detectionTimeout) clearTimeout(detectionTimeout);
      stopRecording();
    };
  }, [detectionTimeout, stopRecording]);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Drum Classifier
        </CardTitle>
        <CardDescription>
          Detect drum sounds in real-time using your microphone
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recording Control */}
        <div className="flex items-center justify-between">
          <Button
            onClick={handleToggleRecording}
            variant={isActive ? "destructive" : "default"}
            className="flex items-center gap-2"
            disabled={isLoading}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {isRecording ? 'Stop Listening' : 'Start Listening'}
          </Button>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Audio Level:</span>
            <Progress value={audioLevel * 100} className="w-20" />
          </div>
        </div>

        {/* Current Detection */}
        {lastDetection && (
          <div className="p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", getDrumColor(lastDetection.drum))} />
                <span className="font-medium">{getDrumLabel(lastDetection.drum)}</span>
              </div>
              <Badge variant="secondary">
                {Math.round(lastDetection.confidence * 100)}% confident
              </Badge>
            </div>
          </div>
        )}

        {/* Recent Classifications */}
        {recentClassifications.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Recent Detections</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {recentClassifications
                .slice(-5)
                .reverse()
                .map((classification, index) => (
                  <div key={`${classification.timestamp}-${index}`} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", getDrumColor(classification.drum))} />
                      <span>{getDrumLabel(classification.drum)}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {Math.round(classification.confidence * 100)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="text-xs text-muted-foreground">
          Status: {isLoading ? 'Loading...' : isReady ? (isRecording ? 'Listening' : 'Ready') : 'Not Ready'}
        </div>
      </CardContent>
    </Card>
  );
};