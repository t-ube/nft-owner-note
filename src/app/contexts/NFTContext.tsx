"use client"

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { dbManager, NFToken } from '@/utils/db';
import { fetchNFTTransferHistory } from '@/utils/nftHistory';
import { updateNFTName } from '@/utils/nftMetadata';
import _ from 'lodash';
import { Client } from 'xrpl';

const XRPL_WEBSOCKET_URL = 'wss://s1.ripple.com';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

interface NFTContextType {
  nfts: NFToken[];
  setNfts: React.Dispatch<React.SetStateAction<NFToken[]>>;
  isLoading: boolean;
  isSyncHistory: boolean;
  updatingNFTs: Set<string>;
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

export const NFTContextProvider: React.FC<NFTContextProviderProps> = ({ 
  children,
  projectId,
  issuer,
  taxon
}) => {
  const [nfts, setNfts] = useState<NFToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncHistory, setIsSyncHistory] = useState(false);
  const [updatingNFTs, setUpdatingNFTs] = useState<Set<string>>(new Set()); 
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [marker, setMarker] = useState<unknown | undefined>();

  const MAX_NFTS = 1000;
  const BATCH_SIZE = 100;
  const HISTORY_BATCH_SIZE = 5;
  const CONCURRENT_CONNECTIONS = 4;

  // 単一のNFTの履歴を更新
  const updateNFTHistory = async (nftId: string) => {
  
    try {
      setIsSyncHistory(true);

      setUpdatingNFTs(prev => {
        const next = new Set(prev);
        next.add(nftId);
        return next;
      });
  
      const nft = nfts.find(n => n.nft_id === nftId);
      if (!nft) {
        console.warn(`NFT with ID ${nftId} not found`);
        return;
      }
  
      // executeXrplRequestを使用してNFT履歴を取得
      const history = await executeXrplRequest(async (client) => {
        return await fetchNFTTransferHistory(client, nft);
      });
      const namedNft = await updateNFTName(nft);
  
      if (history) {
        const updatedNFT = {
          ...nft,
          name: namedNft.name,
          mintedAt: history.mintInfo?.timestamp || null,
          firstSaleAmount: history.firstSale?.amount || null,
          firstSaleAt: history.firstSale?.timestamp || null,
          lastSaleAmount: history.lastSale?.amount || null,
          lastSaleAt: history.lastSale?.timestamp || null
        };
  
        await dbManager.updateNFTDetails(updatedNFT);
        
        setNfts(prev => 
          prev.map(n => n.nft_id === nftId ? updatedNFT : n)
        );
      }
    } catch (error) {
      console.error(`Error updating NFT history for ${nftId}:`, error);
      throw error; // エラーを上位に伝播させる
    } finally {
      setUpdatingNFTs(prev => {
        const next = new Set(prev);
        next.delete(nftId);
        return next;
      });
      setIsSyncHistory(false);
    }
  };

  // 全NFTの履歴を更新
  const updateAllNFTHistory = async () => {
    if (nfts.length === 0) return;
  
    try {
      setIsSyncHistory(true);

      const nftIds = nfts.map(nft => nft.nft_id);
      setUpdatingNFTs(new Set(Array.from(nftIds)));
      
      // NFTsをバッチに分割
      const batches = _.chunk(nfts, HISTORY_BATCH_SIZE);
      
      // バッチを同時接続数で制限して処理
      const batchGroups = _.chunk(batches, CONCURRENT_CONNECTIONS);
      
      for (const batchGroup of batchGroups) {
        const batchPromises = batchGroup.map(async (batch) => {
          // 一つのバッチ内のNFTsを単一のクライアント接続で処理
          return executeXrplRequest(async (client) => {
            const nftPromises = batch.map(async (nft) => {
              try {
                const namedNft = await updateNFTName(nft);
                const history = await fetchNFTTransferHistory(client, nft);

                if (history) {
                  const updatedNFT = {
                    ...nft,
                    name: namedNft.name,
                    mintedAt: history.mintInfo?.timestamp || null,
                    firstSaleAmount: history.firstSale?.amount || null,
                    firstSaleAt: history.firstSale?.timestamp || null,
                    lastSaleAmount: history.lastSale?.amount || null,
                    lastSaleAt: history.lastSale?.timestamp || null
                  };
                  
                  await dbManager.updateNFTDetails(updatedNFT);
                  
                  setNfts(prev => 
                    prev.map(n => n.nft_id === nft.nft_id ? updatedNFT : n)
                  );
                }
              } catch (error) {
                console.error(`Error updating NFT ${nft.nft_id}:`, error);
              } finally {
                setUpdatingNFTs(prev => {
                  const next = new Set(prev);
                  next.delete(nft.nft_id);
                  return next;
                });
              }
            });
            
            await Promise.all(nftPromises);
          });
        });
        
        // バッチグループ内のPromiseを待機
        await Promise.all(batchPromises);
        
        // バッチグループ間で待機してレート制限を回避
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error updating all NFT histories:', error);
    } finally {
      setUpdatingNFTs(new Set());
      setIsSyncHistory(false);
    }
  };

  const fetchNFTs = useCallback(async () => {

    if (!hasMore) return;
    
    // nfts.lengthの代わりにsetNftsの関数形式で現在の長さをチェック
    let currentLength = 0;
    setNfts(prev => {
      currentLength = prev.length;
      return prev;
    });
    
    if (currentLength >= MAX_NFTS) return;
  
    setIsLoading(true);
    try {
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

      let existingNFTs: NFToken[] = [];
      setNfts(prev => {
        existingNFTs = prev.filter(nft => 
          transformedNFTs.some(transformed => transformed.nft_id === nft.nft_id)
        );
        return prev;
      });

      const mergedNFTs = transformedNFTs.map(newNFT => {
        const existing = existingNFTs.find(e => e.nft_id === newNFT.nft_id);
        return {
          ...newNFT,
          name: existing?.name ?? null,
        };
      });

      const updatedNFTs = await dbManager.updateNFTs(projectId, mergedNFTs);
  
      const nextMarker = response.result.marker;
      let willExceedLimit = false;
      setNfts(prev => {
        willExceedLimit = (prev.length + transformedNFTs.length) >= MAX_NFTS;
        return prev;
      });
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
  }, [hasMore, marker, projectId, issuer, taxon]);

  // Load cached data from database
  useEffect(() => {
    let mounted = true;

    const loadCachedData = async () => {
      console.log("NFTContext: useEffect - loadCachedData");
      try {
        const cachedNFTs = await dbManager.getNFTsByProjectId(projectId);
        if (!mounted) return;

        if (cachedNFTs.length > 0) {
          setNfts(cachedNFTs);
          setIsLoading(false);
        }

        // キャッシュデータ読み込み後に一度だけfetchNFTsを呼び出す
        if (mounted) {
          fetchNFTs();
        }
      } catch (err) {
        console.error('Failed to load cached data:', err);
        if (mounted) {
          fetchNFTs();
        }
      }
    };

    loadCachedData();

    return () => {
      mounted = false;
    };
  }, [projectId]);

  const loadMore = async () => {
    await fetchNFTs();
  };

  const refreshData = async () => {
    setMarker(undefined);
    setHasMore(true);
    await fetchNFTs();
  };

  const value = {
    nfts,
    setNfts,
    isLoading,
    isSyncHistory,
    updatingNFTs,
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