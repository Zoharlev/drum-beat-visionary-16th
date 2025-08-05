import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DrumPattern {
  [key: string]: boolean[];
}

interface PracticeGridProps {
  targetPattern: DrumPattern;
  detectedPattern: DrumPattern;
  currentStep: number;
  stepAccuracy?: {
    expected: number;
    detected: number;
    correct: number;
    accuracy: number;
  } | null;
  showComparison?: boolean;
}

const drumLabels = {
  kick: { name: 'Kick', symbol: '🥁', color: 'bg-red-500' },
  snare: { name: 'Snare', symbol: '🥁', color: 'bg-blue-500' },
  hihat: { name: 'Hi-Hat', symbol: '🔸', color: 'bg-yellow-500' },
  openhat: { name: 'Open Hat', symbol: '🔹', color: 'bg-purple-500' }
};

export const PracticeGrid = ({ 
  targetPattern, 
  detectedPattern, 
  currentStep, 
  stepAccuracy,
  showComparison = true 
}: PracticeGridProps) => {
  
  // Calculate step-by-step accuracy indicators
  const stepIndicators = useMemo(() => {
    return Array.from({ length: 16 }, (_, stepIndex) => {
      let hasTarget = false;
      let hasDetected = false;
      let isCorrect = true;

      Object.keys(drumLabels).forEach(drumKey => {
        const targetActive = targetPattern[drumKey]?.[stepIndex] || false;
        const detectedActive = detectedPattern[drumKey]?.[stepIndex] || false;

        if (targetActive) hasTarget = true;
        if (detectedActive) hasDetected = true;
        if (targetActive !== detectedActive) isCorrect = false;
      });

      return {
        hasTarget,
        hasDetected,
        isCorrect: hasTarget ? isCorrect : !hasDetected,
        accuracy: hasTarget && isCorrect ? 100 : hasTarget && !isCorrect ? 0 : null
      };
    });
  }, [targetPattern, detectedPattern]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🎯 Target Pattern
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                  className={cn(
                    "flex-1 min-w-[32px] text-center text-xs transition-all",
                    i === currentStep 
                      ? "text-primary font-bold bg-primary/10 rounded" 
                      : "text-muted-foreground"
                  )}
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
                      targetPattern[drumKey][stepIndex]
                        ? `${drumInfo.color} border-current text-white`
                        : "bg-background border-muted",
                      stepIndex === currentStep && "ring-2 ring-primary ring-offset-1",
                      stepIndex % 4 === 0 && "border-l-4 border-l-accent"
                    )}
                  >
                    {targetPattern[drumKey][stepIndex] && (
                      <div className="w-3 h-3 bg-current rounded-full" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showComparison && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🎤 Detected Pattern
              {stepAccuracy && (
                <span className={cn(
                  "text-sm px-2 py-1 rounded",
                  stepAccuracy.accuracy >= 80 ? "bg-green-100 text-green-800" :
                  stepAccuracy.accuracy >= 60 ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                )}>
                  {stepAccuracy.accuracy.toFixed(0)}% accurate
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              {/* Accuracy Indicators */}
              <div className="flex items-center mb-4">
                <div className="w-24 text-xs font-medium text-muted-foreground">Accuracy</div>
                {stepIndicators.map((indicator, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 min-w-[32px] h-2 mx-[2px] rounded transition-all",
                      indicator.accuracy === null ? "bg-muted" :
                      indicator.isCorrect ? "bg-green-500" : "bg-red-500",
                      i === currentStep && "ring-1 ring-primary ring-offset-1"
                    )}
                  />
                ))}
              </div>

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
                    className={cn(
                      "flex-1 min-w-[32px] text-center text-xs transition-all",
                      i === currentStep 
                        ? "text-primary font-bold bg-primary/10 rounded" 
                        : "text-muted-foreground"
                    )}
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
                  {Array.from({ length: 16 }, (_, stepIndex) => {
                    const isTargetActive = targetPattern[drumKey][stepIndex];
                    const isDetectedActive = detectedPattern[drumKey][stepIndex];
                    const isCorrect = isTargetActive === isDetectedActive;
                    
                    return (
                      <div
                        key={stepIndex}
                        className={cn(
                          "flex-1 min-w-[32px] h-8 mx-[2px] rounded flex items-center justify-center border-2 transition-all",
                          isDetectedActive
                            ? isCorrect 
                              ? `${drumInfo.color} border-green-500 text-white`
                              : `${drumInfo.color} border-red-500 text-white`
                            : isTargetActive && !isDetectedActive
                              ? "bg-red-100 border-red-300"
                              : "bg-background border-muted",
                          stepIndex === currentStep && "ring-2 ring-primary ring-offset-1",
                          stepIndex % 4 === 0 && "border-l-4 border-l-accent"
                        )}
                      >
                        {isDetectedActive && (
                          <div className="w-3 h-3 bg-current rounded-full" />
                        )}
                        {isTargetActive && !isDetectedActive && (
                          <div className="w-3 h-3 border-2 border-current rounded-full opacity-50" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};