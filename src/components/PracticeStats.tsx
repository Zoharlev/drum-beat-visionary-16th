import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface PracticeStatsProps {
  stats: {
    totalBeats: number;
    correctBeats: number;
    accuracy: number;
    timing: {
      early: number;
      onTime: number;
      late: number;
    };
  };
  sessionActive: boolean;
  sessionDuration?: number;
}

export const PracticeStats = ({ stats, sessionActive, sessionDuration }: PracticeStatsProps) => {
  const totalTimingBeats = stats.timing.early + stats.timing.onTime + stats.timing.late;
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📊 Practice Statistics
          {sessionActive && (
            <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
              Live Session
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Accuracy */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Overall Accuracy</span>
            <span className={cn(
              "text-sm font-bold",
              stats.accuracy >= 80 ? "text-green-600" :
              stats.accuracy >= 60 ? "text-yellow-600" :
              "text-red-600"
            )}>
              {stats.accuracy.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={stats.accuracy} 
            className="h-2"
          />
          <div className="text-xs text-muted-foreground">
            {stats.correctBeats} correct out of {stats.totalBeats} expected beats
          </div>
        </div>

        {/* Timing Analysis */}
        {totalTimingBeats > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Timing Analysis</span>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-red-50 border border-red-200 rounded p-2">
                <div className="text-lg font-bold text-red-600">
                  {stats.timing.early}
                </div>
                <div className="text-xs text-red-600">Early</div>
                <div className="text-xs text-muted-foreground">
                  {totalTimingBeats > 0 ? ((stats.timing.early / totalTimingBeats) * 100).toFixed(0) : 0}%
                </div>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded p-2">
                <div className="text-lg font-bold text-green-600">
                  {stats.timing.onTime}
                </div>
                <div className="text-xs text-green-600">On Time</div>
                <div className="text-xs text-muted-foreground">
                  {totalTimingBeats > 0 ? ((stats.timing.onTime / totalTimingBeats) * 100).toFixed(0) : 0}%
                </div>
              </div>
              
              <div className="bg-orange-50 border border-orange-200 rounded p-2">
                <div className="text-lg font-bold text-orange-600">
                  {stats.timing.late}
                </div>
                <div className="text-xs text-orange-600">Late</div>
                <div className="text-xs text-muted-foreground">
                  {totalTimingBeats > 0 ? ((stats.timing.late / totalTimingBeats) * 100).toFixed(0) : 0}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Session Info */}
        {sessionDuration !== undefined && (
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Session Duration</span>
              <span className="font-medium">{formatDuration(sessionDuration)}</span>
            </div>
          </div>
        )}

        {/* Performance Grade */}
        <div className="pt-2 border-t">
          <div className="text-center">
            <div className={cn(
              "text-2xl font-bold mb-1",
              stats.accuracy >= 90 ? "text-green-600" :
              stats.accuracy >= 80 ? "text-blue-600" :
              stats.accuracy >= 70 ? "text-yellow-600" :
              stats.accuracy >= 60 ? "text-orange-600" :
              "text-red-600"
            )}>
              {stats.accuracy >= 90 ? "A+" :
               stats.accuracy >= 80 ? "A" :
               stats.accuracy >= 70 ? "B" :
               stats.accuracy >= 60 ? "C" :
               "D"}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.accuracy >= 90 ? "Excellent!" :
               stats.accuracy >= 80 ? "Great job!" :
               stats.accuracy >= 70 ? "Good work!" :
               stats.accuracy >= 60 ? "Keep practicing!" :
               "More practice needed"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};