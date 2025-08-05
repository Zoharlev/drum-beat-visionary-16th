import { DrumMachine } from "@/components/DrumMachine";
import { PracticeMode } from "@/components/PracticeMode";
import { ModelComparison } from "@/components/ModelComparison";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  return (
    <div className="container mx-auto p-4">
      <Tabs defaultValue="drum-machine" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="drum-machine">Drum Machine</TabsTrigger>
          <TabsTrigger value="practice">Practice Mode</TabsTrigger>
          <TabsTrigger value="models">AI Models</TabsTrigger>
        </TabsList>
        
        <TabsContent value="drum-machine">
          <DrumMachine />
        </TabsContent>
        
        <TabsContent value="practice">
          <PracticeMode />
        </TabsContent>
        
        <TabsContent value="models">
          <ModelComparison />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
