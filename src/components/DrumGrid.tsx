import { Button } from "@/components/ui/button";
import { Trash2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrumGridProps {
  pattern: { [key: string]: boolean[] };
  currentStep: number;
  onStepToggle: (drum: string, step: number) => void;
  onClearPattern: () => void;
  metronomeEnabled: boolean;
  onMetronomeToggle: () => void;
}

const drumLabels: { [key: string]: { name: string; symbol: string } } = {
  kick: { name: "Kick", symbol: "●" },
  snare: { name: "Snare", symbol: "×" },
  hihat: { name: "Hi-Hat", symbol: "○" },
  openhat: { name: "Open Hat", symbol: "◎" },
};

export const DrumGrid = ({
  pattern,
  currentStep,
  onStepToggle,
  onClearPattern,
  metronomeEnabled,
  onMetronomeToggle,
}: DrumGridProps) => {
  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant={metronomeEnabled ? "default" : "outline"}
            onClick={onMetronomeToggle}
            className="flex items-center gap-2"
          >
            {metronomeEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
            Metronome
          </Button>
        </div>
        
        <Button
          variant="outline"
          onClick={onClearPattern}
          className="flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
      </div>

      {/* Grid Container */}
      <div className="relative bg-card rounded-lg p-6 shadow-elevated">
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-playhead transition-all duration-75 z-10"
          style={{
            left: `${88 + (currentStep * (100 - 88 / 16)) / 16}%`,
            boxShadow: "0 0 20px hsl(var(--playhead) / 0.6)",
          }}
        />

        {/* Beat Numbers */}
        <div className="flex mb-4">
          <div className="w-20"></div>
          {Array.from({ length: 16 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 text-center text-sm font-mono",
                i % 4 === 0 ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              {i % 4 === 0 ? Math.floor(i / 4) + 1 : ""}
            </div>
          ))}
        </div>

        {/* Drum Rows */}
        {Object.entries(drumLabels).map(([drumKey, { name, symbol }]) => (
          <div key={drumKey} className="flex items-center mb-3 group">
            {/* Drum Label */}
            <div className="w-20 flex items-center gap-2 pr-4">
              <span className="text-lg font-mono text-accent">{symbol}</span>
              <span className="text-sm font-medium text-foreground">{name}</span>
            </div>

            {/* Grid Line */}
            <div className="flex-1 relative">
              <div className="absolute inset-0 border-t border-grid-line"></div>
              
              {/* Step Buttons */}
              <div className="flex relative z-10">
                {pattern[drumKey]?.map((active, stepIndex) => (
                  <button
                    key={stepIndex}
                    onClick={() => onStepToggle(drumKey, stepIndex)}
                    className={cn(
                      "flex-1 h-12 border-r border-grid-line last:border-r-0 transition-all duration-200",
                      "flex items-center justify-center group-hover:bg-muted/20",
                      stepIndex === currentStep && "bg-playhead/10",
                      stepIndex % 4 === 0 && "border-r-2 border-primary/30"
                    )}
                  >
                    {active && (
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full bg-gradient-to-br from-note-active to-accent",
                          "shadow-note transition-transform duration-200 hover:scale-110",
                          "flex items-center justify-center text-xs font-bold text-background"
                        )}
                      >
                        {symbol}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Grid Enhancement */}
        <div className="absolute inset-6 pointer-events-none">
          {/* Vertical beat lines */}
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-primary/20"
              style={{ left: `${88 + (i * 25)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Pattern Info */}
      <div className="text-center text-sm text-muted-foreground">
        Click on the grid to add or remove notes • Yellow line shows current playback position
      </div>
    </div>
  );
};