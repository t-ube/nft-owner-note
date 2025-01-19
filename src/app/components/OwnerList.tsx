import React from 'react';
import { useNFTContext } from '@/app/contexts/NFTContext';
import { useXrplClient } from '@/app/contexts/XrplContext';
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
import { AlertCircle, Plus } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AddressGroupDialog } from './AddressGroupDialog';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import CSVImportExport from '@/app/components/CSVImportExport';

interface OwnerStats {
  address: string;
  group: AddressGroup | null;
  nftCount: number;
  holdingRatio: number;
  nftIds: string[];
}

const OwnerList: React.FC = () => {
  const { nfts } = useNFTContext();
  const { isReady } = useXrplClient();
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

  if (!isReady) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Connecting to XRPL...
        </AlertDescription>
      </Alert>
    );
  }

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
        <AddressGroupDialog onSave={handleGroupSave}>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Group
          </Button>
        </AddressGroupDialog>
        <CSVImportExport onGroupsUpdated={loadData} />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Owner</TableHead>
              <TableHead className="w-40">Group</TableHead>
              <TableHead className="w-40">XAccount</TableHead>
              <TableHead className="w-32 text-right">NFT Count</TableHead>
              <TableHead className="w-32 text-right">Holding %</TableHead>
              <TableHead>NFT IDs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownerStats.map((stat) => (
              <TableRow key={stat.address}>
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
                <TableCell className="font-mono text-xs overflow-hidden">
                  {stat.nftIds.slice(0, 3).map(id => id.substring(0, 8)).join(', ')}
                  {stat.nftIds.length > 3 ? ` ... (+${stat.nftIds.length - 3} more)` : ''}
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