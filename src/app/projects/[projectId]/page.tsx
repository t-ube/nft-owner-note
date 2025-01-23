// app/projects/[projectId]/page.tsx
export const runtime = 'edge';

import ProjectDetailWrapper from '@/app/components/ProjectDetailWrapper';

export default function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  return (
    <ProjectDetailWrapper lang='en' projectId={params.projectId} />
  );
}
