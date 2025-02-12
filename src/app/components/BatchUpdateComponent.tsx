// components/BatchUpdateComponent.tsx
import React from 'react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCcw } from 'lucide-react';
import { Project } from '@/utils/db';

export interface UpdateProgress {
  currentProject: string;
  currentProjectIndex: number;
  totalProjects: number;
  projectProgress: number;
  isComplete: boolean;
}

export interface BatchUpdateComponentProps {
  onUpdate: () => Promise<void>;
  isUpdating: boolean;
  progress: UpdateProgress | null;
  dictionary: {
    updating: string;
    projectProgress: string;
    complete: string;
  };
  projects: Project[];
  className?: string;
  buttonIcon?: React.ReactNode;
}

export const BatchUpdateComponent: React.FC<BatchUpdateComponentProps> = ({
  onUpdate,
  isUpdating,
  progress,
  dictionary,
  projects,
  className = "",
  buttonIcon = <RefreshCcw className={isUpdating ? "animate-spin h-4 w-4" : "h-4 w-4"} />
}) => (
  <div className={`space-y-4 ${className}`}>
    <div className="flex items-center justify-between">
      <Button
        size="sm"
        onClick={onUpdate}
        disabled={isUpdating}
        className="flex items-center gap-2"
      >
        {buttonIcon}
        {dictionary.updating}
      </Button>
    </div>

    {isUpdating && progress && (
      <Alert>
        <AlertDescription>
          <div className="space-y-2">
            <div>
              {dictionary.projectProgress
                .replace('{current}', String(projects.findIndex(p => p.projectId === progress.currentProject) + 1))
                .replace('{total}', String(progress.totalProjects))
                .replace('{project}', projects.find(p => p.projectId === progress.currentProject)?.name || '')}
            </div>
            <Progress value={progress.projectProgress} />
          </div>
        </AlertDescription>
      </Alert>
    )}
  </div>
);

export default BatchUpdateComponent;