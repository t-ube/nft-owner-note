// app/[lang]/collections/[issuer]/[taxon]/page.tsx
export const runtime = 'edge';

import ProjectDetailWrapper from '@/app/components/ProjectDetailWrapper';

export default function CollectionDetailPage({ params }: { params: { issuer: string, taxon: string, lang: string } }) {
  return (
    <ProjectDetailWrapper
      issuer={decodeURIComponent(params.issuer)}
      taxon={decodeURIComponent(params.taxon)}
      lang={params.lang}
    />
  );
}
