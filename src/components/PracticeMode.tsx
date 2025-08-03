import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, RotateCcw } from 'lucide-react';
import { useAudioClassification } from '@/hooks/useAudioClassification';
import { BeatTimeline } from './BeatTimeline';

export const PracticeMode = () => {
  const {
    isListening,
    detectedBeats,
    audioLevel,
    error,
    startListening,
    stopListening,
    clearBeats
  } = useAudioClassification();

  const handleStart = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
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
            <div className="flex items-center gap-4">
              <Button
                onClick={handleStart}
                variant={isListening ? "destructive" : "default"}
                size="lg"
                className="flex items-center gap-2"
              >
                {isListening ? (
                  <>
                    <MicOff className="h-4 w-4" />
                    Stop
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Start
                  </>
                )}
              </Button>
              
              <Button
                onClick={clearBeats}
                variant="outline"
                size="lg"
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Clear
              </Button>
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
            <div className="text-sm text-muted-foreground">
              {isListening ? (
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