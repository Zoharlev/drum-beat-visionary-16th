import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CountdownDisplayProps {
  count: number;
  isActive: boolean;
  isCompleted: boolean;
  className?: string;
}

export const CountdownDisplay = ({ count, isActive, isCompleted, className }: CountdownDisplayProps) => {
  // Play countdown sound effects
  useEffect(() => {
    if (isActive && count > 0 && count <= 3) {
      // Create a simple beep sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(count === 1 ? 1200 : 800, audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    }
  }, [count, isActive]);

  if (!isActive && !isCompleted) return null;

  return (
    <Card className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50", className)}>
      <CardContent className="p-8">
        <div className="text-center">
          {isCompleted ? (
            <div className="space-y-4">
              <div className="text-6xl font-bold text-green-500 animate-pulse">
                GO!
              </div>
              <div className="text-lg text-muted-foreground">
                Practice session started
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={cn(
                "text-8xl font-bold transition-all duration-300",
                count <= 3 ? "text-red-500 animate-bounce" : "text-primary",
                count === 1 && "scale-110"
              )}>
                {count}
              </div>
              <div className="text-xl text-muted-foreground">
                Get ready...
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};