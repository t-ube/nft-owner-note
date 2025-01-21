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

interface OwnerStats {
  address: string;
  group: AddressGroup | null;
  nftCount: number;
  holdingRatio: number;
  nftIds: string[];
}

const OwnerList: React.FC = () => {
  const { nfts } = useNFTContext();
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
          </div>
          <div>
            Total NFTs: {nfts.length.toLocaleString()} 
            (Active: {(nfts.length - burnedCount).toLocaleString()}, 
            Burned: {burnedCount.toLocaleString()})
          </div>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Rank</TableHead>
              <TableHead className="w-40">Owner</TableHead>
              <TableHead className="w-40">Label</TableHead>
              <TableHead className="w-40">X Account</TableHead>
              <TableHead className="w-32 text-right">NFT Count</TableHead>
              <TableHead className="w-32 text-right">Holding %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownerStats.map((stat, index)  => (
              <TableRow key={stat.address}>
                <TableCell className="text-center font-medium">
                  {ranks[index]}
                </TableCell>
                <TableCell className="font-mono">
                  <AddressGroupDialog
                    initialAddresses={[stat.address]}
                    groupId={stat.group?.id}
                    onSave={handleGroupSave}
                  >
                    <Button 
                      variant="link" 
                      className="h-auto p-0 font-mono"
                    >
                      {formatAddress(stat.address)}
                    </Button>
                  </AddressGroupDialog>
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
                  {stat.holdingRatio.toFixed(2)}%
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