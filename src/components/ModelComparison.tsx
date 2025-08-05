import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Mic, MicOff, Loader2, Zap, Cpu } from 'lucide-react';
import { useDrumListener } from '../hooks/useDrumListener';
import { usePretrainedDrumClassification } from '../hooks/usePretrainedDrumClassification';
import { useAudioClassification } from '../hooks/useAudioClassification';
import { BeatTimeline } from './BeatTimeline';

export const ModelComparison: React.FC = () => {
  const [activeModel, setActiveModel] = useState<'custom' | 'wav2vec2' | 'yamnet' | 'simple'>('wav2vec2');
  
  // Initialize all hooks
  const customModel = useDrumListener();
  const wav2vec2Model = usePretrainedDrumClassification('wav2vec2-drums');
  const yamnetModel = usePretrainedDrumClassification('yamnet');
  const simpleModel = useAudioClassification();

  const models = {
    custom: {
      name: 'Custom TensorFlow.js',
      description: 'Custom-trained neural network with MFCC features',
      hook: customModel,
      icon: <Cpu className="h-4 w-4" />,
      color: 'bg-blue-500'
    },
    wav2vec2: {
      name: 'Wav2Vec2 (Pre-trained)',
      description: 'DunnBC22/wav2vec2-base-Drum_Kit_Sounds model',
      hook: wav2vec2Model,
      icon: <Zap className="h-4 w-4" />,
      color: 'bg-green-500'
    },
    yamnet: {
      name: 'YAMNet (Google)',
      description: 'Google\'s YAMNet audio classification model',
      hook: yamnetModel,
      icon: <Zap className="h-4 w-4" />,
      color: 'bg-purple-500'
    },
    simple: {
      name: 'Simple Frequency',
      description: 'Basic frequency analysis detection',
      hook: simpleModel,
      icon: <Cpu className="h-4 w-4" />,
      color: 'bg-orange-500'
    }
  };

  const currentModel = models[activeModel];
  const currentHook = currentModel.hook;

  const handleModelSwitch = (modelKey: string) => {
    // Stop current model if listening
    if (currentHook.isListening) {
      currentHook.stopListening();
    }
    setActiveModel(modelKey as any);
  };

  const formatBeatType = (type: string) => {
    const typeMap: Record<string, string> = {
      kick: 'Kick',
      snare: 'Snare', 
      hihat: 'Hi-Hat',
      openhat: 'Open Hat',
      beat: 'Beat'
    };
    return typeMap[type] || type;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Drum Classification Models</h1>
        <p className="text-muted-foreground">
          Compare different AI models for real-time drum sound detection
        </p>
      </div>

      <Tabs value={activeModel} onValueChange={handleModelSwitch}>
        <TabsList className="grid w-full grid-cols-4">
          {Object.entries(models).map(([key, model]) => (
            <TabsTrigger key={key} value={key} className="flex items-center gap-2">
              {model.icon}
              <span className="hidden sm:inline">{model.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(models).map(([key, model]) => (
          <TabsContent key={key} value={key}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {model.icon}
                  {model.name}
                </CardTitle>
                <CardDescription>{model.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Model Status */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={('isModelLoaded' in model.hook && model.hook.isModelLoaded) ? 'default' : 'secondary'}>
                        {('isModelLoaded' in model.hook && model.hook.isModelLoaded) ? 'Ready' : 'Loading...'}
                      </Badge>
                      {(key === 'wav2vec2' || key === 'yamnet') && (
                        <Badge variant="outline" className="text-xs">
                          WebGPU Enabled
                        </Badge>
                      )}
                    </div>
                    {(key === 'wav2vec2' || key === 'yamnet') && 'loadingProgress' in model.hook && (
                      <div className="space-y-1">
                        <Progress value={model.hook.loadingProgress} className="w-32" />
                        <span className="text-xs text-muted-foreground">
                          {model.hook.loadingProgress}% loaded
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Audio Level Indicator */}
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-75 ${model.color}`}
                          style={{ width: `${model.hook.audioLevel * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground min-w-[3ch]">
                        {Math.round(model.hook.audioLevel * 100)}%
                      </span>
                    </div>

                    {/* Control Button */}
                    <Button
                      onClick={model.hook.isListening ? model.hook.stopListening : model.hook.startListening}
                      disabled={('isModelLoaded' in model.hook) ? !model.hook.isModelLoaded : false}
                      variant={model.hook.isListening ? 'destructive' : 'default'}
                      size="sm"
                    >
                      {('isModelLoaded' in model.hook && !model.hook.isModelLoaded) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : model.hook.isListening ? (
                        <MicOff className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                      {model.hook.isListening ? 'Stop' : 'Start'}
                    </Button>
                    
                    <Button
                      onClick={model.hook.clearBeats}
                      variant="outline"
                      size="sm"
                      disabled={model.hook.detectedBeats.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Error Display */}
                {model.hook.error && (
                  <Alert>
                    <AlertDescription>{model.hook.error}</AlertDescription>
                  </Alert>
                )}

                {/* Recent Detections */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Recent Detections</h3>
                  <div className="flex flex-wrap gap-2 min-h-[2rem]">
                    {model.hook.detectedBeats.slice(-10).map((beat, index) => (
                      <Badge
                        key={`${beat.timestamp}-${index}`}
                        variant="outline"
                        className="text-xs"
                      >
                        {formatBeatType(beat.type)} ({Math.round(beat.confidence * 100)}%)
                      </Badge>
                    ))}
                    {model.hook.detectedBeats.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        No detections yet. Try making some drum sounds!
                      </span>
                    )}
                  </div>
                </div>

                {/* Beat Timeline */}
                {model.hook.detectedBeats.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Timeline</h3>
                    <BeatTimeline 
                      beats={model.hook.detectedBeats.map(beat => ({
                        timestamp: beat.timestamp,
                        type: beat.type,
                        confidence: beat.confidence
                      }))} 
                    />
                  </div>
                )}

                {/* Model-specific Info */}
                {key === 'wav2vec2' && model.hook.detectedBeats.length > 0 && 'modelPredictions' in model.hook.detectedBeats[0] && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Model Predictions</h3>
                    <div className="text-xs font-mono bg-muted p-2 rounded">
                      {JSON.stringify(
                        (model.hook.detectedBeats[0] as any)?.modelPredictions?.allPredictions?.slice(0, 3) || [],
                        null,
                        2
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Performance Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Comparison</CardTitle>
          <CardDescription>
            Detection count and accuracy metrics across all models
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(models).map(([key, model]) => (
              <div key={key} className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  {model.icon}
                  <span className="font-medium text-sm">{model.name}</span>
                </div>
                <div className="text-2xl font-bold">
                  {model.hook.detectedBeats.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  Detections
                </div>
                {model.hook.detectedBeats.length > 0 && (
                  <div className="text-xs">
                    Avg: {Math.round(
                      model.hook.detectedBeats.reduce((sum, beat) => sum + beat.confidence, 0) /
                      model.hook.detectedBeats.length * 100
                    )}% confidence
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};