"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Edit2, Save, X, ChevronDown, ExternalLink, Copy, Check } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { dbManager, Project } from '@/utils/db';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import IssuerSiteIcons from '@/app/components/IssuerSiteIcons';

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
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [issuerInfo, setIssuerInfo] = useState<{ groupName: string | null; xAccount: string | null } | null>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  useEffect(() => {
    const loadIssuerInfo = async () => {
      try {
        const addressInfo = await dbManager.getAddressInfo(project.issuer);
        if (addressInfo?.groupId) {
          const group = await dbManager.getAddressGroup(addressInfo.groupId);
          if (group) {
            setIssuerInfo({
              groupName: group.name,
              xAccount: group.xAccount
            });
          }
        }
      } catch (error) {
        console.error('Failed to load issuer info:', error);
      }
    };
    loadIssuerInfo();
  }, [project.issuer]);

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

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
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
      <Card className="dark:border-gray-700">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-200"
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
                <label className="text-sm font-medium dark:text-gray-200">{dict?.project.detail.info.name}</label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="Enter project name"
                        className="flex-1 dark:bg-gray-700 dark:text-gray-200"
                      />
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!editedName.trim() || editedName.trim() === project.name}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {dict?.project.detail.info.save}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancel} className="dark:border-gray-600 dark:text-gray-200">
                        <X className="h-4 w-4 mr-2" />
                        {dict?.project.detail.info.cancel}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 dark:text-gray-200">{project.name}</span>
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="dark:border-gray-600 dark:text-gray-200">
                        <Edit2 className="h-4 w-4 mr-2" />
                        {dict?.project.detail.info.edit}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* 発行者名とXアカウント */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {issuerInfo?.groupName && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium dark:text-gray-200">{dict?.project.detail.info.issuerName}</label>
                    <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
                      <span className="text-base dark:text-gray-200">{issuerInfo.groupName}</span>
                    </div>
                  </div>
                )}
                {issuerInfo?.xAccount && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium dark:text-gray-200">{dict?.project.detail.info.xAccount}</label>
                    <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
                      <a
                        href={`https://twitter.com/${issuerInfo.xAccount.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        {issuerInfo.xAccount}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* 発行者アドレスとタクソン */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium dark:text-gray-200">{dict?.project.detail.info.issuerAddress}</label>
                  <div className="font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded-md text-sm text-gray-600 dark:text-gray-300 flex items-center justify-between gap-2">
                    <span className="break-all">{project.issuer}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => handleCopyAddress(project.issuer)}
                    >
                      {copiedAddress === project.issuer ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium dark:text-gray-200">{dict?.project.detail.info.taxon}</label>
                  <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md dark:text-gray-200">
                    {project.taxon}
                  </div>
                </div>
              </div>

              {/* 外部サイトリンク - 新しく追加 */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium dark:text-gray-200">{dict?.project.detail.info.links}</label>
                <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
                  <IssuerSiteIcons issuer={project.issuer} taxon={project.taxon} />
                </div>
              </div>

              {/* プロジェクトID */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium dark:text-gray-200">{dict?.project.detail.info.projectId}</label>
                <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md dark:text-gray-200">
                  {project.projectId}
                </div>
              </div>
  
              <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-500 dark:text-gray-400">
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