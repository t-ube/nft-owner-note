// utils/nftMetadata.ts

import { NFToken } from './db';

interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

// 複数のIPFSゲートウェイを用意
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

const TIMEOUT_DURATION = 20000; // 20 seconds

export async function fetchNFTMetadata(uri: string): Promise<NFTMetadata | null> {
  try {
    // タイムアウト用のコントローラーを作成
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_DURATION);

    // URIがIPFSの場合の処理
    if (uri.startsWith('ipfs://')) {
      const hash = uri.replace('ipfs://', '');
      
      // 複数のゲートウェイを並列に試す
      const fetchPromises = IPFS_GATEWAYS.map(async (gateway) => {
        try {
          const response = await fetch(gateway + hash, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            },
            mode: 'cors',
            signal: controller.signal
          });
          
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          console.warn(`Failed to fetch from ${gateway}:`, error);
          return null;
        }
      });

      // 最初に成功したレスポンスを返す
      const result = await Promise.race(
        fetchPromises.map(p => p.catch(() => null))
      );

      clearTimeout(timeoutId);
      return result;
    }
    
    // HTTP/HTTPSの場合の処理
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      const response = await fetch(uri, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return await response.json();
    }

    // Base64でエンコードされたJSONの場合の処理
    if (uri.startsWith('data:application/json;base64,')) {
      const base64Data = uri.replace('data:application/json;base64,', '');
      const jsonString = atob(base64Data);
      clearTimeout(timeoutId);
      return JSON.parse(jsonString);
    }

    return null;
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    return null;
  }
}

export async function updateNFTNames(nfts: NFToken[]): Promise<NFToken[]> {
  const updatedNFTs: NFToken[] = [];

  for (const nft of nfts) {
    try {
      // nameが既に設定されている場合はスキップ
      if (nft.name !== null) {
        updatedNFTs.push(nft);
        continue;
      }

      // URIが空の場合はスキップ
      if (!nft.uri) {
        updatedNFTs.push(nft);
        continue;
      }

      const metadata = await fetchNFTMetadata(nft.uri);
      if (metadata?.name) {
        updatedNFTs.push({
          ...nft,
          name: metadata.name
        });
      } else {
        // メタデータの取得に失敗した場合は、nameをnullに設定
        updatedNFTs.push({
          ...nft,
          name: null
        });
      }
    } catch (error) {
      console.error(`Error updating NFT name for ${nft.nft_id}:`, error);
      updatedNFTs.push(nft);
    }
  }

  return updatedNFTs;
}