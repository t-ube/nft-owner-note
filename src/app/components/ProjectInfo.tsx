"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Edit2, Save, X, ChevronDown } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { dbManager, Project } from '@/utils/db';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface ProjectInfoProps {
  lang: string;
  project: Project;
  onProjectUpdate: (updatedProject: Project) => void;
}

const ProjectInfo: React.FC<ProjectInfoProps> = ({ lang, project, onProjectUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dict, setDict] = useState<Dictionary | null>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleSave = async () => {
    try {
      const updatedProject: Project = {
        ...project,
        name: editedName.trim(),
        updatedAt: Date.now()
      };

      const transaction = await (await dbManager.initDB())
        .transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      await store.put(updatedProject);

      onProjectUpdate(updatedProject);
      setIsEditing(false);
      setError(null);
    } catch (err) {
      setError('Failed to update project name');
      console.error('Failed to update project:', err);
    }
  };

  const handleCancel = () => {
    setEditedName(project.name);
    setIsEditing(false);
    setError(null);
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mb-6"
    >
      <Card>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 hover:bg-gray-100"
          >
            <span className="font-semibold">{dict?.project.detail.info.title}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                isOpen ? 'transform rotate-180' : ''
              }`}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium">{dict?.project.detail.info.name}</label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="Enter project name"
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!editedName.trim() || editedName.trim() === project.name}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {dict?.project.detail.info.save}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancel}>
                        <X className="h-4 w-4 mr-2" />
                        {dict?.project.detail.info.cancel}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1">{project.name}</span>
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        {dict?.project.detail.info.edit}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{dict?.project.detail.info.issuerAddress}</label>
                  <div className="p-2 bg-gray-50 rounded-md break-all">
                    {project.issuer}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{dict?.project.detail.info.taxon}</label>
                  <div className="p-2 bg-gray-50 rounded-md">
                    {project.taxon}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{dict?.project.detail.info.projectId}</label>
                <div className="p-2 bg-gray-50 rounded-md">
                  {project.projectId}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-500">
                <div>
                  {dict?.project.detail.info.created}: {new Date(project.createdAt).toLocaleString()}
                </div>
                <div>
                  {dict?.project.detail.info.updated}: {new Date(project.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default ProjectInfo;