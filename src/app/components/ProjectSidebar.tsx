import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from "next-themes";
import Image from 'next/image';
import { 
  Folder, 
  Search, 
  Trash2, 
  Users, 
  Menu, 
  X, 
  Moon, 
  Sun, 
  BarChart3, 
  ChevronDown, 
  Pencil 
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Project, dbManager } from '@/utils/db';
import ProjectCSVImportExport from '@/app/components/ProjectCSVImportExport';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { CONTRIBUTORS } from '@/constants/contributors';

interface ProjectSidebarProps {
  projects: Project[];
  currentProjectId?: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDeleteClick: (e: React.MouseEvent, project: Project) => void;
  onProjectsUpdated: () => void;
  onProjectUpdate: (project: Project) => Promise<void>;
  lang: string;
}

interface EditingProject {
  id: string;
  name: string;
}

const ProjectSidebar = ({
  projects,
  currentProjectId,
  searchTerm,
  onSearchChange,
  onDeleteClick,
  onProjectsUpdated,
  onProjectUpdate,
  lang,
}: ProjectSidebarProps) => {
  const router = useRouter();
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<EditingProject | null>(null);
  const [error, setError] = useState<string | null>(null);
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
            <Button
              variant="outline"
              className="w-full justify-start dark:border-gray-600 dark:text-gray-200"
              onClick={() => {
                router.push(`/${lang}/cross-project`);
                setIsOpen(false);
              }}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              {t.crossProjectAnalysis}
            </Button>

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
                  <div className="flex items-center min-w-0 flex-1">
                    <Folder className="h-4 w-4 mr-2 flex-shrink-0" />
                    <div className="flex flex-col min-w-0 flex-1">
                      {editingProject?.id === project.id ? (
                        <form 
                          onSubmit={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!editingProject.name.trim()) {
                              setError('Project name cannot be empty');
                              return;
                            }
                            try {
                              const db = await dbManager.initDB();
                              const transaction = db.transaction('projects', 'readwrite');
                              const store = transaction.objectStore('projects');
                              const updatedProject = { 
                                ...project, 
                                name: editingProject.name.trim(), 
                                updatedAt: Date.now() 
                              };
                              await store.put(updatedProject);
                              onProjectsUpdated();
                              
                              // プロジェクト詳細画面を更新するために再度読み込みを実行
                              if (project.projectId === currentProjectId) {
                                router.refresh();
                              }
                              
                              await onProjectUpdate(updatedProject);
                              setEditingProject(null);
                              setError(null);
                            } catch (err) {
                              setError('Failed to update project name');
                              console.error('Error updating project:', err);
                            }
                          }}
                          className="flex-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingProject.name}
                              onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                              className="w-full px-2 py-1 bg-white dark:bg-gray-700 border rounded
                                focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingProject(null);
                                  setError(null);
                                }
                              }}
                            />
                            <button
                              type="submit"
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-green-600 dark:text-green-400"
                              title={dict?.project.sidebar.save || 'Save'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProject(null);
                                setError(null);
                              }}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-red-600 dark:text-red-400"
                              title={dict?.project.sidebar.cancel || 'Cancel'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>
                          {error && (
                            <div className="text-xs text-red-500 mt-1">{error}</div>
                          )}
                        </form>
                      ) : (
                        <span className="font-medium truncate">
                          {project.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProject({ id: project.id, name: project.name });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1
                        hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      title={dict?.project.sidebar.edit || 'Edit'}
                    >
                      <Pencil className="h-4 w-4 text-gray-400 hover:text-blue-500 transition-colors" />
                    </button>
                    <button
                      onClick={(e) => onDeleteClick(e, project)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1
                        hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      title={dict?.project.sidebar.delete || 'Delete'}
                    >
                      <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500 transition-colors" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 pb-0 mt-auto border-t dark:border-gray-700">
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
          
          <div className="relative">
            <div className="flex items-center justify-between pt-2 pb-1">
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

            <div>
              <button
                onClick={() => setIsCreditsOpen(!isCreditsOpen)}
                className={`
                  px-2 py-1 text-xs font-medium
                  bg-gray-100 dark:bg-gray-700 
                  text-gray-600 dark:text-gray-300
                  rounded-t-lg shadow-sm
                  transition-all
                  hover:bg-gray-200 dark:hover:bg-gray-600
                  ${isCreditsOpen ? 'bg-gray-200 dark:bg-gray-600' : ''}
                  inline-flex items-center gap-1
                `}
              >
                XRPL Community Contributors
                <ChevronDown 
                  className={`h-3 w-3 transition-transform duration-200 ${
                    isCreditsOpen ? 'transform rotate-180' : ''
                  }`}
                />
              </button>
            </div>
            
            <div className={`
              overflow-hidden transition-all duration-500 ease-in-out
              ${isCreditsOpen ? 'max-h-32 mt-2 opacity-100' : 'max-h-0 opacity-0 mb-0'}
            `}>
              <div className="pb-5 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex flex-wrap gap-1">
                  {CONTRIBUTORS.map((contributor, index) => (
                    <span key={index} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                      {contributor}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default ProjectSidebar;