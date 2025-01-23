export const runtime = 'edge';

import OwnerListWrapper from '@/app/components/OwnerListWrapper';

export default function OwnerListPage({ params }: { params: { lang: string } }) {
  return (
    <main>
      <OwnerListWrapper lang={params.lang} />
    </main>
  );
}
