import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrumPianoRollProps {
  pattern: {
    [key: string]: boolean[] | number;
    length: number;
  };
  currentStep: number;
  currentView?: number;
  stepsPerView?: number;
  onStepToggle: (drum: string, step: number) => void;
  onClearPattern: () => void;
  metronomeEnabled: boolean;
  onMetronomeToggle: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  onLoadPattern?: () => void;
  isLoadingPattern?: boolean;
}

const drumInfo: {
  [key: string]: {
    name: string;
    color: string;
  };
} = {
  'Kick': { name: 'Kick', color: 'bg-red-500' },
  'Snare': { name: 'Snare', color: 'bg-blue-500' },
  'HH Closed': { name: 'Hi-Hat', color: 'bg-yellow-500' },
  'HH Open': { name: 'Open Hat', color: 'bg-green-500' },
};

export const DrumPianoRoll = ({
  pattern,
  currentStep,
  currentView = 0,
  stepsPerView = 16,
  onStepToggle,
  onClearPattern,
  onTogglePlay,
  isPlaying,
  onLoadPattern,
  isLoadingPattern
}: DrumPianoRollProps) => {
  const startStep = currentView * stepsPerView;
  const endStep = Math.min(startStep + stepsPerView, pattern.length);
  const visibleSteps = endStep - startStep;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={isPlaying ? "default" : "ghost"}
          onClick={onTogglePlay}
          className={cn(
            "h-12 px-6 rounded-[20px] text-xs",
            isPlaying 
              ? "bg-primary text-primary-foreground hover:bg-primary/90" 
              : "bg-primary/10 hover:bg-primary/20"
          )}
        >
          {isPlaying ? "STOP" : "PREVIEW"}
        </Button>
        <Button variant="outline" onClick={onClearPattern} className="flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
        {onLoadPattern && (
          <Button 
            onClick={onLoadPattern} 
            variant="outline" 
            className="flex items-center gap-2"
            disabled={isLoadingPattern}
          >
            {isLoadingPattern ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Load CSV
          </Button>
        )}
        <Button variant="outline" size="icon">
          <img 
            src="/lovable-uploads/fbd529ea-6eab-43ce-8d5d-274c34542d99.png" 
            alt="Menu"
            className="w-4 h-4"
          />
        </Button>
      </div>

      {/* Piano Roll Container */}
      <div className="relative bg-card rounded-lg p-6 shadow-elevated">
        {/* Playhead */}
        {currentStep >= startStep && currentStep < endStep && (
          <div 
            className="absolute top-0 bottom-0 w-1 bg-playhead transition-all duration-75 z-20" 
            style={{
              left: `${120 + ((currentStep - startStep) / visibleSteps) * (100 - 120 / window.innerWidth * 100)}%`,
              boxShadow: "0 0 20px hsl(var(--playhead) / 0.6)"
            }} 
          />
        )}

        {/* Time Grid Header */}
        <div className="flex mb-2">
          <div className="w-28"></div>
          <div className="flex-1 flex border-b border-grid-line pb-2">
            {Array.from({ length: visibleSteps }, (_, i) => {
              const stepIndex = startStep + i;
              const posInBar = stepIndex % 8;
              
              let displayText = "";
              let textStyle = "text-muted-foreground/60";
              
              if (posInBar % 2 === 0) {
                displayText = String(Math.floor(posInBar / 2) + 1);
                textStyle = "text-primary font-bold";
              } else {
                displayText = "&";
                textStyle = "text-accent font-medium";
              }
              
              return (
                <div 
                  key={stepIndex} 
                  className={cn("flex-1 text-center text-xs font-mono", textStyle)}
                >
                  {displayText}
                </div>
              );
            })}
          </div>
        </div>

        {/* Drum Lanes */}
        {Object.entries(pattern)
          .filter(([key]) => key !== 'length')
          .map(([drumKey, steps]) => {
            if (!Array.isArray(steps)) return null;
            
            const info = drumInfo[drumKey] || { name: drumKey, color: 'bg-purple-500' };
            
            return (
              <div key={drumKey} className="flex items-center mb-2 group">
                {/* Lane Label */}
                <div className="w-28 pr-4 text-right">
                  <span className="text-sm font-medium text-foreground">{info.name}</span>
                </div>

                {/* Lane Background */}
                <div className="flex-1 relative h-12 bg-muted/20 rounded group-hover:bg-muted/30 transition-colors">
                  {/* Vertical grid lines */}
                  {Array.from({ length: visibleSteps }, (_, i) => {
                    const stepIndex = startStep + i;
                    return (
                      <div 
                        key={stepIndex}
                        className={cn(
                          "absolute top-0 bottom-0 border-l border-grid-line/30",
                          stepIndex % 2 === 0 && "border-primary/20 border-l-2"
                        )}
                        style={{ left: `${(i / visibleSteps) * 100}%` }}
                      />
                    );
                  })}

                  {/* Notes */}
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: visibleSteps }, (_, i) => {
                      const stepIndex = startStep + i;
                      const active = (steps as boolean[])[stepIndex];
                      
                      return (
                        <button
                          key={stepIndex}
                          onClick={() => onStepToggle(drumKey, stepIndex)}
                          className={cn(
                            "flex-1 h-full relative transition-all duration-200",
                            stepIndex === currentStep && "bg-playhead/10"
                          )}
                        >
                          {active && (
                            <div 
                              className={cn(
                                "absolute inset-y-1 left-0.5 right-0.5 rounded",
                                info.color,
                                "opacity-80 hover:opacity-100 shadow-lg",
                                "transition-all duration-200 hover:scale-105",
                                stepIndex === currentStep && "ring-2 ring-playhead animate-pulse"
                              )}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

        {/* Beat markers overlay */}
        <div className="absolute top-0 left-28 right-0 bottom-0 pointer-events-none">
          {Array.from({ length: Math.ceil(visibleSteps / 2) }, (_, i) => (
            <div 
              key={i}
              className="absolute top-0 bottom-0 border-l border-primary/10"
              style={{ left: `${(i * 2 / visibleSteps) * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
