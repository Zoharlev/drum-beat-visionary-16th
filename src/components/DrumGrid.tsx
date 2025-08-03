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
    <div className="space-y-4">
      {/* Beat Numbers */}
      <div className="flex mb-4">
        <div className="w-24"></div>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex-1 text-center text-lg font-bold text-foreground"
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Grid Container */}
      <div className="relative bg-card/50 rounded-lg p-4">
        {/* Drum Rows */}
        {Object.entries(drumLabels).map(([drumKey, { name, symbol }]) => (
          <div key={drumKey} className="flex items-center mb-4 last:mb-0">
            {/* Drum Label */}
            <div className="w-24 flex items-center gap-3 pr-4">
              <span className="text-lg text-primary">{symbol}</span>
              <span className="text-sm font-medium text-foreground">{name}</span>
            </div>

            {/* Step Buttons - Only 4 quarters, each quarter has 4 sixteenths */}
            <div className="flex-1 flex gap-1">
              {Array.from({ length: 4 }, (_, quarterIndex) => (
                <div key={quarterIndex} className="flex-1 flex gap-1">
                  {Array.from({ length: 4 }, (_, sixteenthIndex) => {
                    const stepIndex = quarterIndex * 4 + sixteenthIndex;
                    const active = pattern[drumKey]?.[stepIndex];
                    const isCurrentStep = stepIndex === currentStep;
                    
                    return (
                      <button
                        key={sixteenthIndex}
                        onClick={() => onStepToggle(drumKey, stepIndex)}
                        className={cn(
                          "flex-1 h-8 rounded transition-all duration-200",
                          "flex items-center justify-center",
                          active 
                            ? "bg-primary" 
                            : "bg-secondary/50 hover:bg-secondary",
                          isCurrentStep && "ring-2 ring-primary/50"
                        )}
                      >
                        {active && (
                          <div className="w-2 h-2 rounded-full bg-primary-foreground"></div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};