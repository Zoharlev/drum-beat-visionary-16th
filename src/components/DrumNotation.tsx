import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrumNotationProps {
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

// Drum positions on the staff (absolute Y coordinates aligned with staff lines)
// Supports both title-case (manual) and lowercase (CSV) naming conventions
const drumPositions: { [key: string]: { y: number; noteType: 'note' | 'x' | 'open' } } = {
  // Kick drum (bottom staff line) - filled notehead
  'Kick': { y: 120, noteType: 'note' },
  'kick': { y: 120, noteType: 'note' },
  
  // Snare drum (middle staff line) - filled notehead
  'Snare': { y: 80, noteType: 'note' },
  'snare': { y: 80, noteType: 'note' },
  
  // Closed hi-hat (top staff line) - X notehead
  'HH Closed': { y: 40, noteType: 'x' },
  'Hi-Hat': { y: 40, noteType: 'x' },
  'hihat': { y: 40, noteType: 'x' },
  
  // Open hi-hat (top staff line) - X notehead with circle above
  'HH Open': { y: 40, noteType: 'open' },
  'Hi-Hat (Open)': { y: 40, noteType: 'open' },
  'openhat': { y: 40, noteType: 'open' },
};

export const DrumNotation = ({
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
}: DrumNotationProps) => {
  const startStep = currentView * stepsPerView;
  const endStep = Math.min(startStep + stepsPerView, pattern.length);
  const visibleSteps = endStep - startStep;

  // Render a note at a specific position
  const renderNote = (drum: string, stepIndex: number, x: number, y: number) => {
    const drumInfo = drumPositions[drum];
    if (!drumInfo) return null;

    const isCurrentStep = stepIndex === currentStep;
    
    if (drumInfo.noteType === 'x') {
      // X-shaped notehead for closed hi-hat
      return (
        <g key={`${drum}-${stepIndex}`}>
          <line
            x1={x - 6}
            y1={y - 6}
            x2={x + 6}
            y2={y + 6}
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
          <line
            x1={x - 6}
            y1={y + 6}
            x2={x + 6}
            y2={y - 6}
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
          <line
            x1={x}
            y1={y + 6}
            x2={x}
            y2={y - 30}
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
        </g>
      );
    } else if (drumInfo.noteType === 'open') {
      // Open hi-hat: X notehead with small circle above (classic notation)
      return (
        <g key={`${drum}-${stepIndex}`}>
          {/* X notehead */}
          <line
            x1={x - 6}
            y1={y - 6}
            x2={x + 6}
            y2={y + 6}
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
          <line
            x1={x - 6}
            y1={y + 6}
            x2={x + 6}
            y2={y - 6}
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
          {/* Stem */}
          <line
            x1={x}
            y1={y + 6}
            x2={x}
            y2={y - 30}
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
          {/* Small circle above to indicate "open" */}
          <circle
            cx={x}
            cy={y - 18}
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
        </g>
      );
    } else {
      // Filled note for kick and closed hi-hat
      return (
        <g key={`${drum}-${stepIndex}`}>
          <ellipse
            cx={x}
            cy={y}
            rx="7"
            ry="5"
            fill="currentColor"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
          <line
            x1={x + 7}
            y1={y}
            x2={x + 7}
            y2={y - 30}
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "transition-all",
              isCurrentStep ? "text-playhead" : "text-note-active"
            )}
          />
        </g>
      );
    }
  };

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

      {/* Notation Container */}
      <div className="relative bg-card rounded-lg p-8 shadow-elevated">
        {/* Legend */}
        <div className="flex gap-6 mb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <ellipse cx="10" cy="10" rx="7" ry="5" fill="currentColor" className="text-note-active" />
            </svg>
            <span>Kick / Snare</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" className="text-note-active" />
              <line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" strokeWidth="2" className="text-note-active" />
            </svg>
            <span>Closed HH</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" className="text-note-active" />
              <line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" strokeWidth="2" className="text-note-active" />
              <circle cx="10" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-note-active" />
            </svg>
            <span>Open HH</span>
          </div>
        </div>

        {/* Staff SVG */}
        <svg 
          width="100%" 
          height="200" 
          className="overflow-visible"
          viewBox="0 0 1000 200"
        >
          {/* Staff lines */}
          {[0, 1, 2, 3, 4].map((line) => (
            <line
              key={line}
              x1="0"
              x2="1000"
              y1={40 + line * 20}
              y2={40 + line * 20}
              stroke="currentColor"
              strokeWidth="1"
              className="text-grid-line"
            />
          ))}

          {/* Bar lines */}
          {Array.from({ length: Math.ceil(visibleSteps / 4) + 1 }, (_, i) => {
            const x = 40 + (i * 4 * 920) / visibleSteps;
            return (
              <line
                key={i}
                x1={x}
                x2={x}
                y1={40}
                y2={120}
                stroke="currentColor"
                strokeWidth={i === 0 ? "3" : "1.5"}
                className="text-primary/40"
              />
            );
          })}

          {/* Beat numbers */}
          {Array.from({ length: visibleSteps }, (_, i) => {
            const stepIndex = startStep + i;
            const x = 60 + (i * 920) / visibleSteps;
            const posInBar = stepIndex % 8;
            
            if (posInBar % 2 === 0) {
              const beatNum = Math.floor(posInBar / 2) + 1;
              return (
                <text
                  key={i}
                  x={x}
                  y={25}
                  textAnchor="middle"
                  className="text-xs font-bold fill-primary"
                >
                  {beatNum}
                </text>
              );
            }
            return null;
          })}

          {/* Playhead */}
          {currentStep >= startStep && currentStep < endStep && (
            <line
              x1={60 + ((currentStep - startStep) * 920) / visibleSteps}
              x2={60 + ((currentStep - startStep) * 920) / visibleSteps}
              y1={20}
              y2={140}
              stroke="currentColor"
              strokeWidth="3"
              className="text-playhead"
              style={{
                filter: "drop-shadow(0 0 8px hsl(var(--playhead) / 0.6))"
              }}
            />
          )}

          {/* Notes */}
          {Object.entries(pattern)
            .filter(([key]) => key !== 'length')
            .map(([drumKey, steps]) => {
              if (!Array.isArray(steps)) return null;
              
              const drumInfo = drumPositions[drumKey];
              if (!drumInfo) return null;
              
              return Array.from({ length: visibleSteps }, (_, i) => {
                const stepIndex = startStep + i;
                const active = steps[stepIndex];
                
                if (!active) return null;
                
                const x = 60 + (i * 920) / visibleSteps;
                const y = drumInfo.y;
                
                return (
                  <g
                    key={`${drumKey}-${stepIndex}`}
                    onClick={() => onStepToggle(drumKey, stepIndex)}
                    className="cursor-pointer"
                  >
                    {/* Clickable area */}
                    <rect
                      x={x - 15}
                      y={y - 15}
                      width="30"
                      height="30"
                      fill="transparent"
                    />
                    {renderNote(drumKey, stepIndex, x, y)}
                  </g>
                );
              });
            })}

          {/* Clickable areas for adding notes */}
          {Object.entries(drumPositions).map(([drumKey, drumInfo]) => {
            return Array.from({ length: visibleSteps }, (_, i) => {
              const stepIndex = startStep + i;
              const steps = pattern[drumKey] as boolean[];
              if (!steps || steps[stepIndex]) return null;
              
              const x = 60 + (i * 920) / visibleSteps;
              const y = drumInfo.y;
              
              return (
                <circle
                  key={`empty-${drumKey}-${stepIndex}`}
                  cx={x}
                  cy={y}
                  r="12"
                  fill="transparent"
                  className="cursor-pointer hover:fill-primary/10 transition-colors"
                  onClick={() => onStepToggle(drumKey, stepIndex)}
                />
              );
            });
          })}
        </svg>

        {/* Drum labels on the left */}
        <div className="absolute left-2 top-8 text-xs text-muted-foreground">
          <div style={{ marginTop: '32px' }}>HH</div>
          <div style={{ marginTop: '32px' }}>Snare</div>
          <div style={{ marginTop: '32px' }}>Kick</div>
        </div>
      </div>
    </div>
  );
};
