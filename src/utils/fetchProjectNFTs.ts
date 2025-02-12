// utils/fetchProjectNFTs.ts
import { Client } from 'xrpl';
import { NFToken, dbManager } from '@/utils/db';

const XRPL_WEBSOCKET_URL = 'wss://s1.ripple.com';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BATCH_SIZE = 100;

interface NFTFetchProgress {
  projectProgress: number;
}

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

export async function fetchProjectNFTs(
  projectId: string,
  issuer: string,
  taxon: string,
  onProgressUpdate?: (progress: NFTFetchProgress) => void,
  totalProjects: number = 1,
  currentProjectIndex: number = 0
): Promise<NFToken[]> {
  let marker: unknown | undefined;
  let hasMore = true;
  let allNFTs: NFToken[] = [];
  let totalNFTsProcessed = 0;
  let lastBatchSize = BATCH_SIZE;

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
      lastBatchSize = transformedNFTs.length;
      hasMore = !!marker && lastBatchSize === BATCH_SIZE;

      totalNFTsProcessed += transformedNFTs.length;
      if (onProgressUpdate) {
        const baseProgress = (currentProjectIndex / totalProjects) * 100;
        const batchProgress = hasMore 
          ? (totalNFTsProcessed / (totalNFTsProcessed + BATCH_SIZE)) * (100 / totalProjects)
          : 100 / totalProjects;
        
        onProgressUpdate({
          projectProgress: baseProgress + batchProgress
        });
      }
    }

    // 既存のNFTデータを取得して結合
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
    
    return mergedNFTs;
  } catch (error) {
    console.error(`Error fetching NFTs for project ${projectId}:`, error);
    throw error;
  }
}