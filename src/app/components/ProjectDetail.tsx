"use client";

// ProjectDetail.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Project } from '@/utils/db';
import { PROJECT_TABS, ProjectTab, parseProjectTab } from '@/utils/routes';
import ProjectHeader from '@/app/components/ProjectHeader';
import { useNFTContext } from '@/app/contexts/NFTContext';
import { 
  Users,
  List,
  LayoutGrid,
  Activity,
  Sprout,
  Waypoints
} from 'lucide-react';
import NFTList from '@/app/components/NFTList';
import OwnerList from '@/app/components/OwnerList';
import OwnerNFTGroupList from '@/app/components/OwnerNFTGroupList';
import OwnerActivityList from '@/app/components/OwnerActivityList';
import OwnerPlantNetwork from '@/app/components/OwnerPlantNetwork';
import CommunityInflowNetwork from '@/app/components/CommunityInflowNetwork';
import { NFTContextProvider } from '@/app/contexts/NFTContext';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface ProjectDetailProps {
  projectId: string;
  project: Project;
  lang: string;
  onProjectUpdate: (project: Project) => Promise<void>;
  onProjectsUpdated: () => Promise<void>;
}

// NFTListから自動ロード機能を移動。
// ProjectDetail の中で定義すると、描画のたびに別のコンポーネントになって中身が作り直されるので外に置く
const NFTWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hasMore, isLoading, loadMore } = useNFTContext();

  useEffect(() => {
    const autoLoad = async () => {
      if (hasMore && !isLoading) {
        await loadMore();
      }
    };
    autoLoad();
  }, [hasMore, isLoading, loadMore]);

  return <>{children}</>;
};

const ProjectDetail: React.FC<ProjectDetailProps> = ({ projectId, project: projectProp, lang, onProjectsUpdated }) => {
  // 読み込みは親（ProjectDetailWrapper）が行う。親で更新されたら追従する
  const [project, setProject] = useState<Project>(projectProp);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<ProjectTab>(() => parseProjectTab(tabParam));

  useEffect(() => {
    setProject(projectProp);
  }, [projectProp]);

  // 戻る・進むなどで URL が変わったら追従する
  useEffect(() => {
    setTab(parseProjectTab(tabParam));
  }, [tabParam]);

  // タブを切り替えたら URL も書き換える（サーバーへの再取得を起こさないよう history を直接使う。履歴は増やさない）
  const handleTabChange = (value: string) => {
    const next = parseProjectTab(value);
    setTab(next);
    // ?dev など、tab 以外のクエリは残す
    const params = new URLSearchParams(window.location.search);
    if (next === PROJECT_TABS[0]) params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject);
    onProjectsUpdated();
  };


  return (
    <NFTContextProvider 
      projectId={projectId}
      issuer={project.issuer}
      taxon={project.taxon}
    >
      <NFTWrapper>
        <div className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          {/* 上の余白はサイドバーのタイトル（p-4）に合わせる */}
          <div className="p-3 pt-4 sm:p-6 sm:pt-4">
            <ProjectHeader lang={lang} project={project} onProjectUpdate={handleProjectUpdate} />

            <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-2 sm:inline-flex sm:h-9 sm:w-auto">
                <TabsTrigger value="owners">
                  <Users className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerRank}
                </TabsTrigger>
                <TabsTrigger value="holdings">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerCollection.title}
                </TabsTrigger>
                <TabsTrigger value="ecosystem">
                  <Sprout className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerPlant.title}
                </TabsTrigger>
                <TabsTrigger value="community">
                  <Waypoints className="h-4 w-4 mr-2" />
                  {dict?.project.detail.community.title}
                </TabsTrigger>
                <TabsTrigger value="activity">
                  <Activity className="h-4 w-4 mr-2" />
                  {dict?.project.detail.ownerActivity.title}
                </TabsTrigger>
                <TabsTrigger value="nfts">
                  <List className="h-4 w-4 mr-2" />
                  {dict?.project.detail.nftList}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="owners" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerList 
                      lang={lang}
                      issuer={project.issuer} 
                      taxon={project.taxon}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="holdings" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerNFTGroupList lang={lang} projectId={projectId} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ecosystem" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerPlantNetwork
                      lang={lang}
                      issuer={project.issuer}
                      taxon={project.taxon}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="community" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <CommunityInflowNetwork lang={lang} issuer={project.issuer} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <OwnerActivityList
                      lang={lang}
                      issuer={project.issuer}
                      taxon={project.taxon}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="nfts" className="space-y-4">
                <Card className="mx-[-0.75rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                  <CardContent className="px-2 pt-3 sm:px-6 sm:pt-6">
                    <NFTList lang={lang} projectId={projectId}/>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </NFTWrapper>
    </NFTContextProvider>
  );
};

export default ProjectDetail;