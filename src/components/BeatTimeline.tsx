import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';

interface BeatDetection {
  timestamp: number;
  confidence: number;
  type: 'kick' | 'snare' | 'hihat' | 'beat';
}

interface BeatTimelineProps {
  beats: BeatDetection[];
}

export const BeatTimeline = ({ beats }: BeatTimelineProps) => {
  const getColorForBeatType = (type: string) => {
    switch (type) {
      case 'kick':
        return 'bg-red-500';
      case 'snare':
        return 'bg-blue-500';
      case 'hihat':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getRelativeTime = (timestamp: number) => {
    if (beats.length === 0) return 0;
    const firstBeat = beats[0]?.timestamp || timestamp;
    return (timestamp - firstBeat) / 1000; // Convert to seconds
  };

  const formatTime = (seconds: number) => {
    return `${seconds.toFixed(1)}s`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Beat Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {beats.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No beats detected yet. Start practicing to see beats appear here!
          </div>
        ) : (
          <div className="space-y-4">
            {/* Timeline Visualization */}
            <div className="relative">
              <div className="h-16 bg-secondary rounded-lg relative overflow-hidden">
                {beats.map((beat, index) => {
                  const relativeTime = getRelativeTime(beat.timestamp);
                  const maxTime = beats.length > 0 ? getRelativeTime(beats[beats.length - 1].timestamp) : 10;
                  const position = maxTime > 0 ? (relativeTime / Math.max(maxTime, 10)) * 100 : 0;
                  
                  return (
                    <div
                      key={index}
                      className={`absolute top-2 w-2 h-12 rounded-full ${getColorForBeatType(beat.type)}`}
                      style={{ 
                        left: `${Math.min(position, 98)}%`,
                        opacity: 0.4 + (beat.confidence * 0.6)
                      }}
                      title={`${beat.type} - ${formatTime(relativeTime)} - ${Math.round(beat.confidence * 100)}% confidence`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Beat List */}
            <div className="max-h-32 overflow-y-auto space-y-1">
              {beats.slice(-10).reverse().map((beat, index) => (
                <div
                  key={beats.length - 1 - index}
                  className="flex items-center justify-between text-sm p-2 bg-secondary/50 rounded"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getColorForBeatType(beat.type)}`} />
                    <span className="capitalize font-medium">{beat.type}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{formatTime(getRelativeTime(beat.timestamp))}</span>
                    <span>{Math.round(beat.confidence * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>Kick</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Snare</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>Hi-hat</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-500" />
                <span>General</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};