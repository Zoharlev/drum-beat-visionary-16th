import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface BeatDetection {
  id: string;
  timestamp: number;
  drumType: string;
  confidence: number;
  relativeTime: number;
}

interface BeatTimelineProps {
  detectedDrum: string;
  confidence: number;
  isListening: boolean;
  className?: string;
}

export const BeatTimeline = ({ detectedDrum, confidence, isListening, className }: BeatTimelineProps) => {
  const [detections, setDetections] = useState<BeatDetection[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Start timing when listening begins
  useEffect(() => {
    if (isListening && !startTime) {
      setStartTime(Date.now());
      setDetections([]);
    } else if (!isListening) {
      setStartTime(null);
    }
  }, [isListening, startTime]);

  // Add new detection to timeline with aggressive debugging
  useEffect(() => {
    console.log('🎵 Timeline update:', { detectedDrum, confidence, startTime });
    
    if (detectedDrum && confidence > 0 && startTime) { // Remove confidence threshold
      const now = Date.now();
      const newDetection: BeatDetection = {
        id: `${now}-${Math.random()}`,
        timestamp: now,
        drumType: detectedDrum,
        confidence,
        relativeTime: now - startTime
      };

      console.log('📍 Adding detection to timeline:', newDetection);

      setDetections(prev => {
        const updated = [...prev, newDetection];
        console.log('📊 Timeline now has', updated.length, 'detections');
        // Keep only last 50 detections to prevent memory issues
        return updated.slice(-50);
      });

      // Auto-scroll to latest detection
      setTimeout(() => {
        if (timelineRef.current) {
          timelineRef.current.scrollLeft = timelineRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [detectedDrum, confidence, startTime]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getDrumColor = (drumType: string) => {
    const colors: { [key: string]: string } = {
      'Kick': 'bg-red-500',
      'Snare': 'bg-blue-500',
      'Hi-Hat': 'bg-yellow-500',
      'Open Hat': 'bg-orange-500',
      'Tom': 'bg-purple-500',
      'Generic Sound': 'bg-gray-500',
      'Unknown': 'bg-gray-400'
    };
    return colors[drumType] || 'bg-gray-400';
  };

  const getDrumIcon = (drumType: string) => {
    const icons: { [key: string]: string } = {
      'Kick': '●',
      'Snare': '×',
      'Hi-Hat': '○',
      'Open Hat': '◎',
      'Tom': '◐',
      'Generic Sound': '♪',
      'Unknown': '?'
    };
    return icons[drumType] || '?';
  };

  if (!isListening && detections.length === 0) {
    return (
      <div className={cn("w-full h-32 bg-slate-900 rounded-lg flex items-center justify-center", className)}>
        <span className="text-slate-400 text-sm">Beat timeline will appear when listening</span>
      </div>
    );
  }

  return (
    <div className={cn("w-full bg-slate-900 rounded-lg p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-slate-300">
          Beat Timeline ({detections.length} detections)
        </h4>
        {startTime && (
          <span className="text-xs text-slate-400">
            {formatTime(Date.now() - startTime)}
          </span>
        )}
      </div>
      
      <div 
        ref={timelineRef}
        className="relative h-20 overflow-x-auto scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600"
      >
        {/* Timeline background */}
        <div className="absolute inset-0 bg-slate-800 rounded">
          {/* Time grid lines */}
          {startTime && [...Array(Math.ceil((Date.now() - startTime) / 5000))].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-slate-700"
              style={{ left: `${(i * 5000) / 100}px` }}
            >
              <span className="absolute -bottom-5 -left-4 text-xs text-slate-500">
                {formatTime(i * 5000)}
              </span>
            </div>
          ))}
        </div>

        {/* Beat markers with enhanced visibility */}
        <div className="relative h-full min-w-full">
          {detections.length === 0 && isListening && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              Waiting for beats... (Make some noise!)
            </div>
          )}
          
          {detections.map((detection, index) => (
            <div
              key={detection.id}
              className="absolute top-1 transform -translate-x-1/2 animate-scale-in"
              style={{ 
                left: `${Math.max(detection.relativeTime / 50, 20)}px` // Slower timeline: 1px per 50ms
              }}
            >
              {/* Beat marker with enhanced visibility */}
              <div 
                className={cn(
                  "w-4 h-14 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg border-2 border-white",
                  getDrumColor(detection.drumType)
                )}
                style={{ 
                  opacity: Math.max(detection.confidence * 0.7 + 0.3, 0.5), // Ensure visibility
                  height: `${Math.max(detection.confidence * 56, 20)}px` // Minimum height
                }}
                title={`${detection.drumType} - ${Math.round(detection.confidence * 100)}% at ${formatTime(detection.relativeTime)}`}
              >
                {getDrumIcon(detection.drumType)}
              </div>
              
              {/* Confidence indicator with better visibility */}
              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2">
                <div className="text-xs text-slate-300 bg-slate-800 px-1 rounded">
                  {Math.round(detection.confidence * 100)}%
                </div>
              </div>
              
              {/* Detection number for debugging */}
              <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                <div className="text-xs text-slate-400">
                  #{index + 1}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      {detections.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {Object.entries({
            'Kick': 'bg-red-500',
            'Snare': 'bg-blue-500', 
            'Hi-Hat': 'bg-yellow-500',
            'Open Hat': 'bg-orange-500',
            'Tom': 'bg-purple-500'
          }).map(([drum, color]) => (
            <div key={drum} className="flex items-center gap-1">
              <div className={cn("w-2 h-2 rounded-full", color)}></div>
              <span className="text-slate-400">{drum}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
