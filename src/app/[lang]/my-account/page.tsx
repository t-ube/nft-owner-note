export const runtime = 'edge';

import MyAccountPageWrapper from '@/app/components/MyAccountPageWrapper';

export default function MyAccountPage({ params }: { params: { lang: string } }) {
  return (
    <main>
      <MyAccountPageWrapper lang={params.lang} />
    </main>
  );
}
