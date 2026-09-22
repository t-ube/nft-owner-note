"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Edit2, Save, X, ExternalLink, Copy, Check, Info } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { dbManager, Project } from '@/utils/db';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import IssuerSiteIcons from '@/app/components/IssuerSiteIcons';
import CollectionFace from '@/app/components/CollectionFace';

interface ProjectHeaderProps {
  lang: string;
  project: Project;
  onProjectUpdate: (updatedProject: Project) => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({ lang, project, onProjectUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [copied, setCopied] = useState(false);
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
            return;
          }
        }
        setIssuerInfo(null);
      } catch (error) {
        console.error('Failed to load issuer info:', error);
      }
    };
    loadIssuerInfo();
  }, [project.issuer]);

  const handleSave = async () => {
    const name = editedName.trim();
    if (!name || name === project.name) return;
    try {
      const updatedProject: Project = {
        ...project,
        name,
        isAutoCreated: false, // 名前を付けたら通常のプロジェクトとして扱う
        updatedAt: Date.now()
      };

      await dbManager.updateProject(updatedProject);

      onProjectUpdate(updatedProject);
      setIsEditing(false);
      setError(null);
    } catch (err) {
      setError(dict?.project.detail.info.updateError || 'Failed to update project name');
      console.error('Failed to update project:', err);
    }
  };

  const handleStartEdit = () => {
    setEditedName(project.name);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedName(project.name);
    setIsEditing(false);
    setError(null);
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(project.issuer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const xHandle = issuerInfo?.xAccount?.replace('@', '');

  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex items-center gap-3">
        <CollectionFace
          issuer={project.issuer}
          taxon={project.taxon}
          alt={project.name}
          className="h-10 w-10 sm:h-12 sm:w-12 shrink-0"
        />

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
                placeholder={dict?.project.detail.info.enterName}
                autoFocus
                className="flex-1 min-w-0 text-base sm:text-lg font-bold dark:bg-gray-700 dark:text-gray-200"
              />
              {/* 保存・キャンセルは入力欄のすぐ右に並べる */}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!editedName.trim() || editedName.trim() === project.name}
                aria-label={dict?.project.detail.info.save}
                className="shrink-0"
              >
                <Save className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{dict?.project.detail.info.save}</span>
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} className="shrink-0 dark:border-gray-600 dark:text-gray-200" aria-label={dict?.project.detail.info.cancel}>
                <X className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{dict?.project.detail.info.cancel}</span>
              </Button>
            </div>
          ) : (
            <h1 className="text-xl sm:text-2xl font-bold truncate">{project.name}</h1>
          )}

          {/* 発行者名 · Xアカウント · リンク · 詳細 */}
          <div className="flex items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-sm text-gray-500 dark:text-gray-400 min-w-0">
            {issuerInfo?.groupName && (
              <>
                <span className="truncate">{issuerInfo.groupName}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            {xHandle && (
              <>
                <a
                  href={`https://twitter.com/${xHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center shrink-0 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  @{xHandle}
                  <ExternalLink className="h-3 w-3 ml-0.5" />
                </a>
                <span aria-hidden="true">·</span>
              </>
            )}
            <div className="shrink-0">
              <IssuerSiteIcons issuer={project.issuer} taxon={project.taxon} />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 shrink-0 ml-1 px-1.5 py-0.5 rounded hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                  {dict?.project.detail.info.details}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] dark:bg-gray-800 dark:border-gray-700">
                <dl className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <dt className="text-xs text-gray-500 dark:text-gray-400">{dict?.project.detail.info.issuerAddress}</dt>
                    <dd className="flex items-center justify-between gap-2 font-mono text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded-md text-gray-700 dark:text-gray-200">
                      <span className="break-all">{project.issuer}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={handleCopyAddress}
                        aria-label={dict?.project.detail.info.copy}
                      >
                        {copied ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                        )}
                      </Button>
                    </dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">{dict?.project.detail.info.taxon}</dt>
                      <dd className="dark:text-gray-200">{project.taxon}</dd>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">{dict?.project.detail.info.projectId}</dt>
                      <dd className="font-mono text-xs break-all dark:text-gray-200">{project.projectId}</dd>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <div>
                      <dt>{dict?.project.detail.info.created}</dt>
                      <dd className="text-gray-700 dark:text-gray-300">{new Date(project.createdAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>{dict?.project.detail.info.updated}</dt>
                      <dd className="text-gray-700 dark:text-gray-300">{new Date(project.updatedAt).toLocaleString()}</dd>
                    </div>
                  </div>
                </dl>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* URL を開いて自動で作ったプロジェクトは見るだけなので、名前を編集させない */}
        {!isEditing && !project.isAutoCreated && (
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <Button size="sm" variant="outline" onClick={handleStartEdit} className="dark:border-gray-600 dark:text-gray-200">
              <Edit2 className="h-4 w-4 mr-1.5" />
              {dict?.project.detail.info.edit}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ProjectHeader;
