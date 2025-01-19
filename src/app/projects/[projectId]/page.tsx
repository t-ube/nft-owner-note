// app/projects/[projectId]/page.tsx
import ProjectDetailWrapper from '@/app/components/ProjectDetailWrapper';

export const runtime = 'edge';

export default function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  return <ProjectDetailWrapper projectId={params.projectId} />;
}