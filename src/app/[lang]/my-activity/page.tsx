export const runtime = 'edge';

import MyAccountPageWrapper from '@/app/components/MyAccountPageWrapper';
import MyActivityPage from '@/app/components/MyActivityPage';

export default function MyActivityRoute({ params }: { params: { lang: string } }) {
  return (
    <main>
      <MyAccountPageWrapper lang={params.lang}>
        <MyActivityPage lang={params.lang} />
      </MyAccountPageWrapper>
    </main>
  );
}
