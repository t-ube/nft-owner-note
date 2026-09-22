// app/projects/[projectId]/page.tsx
export const runtime = 'edge';

import LegacyProjectRedirect from '@/app/components/LegacyProjectRedirect';

/** 旧 URL。/collections/<issuer>/<taxon> へ転送する。 */
export default function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  return (
    <LegacyProjectRedirect lang='en' projectId={params.projectId} />
  );
}
