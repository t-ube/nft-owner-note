import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from "next-themes";
import Image from 'next/image';
import { Folder, Search, Trash2, Users, Menu, X, Moon, Sun } from 'lucide-react';
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

const ProjectSidebar = ({
  projects,
  currentProjectId,
  searchTerm,
  onSearchChange,
  onDeleteClick,
  onProjectsUpdated,
  lang,
}: ProjectSidebarProps) => {
  const router = useRouter();
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleProjectClick = (projectId: string) => {
    router.push(`/${lang}/projects/${projectId}`);
    setIsOpen(false);
  };

  const handleOwnerNoteClick = () => {
    router.push(`/${lang}/`);
  };

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.projectId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!dict) return null;
  const { sidebar: t } = dict.project;

  return (
    <>
      {/* ハンバーガーメニューボタン */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 rounded-md bg-white dark:bg-gray-800 shadow-md"
      >
        {isOpen ? (
          <X className="h-6 w-6 dark:text-white" />
        ) : (
          <Menu className="h-6 w-6 dark:text-white" />
        )}
      </button>

      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* サイドバー */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col h-screen
      `}>
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
            onClick={() => {
              router.push(`/${lang}/owners`);
              setIsOpen(false);
            }}
          >
            <Users className="h-4 w-4 mr-2" />
            {t.ownersList}
          </Button>

          <div className="space-y-4">
            <h2 className="text-xl font-bold dark:text-white">{t.projectsTitle}</h2>
            
            <ProjectCSVImportExport onProjectsUpdated={onProjectsUpdated} lang={lang} />
            
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
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

        <div className="p-4 mt-auto border-t dark:border-gray-700 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <select
              onChange={(e) => {
                const currentPath = pathname.split('/').slice(2).join('/');
                router.push(`/${e.target.value}/${currentPath}`);
              }}
              value={pathname.split('/')[1]}
              className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
              className="relative w-10 h-10"
            >
              <Sun className="absolute h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Developed by shirome</span>
            <a
              href="https://x.com/shirome_x"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
    </>
  );
};

export default ProjectSidebar;