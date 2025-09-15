import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PatternNavigationProps {
  currentView: number;
  totalSteps: number;
  stepsPerView: number;
  onViewChange: (view: number) => void;
}

export const PatternNavigation = ({
  currentView,
  totalSteps,
  stepsPerView,
  onViewChange
}: PatternNavigationProps) => {
  const totalViews = Math.ceil(totalSteps / stepsPerView);
  const startStep = currentView * stepsPerView;
  const endStep = Math.min(startStep + stepsPerView, totalSteps);

  if (totalViews <= 1) return null;

  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewChange(Math.max(0, currentView - 1))}
          disabled={currentView === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <span className="text-sm font-medium">
          Steps {startStep + 1}-{endStep} of {totalSteps}
        </span>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewChange(Math.min(totalViews - 1, currentView + 1))}
          disabled={currentView === totalViews - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex items-center gap-1">
        {Array.from({ length: totalViews }, (_, i) => (
          <button
            key={i}
            onClick={() => onViewChange(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentView ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
};