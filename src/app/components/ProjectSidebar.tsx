import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Folder, Search, Trash2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Project } from '@/utils/db';
import ProjectCSVImportExport from '@/app/components/ProjectCSVImportExport';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface ProjectSidebarProps {
  projects: Project[];
  currentProjectId?: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDeleteClick: (e: React.MouseEvent, project: Project) => void;
  onProjectsUpdated: () => void;
  lang: string;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  currentProjectId,
  searchTerm,
  onSearchChange,
  onDeleteClick,
  onProjectsUpdated,
  lang,
}) => {
  const router = useRouter();
  const [dict, setDict] = useState<Dictionary | null>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleProjectClick = (projectId: string) => {
    router.push(`/${lang}/projects/${projectId}`);
  };

  const handleOwnerNoteClick = () => {
    router.push(`/${lang}/`);
  };

  const handleOwnersClick = () => {
    router.push(`/${lang}/owners`);
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.projectId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!dict) return null;

  const { sidebar: t } = dict.project;

  // ProjectSidebar.tsx の return 部分を更新
  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex-shrink-0 overflow-hidden flex flex-col h-screen">
      <div className="p-4 flex-shrink-0">
        <h1 
          className="text-2xl font-bold mb-8 cursor-pointer hover:text-gray-600 dark:text-white dark:hover:text-gray-300 transition-colors"
          onClick={handleOwnerNoteClick}
        >
          {t.title}
        </h1>

        <Button
          variant="outline"
          className="w-full mb-4 justify-start dark:border-gray-600 dark:text-gray-200"
          onClick={handleOwnersClick}
        >
          <Users className="h-4 w-4 mr-2" />
          {t.ownersList}
        </Button>

        <div className="space-y-4">
          <h2 className="text-xl font-bold dark:text-white">{t.projectsTitle}</h2>
          
          <ProjectCSVImportExport onProjectsUpdated={onProjectsUpdated} lang={lang}/>
          
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
            <Input
              placeholder={t.search.placeholder}
              className="pl-8 w-full dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredProjects.length === 0 ? (
          <div className="px-4 py-2 text-gray-500 dark:text-gray-400 text-sm">
            {t.noProjects}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredProjects.map(project => (
              <div
                key={project.id}
                className={`
                  flex items-center justify-between px-4 py-2 cursor-pointer
                  transition-colors duration-200 relative group
                  ${project.projectId === currentProjectId 
                    ? 'bg-gray-100 dark:bg-gray-700' 
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'}
                  dark:text-gray-200
                `}
                onClick={() => handleProjectClick(project.projectId)}
              >
                <div className="flex items-center min-w-0">
                  <Folder className="h-4 w-4 mr-2 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{project.name}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => onDeleteClick(e, project)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2 p-1
                    hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500 transition-colors" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="p-2 mt-auto border-t dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">Developed by shirome</span>
          <a
            href="https://x.com/shirome_x"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Follow on X"
          >
            <Image 
              src="/images/x-logo-black.png" 
              alt="X (Twitter)" 
              width={20}
              height={20}
              className="opacity-75 hover:opacity-100 transition-opacity dark:invert" 
            />
          </a>
        </div>
      </div>
    </aside>
  );
};

export default ProjectSidebar;