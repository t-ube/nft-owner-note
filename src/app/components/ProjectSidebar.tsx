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
    <div className="w-64 bg-white border-r h-screen">
      <div className="p-4">
        <h1 
          className="text-2xl font-bold mb-8 cursor-pointer hover:text-gray-600"
          onClick={handleOwnerNoteClick}
        >
          Owner Note
        </h1>
        <h2 className="text-xl font-bold mb-4">Projects</h2>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search projects"
            className="pl-8"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4">
        {filteredProjects.map(project => (
          <div
            key={project.id}
            className={`flex items-center justify-between px-4 py-2 hover:bg-gray-100 cursor-pointer group
              ${project.projectId === currentProjectId ? 'bg-gray-100' : ''}`}
            onClick={() => handleProjectClick(project.projectId)}
          >
            <div className="flex items-center">
              <Folder className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span className="font-medium">{project.name}</span>
                <span className="text-xs text-gray-500">#{project.projectId}</span>
              </div>
            </div>
            <button
              onClick={(e) => onDeleteClick(e, project)}
              className="hidden group-hover:block text-gray-400 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectSidebar;