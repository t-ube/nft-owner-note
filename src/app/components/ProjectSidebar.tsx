import React from 'react';
import { useRouter } from 'next/navigation';
import { Folder, Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Project } from '@/utils/db';

interface ProjectSidebarProps {
  projects: Project[];
  currentProjectId?: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDeleteClick: (e: React.MouseEvent, project: Project) => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  currentProjectId,
  searchTerm,
  onSearchChange,
  onDeleteClick,
}) => {
  const router = useRouter();

  const handleProjectClick = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const handleOwnerNoteClick = () => {
    router.push('/');
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.projectId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside className="w-64 bg-white border-r flex-shrink-0 overflow-hidden flex flex-col h-screen">
      <div className="p-4 flex-shrink-0">
        <h1 
          className="text-2xl font-bold mb-8 cursor-pointer hover:text-gray-600 transition-colors"
          onClick={handleOwnerNoteClick}
        >
          Owner Note
        </h1>
        <h2 className="text-xl font-bold mb-4">Projects</h2>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 pointer-events-none" />
          <Input
            placeholder="Search projects"
            className="pl-8 w-full"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredProjects.length === 0 ? (
          <div className="px-4 py-2 text-gray-500 text-sm">
            No projects found
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredProjects.map(project => (
              <div
                key={project.id}
                className={`
                  flex items-center justify-between px-4 py-2 cursor-pointer
                  transition-colors duration-200 relative group  // groupを追加
                  ${project.projectId === currentProjectId ? 'bg-gray-100' : 'hover:bg-gray-50'}
                `}
                onClick={() => handleProjectClick(project.projectId)}
              >
                <div className="flex items-center min-w-0">
                  <Folder className="h-4 w-4 mr-2 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{project.name}</span>
                    <span className="text-xs text-gray-500">#{project.projectId}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => onDeleteClick(e, project)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2 p-1
                    hover:bg-gray-200 rounded"
                >
                  <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500 transition-colors" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default ProjectSidebar;