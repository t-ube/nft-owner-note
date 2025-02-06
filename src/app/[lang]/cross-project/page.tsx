export const runtime = 'edge';

import CrossProjectOwnerWrapper from '@/app/components/CrossProjectOwnerWrapper';

export default function CrossProjectOwnerPage({ params }: { params: { lang: string } }) {
  return (
    <main>
      <CrossProjectOwnerWrapper lang={params.lang} />
    </main>
  );
}
