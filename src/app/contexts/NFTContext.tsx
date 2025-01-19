"use client"

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { useXrplClient } from '@/app/contexts/XrplContext';
import { dbManager, NFToken } from '@/utils/db';
import { fetchNFTTransferHistory } from '@/utils/nftHistory';
import { updateNFTNames } from '@/utils/nftMetadata';

interface NFTContextType {
  nfts: NFToken[];
  setNfts: React.Dispatch<React.SetStateAction<NFToken[]>>;
  isLoading: boolean;
  isUpdatingHistory: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refreshData: () => Promise<void>;
  updateNFTHistory: (nftId: string) => Promise<void>;
  updateAllNFTHistory: () => Promise<void>;
}

interface NFTContextProviderProps {
  children: React.ReactNode;
  projectId: string;
  issuer: string;
  taxon: string;
}

const NFTContext = createContext<NFTContextType | null>(null);

export const useNFTContext = () => {
  const context = useContext(NFTContext);
  if (!context) {
    throw new Error('useNFTContext must be used within NFTContextProvider');
  }
  return context;
};

export const NFTContextProvider: React.FC<NFTContextProviderProps> = ({ 
  children,
  projectId,
  issuer,
  taxon
}) => {
  const [nfts, setNfts] = useState<NFToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingHistory, setIsUpdatingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [marker, setMarker] = useState<unknown | undefined>();
  const { client, isReady } = useXrplClient();

  const MAX_NFTS = 1000;
  const BATCH_SIZE = 50;

  // 単一のNFTの履歴を更新
  const updateNFTHistory = async (nftId: string) => {
    if (!client || !isReady) return;
  
    try {
      setIsUpdatingHistory(true);
      const nft = nfts.find(n => n.nft_id === nftId);
      if (!nft) return;
  
      const history = await fetchNFTTransferHistory(client, nft);
      if (history) {
        const updatedNFT = {
          ...nft,
          mintedAt: history.mintInfo?.timestamp || null,
          firstSaleAmount: history.firstSale?.amount || null,
          firstTransferredAt: history.firstSale?.timestamp || null,
          lastSaleAmount: history.lastSale?.amount || null,
          lastTransferredAt: history.lastSale?.timestamp || null
        };
        await dbManager.updateNFTDetails(updatedNFT);
        
        setNfts(prev => 
          prev.map(n => n.nft_id === nftId ? updatedNFT : n)
        );
      }
    } catch (error) {
      console.error(`Error updating NFT history for ${nftId}:`, error);
    } finally {
      setIsUpdatingHistory(false);
    }
  };

  // 全NFTの履歴を更新
  const updateAllNFTHistory = async () => {
    if (!client || !isReady || nfts.length === 0) return;

    try {
      setIsUpdatingHistory(true);
      for (const nft of nfts) {
        const history = await fetchNFTTransferHistory(client, nft);
        if (history) {
          const updatedNFT = {
            ...nft,
            mintedAt: history.mintInfo?.timestamp || null,
            firstSaleAmount: history.firstSale?.amount || null,
            firstTransferredAt: history.firstSale?.timestamp || null,
            lastSaleAmount: history.lastSale?.amount || null,
            lastTransferredAt: history.lastSale?.timestamp || null
          };
          await dbManager.updateNFTDetails(updatedNFT);
          
          setNfts(prev => 
            prev.map(n => n.nft_id === nft.nft_id ? updatedNFT : n)
          );
        }
      }
    } catch (error) {
      console.error('Error updating all NFT histories:', error);
    } finally {
      setIsUpdatingHistory(false);
    }
  };

  const fetchNFTs = useCallback(async () => {
    if (!client || !isReady || nfts.length >= MAX_NFTS || !hasMore) return;
  
    setIsLoading(true);
    try {
      const response = await client.request({
        command: 'nfts_by_issuer',
        issuer: issuer,
        limit: BATCH_SIZE,
        marker,
        nft_taxon: parseInt(taxon, 10)
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

      const existingNFTs = nfts.filter(nft => 
        transformedNFTs.some(transformed => transformed.nft_id === nft.nft_id)
      );

      const mergedNFTs = transformedNFTs.map(newNFT => {
        const existing = existingNFTs.find(e => e.nft_id === newNFT.nft_id);
        return {
          ...newNFT,
          name: existing?.name ?? null,
        };
      });

      // メタデータからnameを更新
      const nftsWithNames = await updateNFTNames(mergedNFTs);
  
      // Update NFTs in the database
      const updatedNFTs = await dbManager.updateNFTs(projectId, nftsWithNames);
  
      const nextMarker = response.result.marker;
      const willExceedLimit = (nfts.length + transformedNFTs.length) >= MAX_NFTS;
      const isIncomplete = transformedNFTs.length < BATCH_SIZE;

      setHasMore(!!nextMarker && !willExceedLimit && !isIncomplete);
      setMarker(nextMarker);

      setNfts(prev => {
        const existingIds = new Set(prev.map(n => n.nft_id));
        const newNFTs = updatedNFTs.filter(nft => !existingIds.has(nft.nft_id));
        const updatedExisting = prev.map(existing => {
          const updated = updatedNFTs.find(nft => nft.nft_id === existing.nft_id);
          return updated || existing;
        });
        return [...updatedExisting, ...newNFTs];
      });
  
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [client, isReady, hasMore, marker, nfts.length, projectId, issuer, taxon]);

  // Load cached data from database
  useEffect(() => {
    const loadCachedData = async () => {
      try {
        const cachedNFTs = await dbManager.getNFTsByProjectId(projectId);
        if (cachedNFTs.length > 0) {
          setNfts(cachedNFTs);
          setIsLoading(false);
        }
        // Fetch fresh data even if we have cache
        fetchNFTs();
      } catch (err) {
        console.error('Failed to load cached data:', err);
        fetchNFTs();
      }
    };

    if (isReady) {
      loadCachedData();
    }
  }, [isReady, projectId, fetchNFTs]);

  const loadMore = async () => {
    await fetchNFTs();
  };

  const refreshData = async () => {
    // Clear existing data for this project
    await dbManager.clearProjectNFTs(projectId);
    setNfts([]);
    setMarker(undefined);
    setHasMore(true);
    await fetchNFTs();
  };

  const value = {
    nfts,
    setNfts,
    isLoading,
    isUpdatingHistory,
    error,
    hasMore,
    loadMore,
    refreshData,
    updateNFTHistory,
    updateAllNFTHistory
  };

  return (
    <NFTContext.Provider value={value}>
      {children}
    </NFTContext.Provider>
  );
};