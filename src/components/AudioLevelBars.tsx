import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioLevelBarsProps {
  isListening: boolean;
  analyserRef: React.RefObject<AnalyserNode | null>;
  className?: string;
}

export const AudioLevelBars = ({ isListening, analyserRef, className }: AudioLevelBarsProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!isListening || !analyserRef.current || !canvasRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;

    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isListening || !analyser) return;

      analyser.getByteFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = 'rgb(15, 23, 42)'; // slate-900
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      // Only show first 128 bars for better visualization
      const maxBars = Math.min(128, bufferLength);
      
      for (let i = 0; i < maxBars; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        // Color gradient based on frequency
        const hue = (i / maxBars) * 120; // 0-120 for red to green
        const saturation = 70;
        const lightness = Math.min(50 + (dataArray[i] / 255) * 30, 80);
        
        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening, analyserRef]);

  if (!isListening) {
    return (
      <div className={cn("w-full h-24 bg-slate-900 rounded-lg flex items-center justify-center", className)}>
        <span className="text-slate-400 text-sm">Audio visualization will appear when listening</span>
      </div>
    );
  }

  return (
    <div className={cn("w-full h-24 bg-slate-900 rounded-lg overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        width={400}
        height={96}
        className="w-full h-full"
      />
    </div>
  );
};