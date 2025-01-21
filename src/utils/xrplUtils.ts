// xrplUtils.ts

import { Client } from 'xrpl';

const XRPL_WEBSOCKET_URL = 'wss://s1.ripple.com';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export async function executeXrplRequest<T>(
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

// NFTの取得用ユーティリティ
export async function fetchNFTsByIssuer(
  issuer: string,
  taxon: string,
  marker?: unknown,
  limit = 50
) {
  return executeXrplRequest(async (client) => {
    const response = await client.request({
      command: 'nfts_by_issuer',
      issuer,
      limit,
      marker,
      nft_taxon: parseInt(taxon, 10)
    });
    return response.result;
  });
}

// NFT履歴取得用ユーティリティ
export async function fetchNFTHistory(nft: { nft_id: string }) {
  return executeXrplRequest(async (client) => {
    const response = await client.request({
      command: 'nft_history',
      nft_id: nft.nft_id,
      limit: 100
    });
    return response.result;
  });
}

// バッチ処理用ユーティリティ
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const batches = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(item => processFn(item))
    );
    results.push(...batchResults);
    
    // バッチ間で少し待機
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}
