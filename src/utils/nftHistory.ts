// utils/nftHistory.ts

import { Client } from 'xrpl';
import { NFToken } from './db';

interface ModifiedNode {
  LedgerEntryType: string;
  FinalFields?: {
    Balance?: string;
    Account?: string;
  };
  PreviousFields?: {
    Balance?: string;
    Account?: string;
  };
}

interface NFTHistoryTransaction {
  meta: {
    TransactionIndex: number;
    TransactionResult: string;
    AffectedNodes: Array<{
      ModifiedNode?: ModifiedNode;
    }>;
  };
  tx_json: {
    TransactionType: string;
    Account: string;
    Destination?: string;
    Amount?: string;
    NFTokenSellOffer?: string;
    NFTokenBuyOffer?: string;
    date: number;
  };
  ledger_index: number;
  hash: string;
  close_time_iso: string;
  validated: boolean;
}

interface NFTHistoryResponse {
  result: {
    ledger_index_min: number;
    ledger_index_max: number;
    transactions: NFTHistoryTransaction[];
    nft_id: string;
    validated: boolean;
  };
}

interface NFTTransferHistory {
  nft_id: string;
  amount: number;
  timestamp: number;
  from: string;
  to: string;
}

interface NFTMintInfo {
  timestamp: number;
}

/*
async function fetchAllTransferHistory(
  client: Client,
  nft: NFToken
): Promise<NFTTransferHistory[]> {
  const transfers: NFTTransferHistory[] = [];
  let startLedger: number | undefined;

  while (true) {
    try {
      const response = await client.request({
        command: 'nft_history',
        nft_id: nft.nft_id,
        ledger_index_min: startLedger || -1,
        ledger_index_max: -1,
        limit: 100
      }) as NFTHistoryResponse;

      for (const tx of response.result.transactions) {
        if (tx.tx_json.TransactionType === 'NFTokenAcceptOffer') {
          const accountChanges = tx.meta.AffectedNodes.filter(node => 
            node.ModifiedNode?.LedgerEntryType === 'AccountRoot' &&
            node.ModifiedNode.PreviousFields?.Balance !== undefined &&
            node.ModifiedNode.FinalFields?.Balance !== undefined
          );

          let saleAmount = 0;
          for (const change of accountChanges) {
            if (change.ModifiedNode) {
              const previousBalance = Number(change.ModifiedNode.PreviousFields?.Balance || '0');
              const finalBalance = Number(change.ModifiedNode.FinalFields?.Balance || '0');
              const balanceChange = finalBalance - previousBalance;
              if (balanceChange < 0 && Math.abs(balanceChange) > 12) {
                saleAmount = Math.abs(balanceChange);
                break;
              }
            }
          }

          if (saleAmount > 0) {
            transfers.push({
              nft_id: nft.nft_id,
              amount: saleAmount / 1000000,
              timestamp: new Date(tx.close_time_iso).getTime(),
              from: tx.tx_json.Account,
              to: tx.tx_json.Destination || ''
            });
          }
        }
      }

      // 結果が100件未満なら全て取得完了
      if (response.result.transactions.length < 100) {
        break;
      }

      // 次のページの開始レジャーを設定
      startLedger = response.result.transactions[response.result.transactions.length - 1].ledger_index;

    } catch (error) {
      console.error('Error fetching NFT history:', error);
      break;
    }
  }

  return transfers;
}
*/

async function fetchAllHistory(
  client: Client,
  nft: NFToken
): Promise<{
  transfers: NFTTransferHistory[];
  mintInfo: NFTMintInfo | null;
}> {
  const transfers: NFTTransferHistory[] = [];
  let mintInfo: NFTMintInfo | null = null;
  let startLedger: number | undefined;

  while (true) {
    try {
      const response = await client.request({
        command: 'nft_history',
        nft_id: nft.nft_id,
        ledger_index_min: startLedger || -1,
        ledger_index_max: -1,
        limit: 100
      }) as NFTHistoryResponse;

      for (const tx of response.result.transactions) {
        // Check for NFTokenMint transaction
        if (tx.tx_json.TransactionType === 'NFTokenMint') {
          mintInfo = {
            timestamp: new Date(tx.close_time_iso).getTime()
          };
        }
        // Check for NFTokenAcceptOffer transaction
        else if (tx.tx_json.TransactionType === 'NFTokenAcceptOffer') {
          const accountChanges = tx.meta.AffectedNodes.filter(node => 
            node.ModifiedNode?.LedgerEntryType === 'AccountRoot' &&
            node.ModifiedNode.PreviousFields?.Balance !== undefined &&
            node.ModifiedNode.FinalFields?.Balance !== undefined
          );

          let saleAmount = 0;
          for (const change of accountChanges) {
            if (change.ModifiedNode) {
              const previousBalance = Number(change.ModifiedNode.PreviousFields?.Balance || '0');
              const finalBalance = Number(change.ModifiedNode.FinalFields?.Balance || '0');
              const balanceChange = finalBalance - previousBalance;
              if (balanceChange < 0 && Math.abs(balanceChange) > 12) {
                saleAmount = Math.abs(balanceChange);
                break;
              }
            }
          }

          if (saleAmount > 0) {
            transfers.push({
              nft_id: nft.nft_id,
              amount: saleAmount / 1000000,
              timestamp: new Date(tx.close_time_iso).getTime(),
              from: tx.tx_json.Account,
              to: tx.tx_json.Destination || ''
            });
          }
        }
      }

      // If less than 100 results, we've got all the history
      if (response.result.transactions.length < 100) {
        break;
      }

      // Set the start ledger for the next page
      startLedger = response.result.transactions[response.result.transactions.length - 1].ledger_index;

    } catch (error) {
      console.error('Error fetching NFT history:', error);
      break;
    }
  }

  return { transfers, mintInfo };
}

export async function fetchNFTTransferHistory(
  client: Client,
  nft: NFToken
): Promise<{
  firstSale: NFTTransferHistory | null;
  lastSale: NFTTransferHistory | null;
  mintInfo: NFTMintInfo | null;
}> {
  try {
    const { transfers, mintInfo } = await fetchAllHistory(client, nft);
    
    // 時系列でソート
    const sortedTransfers = transfers.sort((a, b) => a.timestamp - b.timestamp);

    return {
      firstSale: sortedTransfers[0] || null,
      lastSale: sortedTransfers[sortedTransfers.length - 1] || null,
      mintInfo
    };

  } catch (error) {
    console.error('Error fetching NFT history:', error);
    return {
      firstSale: null,
      lastSale: null,
      mintInfo: null
    };
  }
}

export async function updateNFTTransferHistories(
  client: Client,
  nfts: NFToken[]
): Promise<NFToken[]> {
  const updatedNFTs: NFToken[] = [];

  for (const nft of nfts) {
    try {
      const history = await fetchNFTTransferHistory(client, nft);
      
      updatedNFTs.push({
        ...nft,
        firstSaleAmount: history.firstSale?.amount || null,
        firstSaleAt: history.firstSale?.timestamp || null,
        lastSaleAmount: history.lastSale?.amount || null,
        lastSaleAt: history.lastSale?.timestamp || null,
        mintedAt: history.mintInfo?.timestamp || null,
      });
    } catch (error) {
      console.error(`Error updating NFT ${nft.nft_id} history:`, error);
      updatedNFTs.push(nft);
    }
  }

  return updatedNFTs;
}