import React from 'react';
import { useNFTContext } from '@/app/contexts/NFTContext';
import _ from 'lodash';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AddressGroupDialog } from './AddressGroupDialog';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import NFTSiteWalletIcons from '@/app/components/NFTSiteWalletIcons';
import Papa from 'papaparse';
import { Download } from 'lucide-react';
import { Pencil, Loader2 } from "lucide-react";

interface OwnerStats {
  address: string;
  group: AddressGroup | null;
  nftCount: number;
  holdingRatio: number;
  nftIds: string[];
}

interface OwnerListProps {
  issuer: string;
  taxon: string;
}

const OwnerList: React.FC<OwnerListProps> = ({ issuer, taxon }) => {
  const { nfts, hasMore } = useNFTContext();
  const [addressGroups, setAddressGroups] = React.useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = React.useState<Record<string, AddressInfo>>({});

  // データ読み込み関数
  const loadData = React.useCallback(async (): Promise<void> => {
    const [groups, infos] = await Promise.all([
      dbManager.getAllAddressGroups(),
      dbManager.getAllAddressInfos(),
    ]);

    setAddressGroups(_.keyBy(groups, 'id'));
    setAddressInfos(_.keyBy(infos, 'address'));
  }, []);

  // 初期データ読み込み
  React.useEffect(() => {
    void loadData();
  }, [loadData]);

    // Calculate owner statistics
  const ownerStats = React.useMemo(() => {
    const activeNFTs = nfts.filter(nft => !nft.is_burned);
    const totalActiveNFTs = activeNFTs.length;
    
    const ownerGroups = _.groupBy(activeNFTs, 'owner');
    
    const stats = Object.entries(ownerGroups).map(([address, ownerNFTs]): OwnerStats => {
      const addressInfo = addressInfos[address];
      const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;

      return {
        address,
        group,
        nftCount: ownerNFTs.length,
        holdingRatio: (ownerNFTs.length / totalActiveNFTs) * 100,
        nftIds: ownerNFTs.map(nft => nft.nft_id)
      };
    });

    return _.orderBy(stats, ['nftCount', 'address'], ['desc', 'asc']);
  }, [nfts, addressGroups, addressInfos]);

  // ランク計算用の関数
  const calculateRank = React.useCallback((stats: OwnerStats[]): (number | string)[] => {
    const ranks: (number | string)[] = [];
    let currentRank = 1;
    let currentCount: number | null = null;
    let sameRankCount = 0;

    stats.forEach((stat) => {
      if (stat.nftCount !== currentCount) {
        currentRank = currentRank + sameRankCount;
        currentCount = stat.nftCount;
        sameRankCount = 0;
      }
      ranks.push(currentRank);
      sameRankCount++;
    });

    return ranks;
  }, []);

  const ranks = React.useMemo(() => calculateRank(ownerStats), [ownerStats, calculateRank]);

  const handleExportCSV = () => {
    // CSV用のデータを準備
    const csvData = ownerStats.map((stat, index) => ({
      rank: ranks[index],
      address: stat.address,
      name: stat.group?.name || '',
      xAccount: stat.group?.xAccount || '',
      nftCount: stat.nftCount,
      userValue1: stat.group?.userValue1 || '',
      userValue2: stat.group?.userValue2 || '',
      holdingPercentage: stat.holdingRatio.toFixed(2),
    }));

    // Generate CSV
    const csv = Papa.unparse(csvData);
    
    // Add BOM for UTF-8
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    
    // Create and trigger download
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `owners_rank_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGroupSave = async (savedGroup: AddressGroup) => {
    setAddressGroups(prev => ({
      ...prev,
      [savedGroup.id]: savedGroup
    }));
    
    // アドレス情報も更新
    const infos = await dbManager.getAllAddressInfos();
    setAddressInfos(_.keyBy(infos, 'address'));
  };

  // Format address
  const formatAddress = (address: string) => {
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  const formatXAccount = (xAccount?: string | null) => {
    if (!xAccount) return '-';
    const username = xAccount.startsWith('@') ? xAccount.substring(1) : xAccount;
    return (
      <a
        href={`https://x.com/${username}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
      >
        @{username}
      </a>
    );
  };

  const burnedCount = nfts.filter(nft => nft.is_burned).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500 space-y-1">
          <div>
            Showing {ownerStats.length} owners
            {hasMore && (
              <span className="ml-2 inline-flex items-center gap-1 text-gray-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading more data...
              </span>
            )}
          </div>
          <div>
            Total NFTs: {(nfts.length - burnedCount).toLocaleString()}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export Owner Rank
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Rank</TableHead>
              <TableHead className="w-40">Owner</TableHead>
              <TableHead className="w-40">Name</TableHead>
              <TableHead className="w-40">X Account</TableHead>
              <TableHead className="w-32 text-right">NFT Count</TableHead>
              <TableHead className="w-32 text-right">User Value1</TableHead>
              <TableHead className="w-32 text-right">User Value2</TableHead>
              <TableHead className="w-32 text-right">Holding %</TableHead>
              <TableHead className="w-40">Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownerStats.map((stat, index)  => (
              <TableRow key={stat.address}>
                <TableCell className="text-center font-medium">
                  {ranks[index]}
                </TableCell>
                <TableCell className="font-mono group relative">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{formatAddress(stat.address)}</span>
                    <AddressGroupDialog
                      initialAddresses={[stat.address]}
                      groupId={stat.group?.id}
                      onSave={handleGroupSave}
                    >
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </AddressGroupDialog>
                  </div>
                </TableCell>
                <TableCell>
                  {stat.group?.name || '-'}
                </TableCell>
                <TableCell>
                  {formatXAccount(stat.group?.xAccount)}
                </TableCell>
                <TableCell className="text-right">
                  {stat.nftCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {stat.group?.userValue1}
                </TableCell>
                <TableCell className="text-right">
                  {stat.group?.userValue2}
                </TableCell>
                <TableCell className="text-right">
                  {stat.holdingRatio.toFixed(2)}%
                </TableCell>
                <TableCell>
                  <NFTSiteWalletIcons wallet={stat.address} issuer={issuer} taxon={taxon} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OwnerList;