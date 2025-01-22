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

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  //'https://cloudflare-ipfs.com/ipfs/',
  //'https://dweb.link/ipfs/',
  //'https://gateway.ipfs.io/ipfs/',
];

const TIMEOUT_DURATION = 20000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

export async function fetchNFTMetadata(uri: string): Promise<NFTMetadata | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_DURATION);

    if (uri.startsWith('ipfs://')) {
      const hash = uri.replace('ipfs://', '');
      
      const fetchPromises = IPFS_GATEWAYS.map(async (gateway) => {
        try {
          const response = await fetchWithRetry(gateway + hash, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
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

      const result = await Promise.race(
        fetchPromises.map(p => p.catch(() => null))
      );

      clearTimeout(timeoutId);
      return result;
    }
    
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      const response = await fetchWithRetry(uri, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return await response.json();
    }

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
  // Filter NFTs that need name updates (name is null and has a URI)
  const nftsToUpdate = nfts.filter(nft => nft.name === null && nft.uri);
  
  // If no NFTs need updating, return original array
  if (nftsToUpdate.length === 0) {
    return nfts;
  }

  console.log(`Updating names for ${nftsToUpdate.length} NFTs`);

  const updatedNFTs = await Promise.all(
    nftsToUpdate.map(async (nft) => {
      try {
        const metadata = await fetchNFTMetadata(nft.uri);
        return {
          ...nft,
          name: metadata?.name || null
        };
      } catch (error) {
        console.error(`Error updating NFT name for ${nft.nft_id}:`, error);
        return nft;
      }
    })
  );

  // Combine updated NFTs with unchanged ones and maintain original order
  return nfts.map(originalNft => {
    const updatedNft = updatedNFTs.find(u => u.nft_id === originalNft.nft_id);
    return updatedNft || originalNft;
  });
}

export async function updateNFTName(nft: NFToken): Promise<NFToken> {
  if (nft.name !== null || !nft.uri) {
    return nft;
  }
  // console.log(`Updating name for ${nft.nft_id}`);
  try {
    const metadata = await fetchNFTMetadata(nft.uri);
    return {
      ...nft,
      name: metadata?.name || null
    };
  } catch (error) {
    console.error(`Error updating NFT name for ${nft.nft_id}:`, error);
    return nft;
  }
}