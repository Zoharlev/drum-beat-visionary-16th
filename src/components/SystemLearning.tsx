import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Play, Trash2, Mic, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCustomSamples, DrumSample } from '@/hooks/useCustomSamples';

export const SystemLearning = () => {
  const [selectedDrumType, setSelectedDrumType] = useState<string>('');
  const [sampleName, setSampleName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const { toast } = useToast();
  const { samples, saveSample, deleteSample, playCustomSample } = useCustomSamples();

  const drumTypes = [
    { value: 'kick', label: 'Kick Drum' },
    { value: 'snare', label: 'Snare Drum' },
    { value: 'hihat', label: 'Hi-Hat (Closed)' },
    { value: 'openhat', label: 'Hi-Hat (Open)' },
  ];

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedDrumType || !sampleName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a drum type and enter a sample name.",
        variant: "destructive"
      });
      return;
    }

    if (!file.type.startsWith('audio/')) {
      toast({
        title: "Invalid File",
        description: "Please select an audio file.",
        variant: "destructive"
      });
      return;
    }

    const audioUrl = URL.createObjectURL(file);
    const newSample: DrumSample = {
      id: Date.now().toString(),
      name: sampleName.trim(),
      type: selectedDrumType as DrumSample['type'],
      audioBlob: file,
      audioUrl,
      createdAt: new Date()
    };

    await saveSample(newSample);
    
    // Reset form
    setSampleName('');
    setSelectedDrumType('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    toast({
      title: "Sample Added",
      description: `${newSample.name} has been added to ${newSample.type} samples.`,
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });
      
      recordedChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/wav' });
        if (selectedDrumType && sampleName.trim()) {
          const audioUrl = URL.createObjectURL(blob);
          const newSample: DrumSample = {
            id: Date.now().toString(),
            name: sampleName.trim(),
            type: selectedDrumType as DrumSample['type'],
            audioBlob: blob,
            audioUrl,
            createdAt: new Date()
          };

          await saveSample(newSample);
          
          // Reset form
          setSampleName('');
          setSelectedDrumType('');

          toast({
            title: "Recording Saved",
            description: `${newSample.name} has been recorded and saved.`,
          });
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      toast({
        title: "Recording Started",
        description: "Recording your drum sample...",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Error",
        description: "Could not access microphone.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playSample = (sample: DrumSample) => {
    if (isPlaying === sample.id) {
      audioRef.current?.pause();
      setIsPlaying(null);
      return;
    }

    const audio = playCustomSample(sample.id);
    if (audio) {
      audioRef.current = audio;
      setIsPlaying(sample.id);
      
      audio.onended = () => setIsPlaying(null);
      audio.onerror = () => {
        setIsPlaying(null);
        toast({
          title: "Playback Error",
          description: "Could not play the sample.",
          variant: "destructive"
        });
      };
    }
  };

  const handleDeleteSample = (sampleId: string) => {
    try {
      deleteSample(sampleId);
      toast({
        title: "Sample Deleted",
        description: "The sample has been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not delete the sample.",
        variant: "destructive"
      });
    }
  };


  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">System Learning</h2>
        <p className="text-muted-foreground">Add custom drum samples to enhance your practice sessions</p>
      </div>

      {/* Add New Sample Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add New Drum Sample</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="drumType">Drum Type</Label>
              <Select value={selectedDrumType} onValueChange={setSelectedDrumType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select drum type" />
                </SelectTrigger>
                <SelectContent>
                  {drumTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sampleName">Sample Name</Label>
              <Input
                id="sampleName"
                value={sampleName}
                onChange={(e) => setSampleName(e.target.value)}
                placeholder="Enter sample name"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* File Upload */}
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full"
                disabled={!selectedDrumType || !sampleName.trim()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Audio File
              </Button>
            </div>

            {/* Recording */}
            <div className="flex-1">
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                variant={isRecording ? "destructive" : "default"}
                className="w-full"
                disabled={!selectedDrumType || !sampleName.trim()}
              >
                {isRecording ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Record Sample
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sample Library */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Library ({samples.length} samples)</CardTitle>
        </CardHeader>
        <CardContent>
          {samples.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No custom samples yet. Add your first sample above!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {samples.map(sample => (
                <Card key={sample.id} className="p-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium">{sample.name}</h3>
                      <p className="text-sm text-muted-foreground capitalize">
                        {sample.type.replace('hihat', 'hi-hat')}
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        onClick={() => playSample(sample)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {isPlaying === sample.id ? 'Playing...' : 'Play'}
                      </Button>
                      
                      <Button
                        onClick={() => handleDeleteSample(sample.id)}
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};