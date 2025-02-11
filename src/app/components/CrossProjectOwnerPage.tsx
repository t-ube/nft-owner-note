"use client"

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Project } from '@/utils/db';
import CrossProjectOwnerList from '@/app/components/CrossProjectOwnerList';
import { Input } from '@/components/ui/input';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface CrossProjectOwnerPageProps {
  lang: string;
  projects: Project[];
  onProjectsUpdated: () => Promise<void>;
}

const STORAGE_KEY = 'CrossProjectOwnerPage.SelectedProjectIds';

const CrossProjectOwnerPage: React.FC<CrossProjectOwnerPageProps> = ({ 
  lang, 
  projects: initialProjects,
  onProjectsUpdated 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [, setUpdateTrigger] = useState(0);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialProjects.length === 0) {
      return;
    }
    if (initialized) {
      setSelectedProjects(prev => 
        prev.map(selected => {
          const updated = initialProjects.find(p => p.projectId === selected.projectId);
          return updated || selected;
        }).filter(selected => 
          initialProjects.some(p => p.projectId === selected.projectId)
        )
      );
      return;
    }
    try {
      const savedProjectIds = localStorage.getItem(STORAGE_KEY);
      if (savedProjectIds) {
        const projectIds = JSON.parse(savedProjectIds) as string[];
        const validProjects = initialProjects.filter(project => 
          projectIds.includes(project.projectId)
        );
        setSelectedProjects(validProjects);
      }
    } catch (error) {
      console.error('Failed to load selected projects from localStorage:', error);
    }
    setInitialized(true);
  }, [initialProjects, initialized]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    try {
      const projectIds = selectedProjects.map(p => p.projectId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projectIds));
    } catch (error) {
      console.error('Failed to save selected projects to localStorage:', error);
    }
  }, [selectedProjects, initialized]);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleProjectsUpdated = useCallback(async () => {
    await onProjectsUpdated();
    setUpdateTrigger(prev => prev + 1);
  }, [onProjectsUpdated]);

  const toggleProject = (projectId: string) => {
    const project = initialProjects.find(p => p.projectId === projectId);
    if (!project) return;

    setSelectedProjects(current =>
      current.find(p => p.projectId === projectId)
        ? current.filter(p => p.projectId !== projectId)
        : [...current, project]
    );
  };

  const filteredProjects = initialProjects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!dict) return null;
  const t = dict.project.aggregatedOwnerList;

  return (
    <div className="p-2 sm:p-4 lg:p-6">
      <div className="space-y-4 sm:space-y-6">
          <h1 className="text-xl sm:text-2xl font-bold px-1">{t.title}</h1>
          
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-[300px] space-y-2">
          
              <Input
                placeholder={t.placeholders.searchProjects}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Select onValueChange={toggleProject}>
                <SelectTrigger>
                  <SelectValue placeholder={t.placeholders.selectProject} />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((project) => (
                    <SelectItem
                      key={project.projectId}
                      value={project.projectId}
                    >
                      <div className="flex items-center">
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedProjects.find(p => p.projectId === project.projectId)
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedProjects.map(project => (
                <Badge
                  key={project.projectId}
                  variant="secondary"
                  className="flex items-center gap-2"
                >
                  {project.name}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => toggleProject(project.projectId)}
                  >
                    ×
                  </Button>
                </Badge>
              ))}
            </div>
          </div>

          {selectedProjects.length > 0 ? (
            <CrossProjectOwnerList
              selectedProjects={selectedProjects}
              lang={lang}
              onProjectsUpdated={handleProjectsUpdated}
            />
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {t.placeholders.selectProjectToAnalyze}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrossProjectOwnerPage;