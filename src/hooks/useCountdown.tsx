import { useState, useEffect, useCallback } from 'react';

interface UseCountdownProps {
  initialCount: number;
  onComplete: () => void;
  onTick?: (count: number) => void;
}

export const useCountdown = ({ initialCount, onComplete, onTick }: UseCountdownProps) => {
  const [count, setCount] = useState(initialCount);
  const [isActive, setIsActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const start = useCallback(() => {
    setIsActive(true);
    setIsCompleted(false);
    setCount(initialCount);
  }, [initialCount]);

  const stop = useCallback(() => {
    setIsActive(false);
  }, []);

  const reset = useCallback(() => {
    setIsActive(false);
    setCount(initialCount);
    setIsCompleted(false);
  }, [initialCount]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && count > 0) {
      interval = setInterval(() => {
        setCount((prev) => {
          const newCount = prev - 1;
          onTick?.(newCount);
          
          if (newCount === 0) {
            setIsActive(false);
            setIsCompleted(true);
            onComplete();
          }
          
          return newCount;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, count, onComplete, onTick]);

  return {
    count,
    isActive,
    isCompleted,
    start,
    stop,
    reset
  };
};