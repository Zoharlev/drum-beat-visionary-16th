import { Button } from "@/components/ui/button";
import { Trash2, Volume2, VolumeX, Settings, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrumGridProps {
  pattern: {
    [key: string]: boolean[] | number | string[] | number[];
    length: number;
    subdivisions?: string[];
    offsets?: number[];
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
const drumLabels: {
  [key: string]: {
    name: string;
    symbol: string;
  };
} = {
  kick: {
    name: "Kick",
    symbol: "●"
  },
  snare: {
    name: "Snare",
    symbol: "×"
  },
  hihat: {
    name: "Hi-Hat",
    symbol: "○"
  },
  openhat: {
    name: "Open Hat",
    symbol: "◎"
  },
  tom: {
    name: "Tom",
    symbol: "◆"
  },
  "HH Closed": {
    name: "Hi-Hat",
    symbol: "○"
  },
  "HH Open": {
    name: "Open Hat",
    symbol: "◎"
  },
  Kick: {
    name: "Kick",
    symbol: "●"
  },
  Snare: {
    name: "Snare",
    symbol: "×"
  },
  Tom: {
    name: "Tom",
    symbol: "◆"
  }
};
export const DrumGrid = ({
  pattern,
  currentStep,
  currentView = 0,
  stepsPerView = 16,
  onStepToggle,
  onClearPattern,
  metronomeEnabled,
  onMetronomeToggle,
  onTogglePlay,
  isPlaying,
  onLoadPattern,
  isLoadingPattern
}: DrumGridProps) => {
  // Calculate visible steps
  const startStep = currentView * stepsPerView;
  const endStep = Math.min(startStep + stepsPerView, pattern.length);
  const visibleSteps = endStep - startStep;
  return <div className="space-y-6">
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

      {/* Grid Container */}
      <div className="relative bg-card rounded-lg p-6 shadow-elevated">
        {/* Playhead */}
        {currentStep >= startStep && currentStep < endStep && (
          <div className="absolute top-0 bottom-0 w-1 bg-playhead transition-all duration-75 z-10" style={{
            left: `${88 + (currentStep - startStep) * (100 - 88 / visibleSteps) / visibleSteps}%`,
            boxShadow: "0 0 20px hsl(var(--playhead) / 0.6)"
          }} />
        )}

        {/* Beat Numbers */}
        <div className="flex mb-4">
          <div className="w-20"></div>
          {Array.from({
            length: visibleSteps
          }, (_, i) => {
            const stepIndex = startStep + i;
            let displayText = "";
            let textStyle = "text-muted-foreground/60";
            
            // If we have subdivision data from the CSV, use it
            if (pattern.subdivisions && pattern.subdivisions[stepIndex]) {
              const count = pattern.subdivisions[stepIndex];
              displayText = count;
              
              // Style based on count type
              if (count === '1' || count === '2' || count === '3' || count === '4') {
                textStyle = "text-primary font-bold";
              } else if (count === '&') {
                textStyle = "text-accent font-medium";
              } else if (count === 'e' || count === 'a') {
                textStyle = "text-muted-foreground/70 font-medium";
              }
            } else {
              // Fallback to 16-step bar: 1 e & a 2 e & a 3 e & a 4 e & a
              const posInBar = stepIndex % 16;
              const beatPosition = posInBar % 4;
              
              if (beatPosition === 0) {
                // Main beats: 1, 2, 3, 4
                displayText = String(Math.floor(posInBar / 4) + 1);
                textStyle = "text-primary font-bold";
              } else if (beatPosition === 1) {
                // 16th note "e"
                displayText = "e";
                textStyle = "text-muted-foreground/70 font-medium";
              } else if (beatPosition === 2) {
                // 8th note "&"
                displayText = "&";
                textStyle = "text-accent font-medium";
              } else if (beatPosition === 3) {
                // 16th note "a"
                displayText = "a";
                textStyle = "text-muted-foreground/70 font-medium";
              }
            }
            
            return (
              <div key={stepIndex} className={cn("flex-1 text-center text-sm font-mono", textStyle)}>
                {displayText}
              </div>
            );
          })}
        </div>

        {/* Drum Rows */}
        {Object.entries(pattern).filter(([key]) => key !== 'length' && key !== 'subdivisions' && key !== 'offsets').map(([drumKey, steps]) => {
          if (!Array.isArray(steps)) return null;
          
          const drumInfo = drumLabels[drumKey] || { 
            name: drumKey, 
            symbol: drumKey === 'Kick' ? '●' : drumKey === 'Snare' ? '×' : drumKey === 'Hi-Hat' ? '○' : drumKey === 'Tom' ? '◆' : '●' 
          };
          
          return (
            <div key={drumKey} className="flex items-center mb-3 group">
              {/* Drum Label */}
              <div className="w-20 flex items-center gap-2 pr-4">
                <span className="text-lg font-mono text-accent">{drumInfo.symbol}</span>
                <span className="text-sm font-medium text-foreground">{drumInfo.name}</span>
              </div>

              {/* Grid Line */}
              <div className="flex-1 relative">
                <div className="absolute inset-0 border-t border-grid-line"></div>
                
                {/* Step Buttons */}
                <div className="flex relative z-10">
                  {Array.from({ length: visibleSteps }, (_, i) => {
                    const stepIndex = startStep + i;
                    const active = (steps as boolean[])[stepIndex];
                    return (
                      <button 
                        key={stepIndex} 
                        onClick={() => onStepToggle(drumKey, stepIndex)} 
                        className={cn(
                          "flex-1 h-12 border-r border-grid-line last:border-r-0 transition-all duration-200",
                          "flex items-center justify-center group-hover:bg-muted/20",
                          stepIndex === currentStep && "bg-playhead/10",
                          stepIndex % 2 === 0 && "border-r-2 border-primary/30"
                        )}
                      >
                        {active && (
                          <div className={cn(
                            "w-6 h-6 rounded-full bg-gradient-to-br from-note-active to-accent",
                            "shadow-note transition-transform duration-200 hover:scale-110",
                            "flex items-center justify-center text-xs font-bold text-background",
                            stepIndex === currentStep && active && "animate-bounce"
                          )}>
                            {drumInfo.symbol}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Grid Enhancement */}
        <div className="absolute inset-6 pointer-events-none">
          {/* Vertical beat lines */}
          {Array.from({ length: Math.ceil(visibleSteps / 2) }, (_, i) => (
            <div 
              key={i} 
              className="absolute top-0 bottom-0 border-l border-primary/20" 
              style={{
                left: `${88 + i * (100 - 88 / visibleSteps) / (visibleSteps / 2)}%`
              }} 
            />
          ))}
        </div>
      </div>

      {/* Pattern Info */}
      
    </div>;
};