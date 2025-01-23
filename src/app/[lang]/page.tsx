//import NFTDashboard from '@/app/components/nft-dashboard';
import ProjectPage from '@/app/components/ProjectPage';

export default function Home({ params }: { params: { lang: string } }) {
  return (
    <main>
      <ProjectPage lang={params.lang} />
    </main>
  );
}
