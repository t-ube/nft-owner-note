// BatchNFTUpdater.tsx
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCcw } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Client } from 'xrpl';
import { NFToken, dbManager } from '@/utils/db';

const XRPL_WEBSOCKET_URL = 'wss://s1.ripple.com';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BATCH_SIZE = 100;

async function executeXrplRequest<T>(
  requestFn: (client: Client) => Promise<T>,
  retryCount = 0
): Promise<T> {
  const client = new Client(XRPL_WEBSOCKET_URL);

  try {
    await client.connect();
    const result = await requestFn(client);
    return result;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return executeXrplRequest(requestFn, retryCount + 1);
    }
    throw error;
  } finally {
    try {
      await client.disconnect();
    } catch (err) {
      console.error('Error disconnecting from XRPL:', err);
    }
  }
}

export interface BatchNFTUpdateProgress {
  currentProject: string;
  currentProjectIndex: number;
  totalProjects: number;
  projectProgress: number;
  isComplete: boolean;
}

export async function fetchProjectNFTs(
  projectId: string,
  issuer: string,
  taxon: string,
  onProgressUpdate?: (progress: BatchNFTUpdateProgress) => void,
  totalProjects: number = 1,
  currentProjectIndex: number = 0  // 追加
): Promise<NFToken[]> {
  let marker: unknown | undefined;
  let hasMore = true;
  let allNFTs: NFToken[] = [];

  // 進捗更新関数
  const updateProgress = (isComplete: boolean = false) => {
    if (onProgressUpdate) {
      const progress: BatchNFTUpdateProgress = {
        currentProject: projectId,
        currentProjectIndex,
        totalProjects,
        // プロジェクトベースの進捗計算
        projectProgress: ((currentProjectIndex + 1) / totalProjects) * 100,
        isComplete
      };
      onProgressUpdate(progress);
    }
  };

  try {
    while (hasMore) {
      const response = await executeXrplRequest(async (client) => {
        return await client.request({
          command: 'nfts_by_issuer',
          issuer: issuer,
          limit: BATCH_SIZE,
          marker,
          nft_taxon: parseInt(taxon, 10)
        });
      });

      const transformedNFTs = response.result.nfts.map(nft => ({
        id: `${projectId}-${nft.nft_id}`,
        projectId,
        nft_id: nft.nft_id,
        nft_serial: nft.nft_serial,
        nft_taxon: nft.nft_taxon,
        uri: nft.uri ? Buffer.from(nft.uri, 'hex').toString('utf8') : '',
        issuer: nft.issuer,
        owner: nft.owner,
        flags: nft.flags,
        transfer_fee: nft.transfer_fee,
        is_burned: nft.is_burned,
        ledger_index: nft.ledger_index,
        updatedAt: Date.now(),
      }));

      allNFTs = [...allNFTs, ...transformedNFTs];
      marker = response.result.marker;
      hasMore = !!marker && transformedNFTs.length === BATCH_SIZE;

      // 各バッチ取得後に進捗を更新
      updateProgress(false);
    }

    // 既存のNFTデータを取得
    const existingNFTs = await dbManager.getNFTsByProjectId(projectId);
    const mergedNFTs = allNFTs.map(newNFT => {
      const existing = existingNFTs.find(e => e.nft_id === newNFT.nft_id);
      return {
        ...newNFT,
        name: existing?.name ?? null,
        lastSaleAmount: existing?.lastSaleAmount ?? null,
        lastSaleAt: existing?.lastSaleAt ?? null,
        firstSaleAmount: existing?.firstSaleAmount ?? null,
        firstSaleAt: existing?.firstSaleAt ?? null,
        mintedAt: existing?.mintedAt ?? null,
        isOrderMade: existing?.isOrderMade ?? false,
        userValue1: existing?.userValue1 ?? null,
        userValue2: existing?.userValue2 ?? null,
        color: existing?.color ?? null,
        memo: existing?.memo ?? null,
      };
    });

    // DBを更新
    await dbManager.updateNFTs(projectId, mergedNFTs);
    
    // 完了時に最終進捗を更新
    updateProgress(true);
    
    return mergedNFTs;
  } catch (error) {
    console.error(`Error fetching NFTs for project ${projectId}:`, error);
    throw error;
  }
}

interface BatchNFTUpdaterProps {
  projects: Array<{ projectId: string; issuer: string; taxon: string; name: string }>;
  onComplete?: () => void;
  dictionary: {
    updating: string;
    projectProgress: string;
    complete: string;
  };
}

export const BatchNFTUpdater: React.FC<BatchNFTUpdaterProps> = ({
  projects,
  onComplete,
  dictionary
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState<BatchNFTUpdateProgress | null>(null);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateMultipleProjects(projects, (progress) => {
        setProgress(progress);
      });
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error updating NFTs:', error);
    } finally {
      setIsUpdating(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          onClick={handleUpdate}
          disabled={isUpdating}
          className="flex items-center gap-2"
        >
          <RefreshCcw className={isUpdating ? "animate-spin h-4 w-4" : "h-4 w-4"} />
          {dictionary.updating}
        </Button>
      </div>

      {isUpdating && progress && (
        <Alert>
          <AlertDescription>
            <div className="space-y-2">
              <div>
                {dictionary.projectProgress
                  .replace('{current}', String(projects.findIndex(p => p.projectId === progress.currentProject) + 1))
                  .replace('{total}', String(progress.totalProjects))
                  .replace('{project}', projects.find(p => p.projectId === progress.currentProject)?.name || '')}
              </div>
              <Progress value={progress.projectProgress} />
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

async function updateMultipleProjects(
  projects: Array<{ projectId: string; issuer: string; taxon: string }>,
  onProgressUpdate?: (progress: BatchNFTUpdateProgress) => void
): Promise<void> {
  for (let i = 0; i < projects.length; i++) {
    const { projectId, issuer, taxon } = projects[i];
    await fetchProjectNFTs(
      projectId,
      issuer,
      taxon,
      onProgressUpdate,
      projects.length,
      i
    );
  }
}