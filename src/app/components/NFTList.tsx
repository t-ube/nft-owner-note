import React from 'react';
import { useNFTContext } from '@/app/contexts/NFTContext';
import { useXrplClient } from '@/app/contexts/XrplContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCcw, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import { AddressGroupDialog } from '@/app/components/AddressGroupDialog';
import NFTSiteIcons from '@/app/components/NFTSiteIcons';
import { NFTFilters } from '@/app/components/NFTFilters';
import { NFToken } from '@/utils/db';
import NFTNameEdit from '@/app/components/NFTNameEdit';
import _ from 'lodash';

const COLORS = [
  { value: '🔴', label: '🔴 Red' },
  { value: '🟠', label: '🟠 Orange' },
  { value: '🟡', label: '🟡 Yellow' },
  { value: '🟢', label: '🟢 Green' },
  { value: '🔵', label: '🔵 Blue' },
  { value: '🟣', label: '🟣 Purple' },
  { value: '🟤', label: '🟤 Brown' },
] as const;

type ColorType = typeof COLORS[number]['value'] | null;

type SortField = 'tokenId' | 'name' | 'owner' | 'mintedAt' | 'firstSaleAmount' | 'firstSaleAt' | 'lastSaleAmount' | 'lastSaleAt' | 'priceChange' | 'isOrderMade';
type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const NFTList: React.FC = () => {
  const { 
    nfts,
    setNfts,
    isLoading, 
    updatingNFTs,
    error, 
    hasMore, 
    refreshData,
    loadMore,
    updateAllNFTHistory,
    updateNFTHistory
  } = useNFTContext();
  const { isReady } = useXrplClient();
  const [addressGroups, setAddressGroups] = React.useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = React.useState<Record<string, AddressInfo>>({});
  const [sort, setSort] = React.useState<SortState>({ field: 'tokenId', direction: null });
  const [filteredNfts, setFilteredNfts] = React.useState<NFToken[]>([]);

  React.useEffect(() => {
    setFilteredNfts(nfts);
  }, [nfts]);

  React.useEffect(() => {
    const loadData = async () => {
      const [groups, infos] = await Promise.all([
        dbManager.getAllAddressGroups(),
        dbManager.getAllAddressInfos(),
      ]);

      setAddressGroups(_.keyBy(groups, 'id'));
      setAddressInfos(_.keyBy(infos, 'address'));
    };
    loadData();
  }, []);

  React.useEffect(() => {
    const autoLoad = async () => {
      if (hasMore && !isLoading) {
        await loadMore();
      }
    };
    autoLoad();
  }, [hasMore, isLoading, loadMore]);

  const handleGroupSave = async (savedGroup: AddressGroup) => {
    setAddressGroups(prev => ({
      ...prev,
      [savedGroup.id]: savedGroup
    }));
    
    const infos = await dbManager.getAllAddressInfos();
    setAddressInfos(_.keyBy(infos, 'address'));
  };

  const handleColorChange = async (nftId: string, newColor: ColorType) => {
    const nft = nfts.find(n => n.nft_id === nftId);
    if (!nft) return;

    const updatedNFT = {
      ...nft,
      color: newColor
    };

    try {
      await dbManager.updateNFTDetails(updatedNFT);
      setNfts(prev => prev.map(n => 
        n.nft_id === nftId ? updatedNFT : n
      ));
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  };

  const handleSort = (field: SortField) => {
    setSort(prev => ({
      field,
      direction: 
        prev.field === field
          ? prev.direction === null 
            ? 'asc'
            : prev.direction === 'asc'
              ? 'desc'
              : null
          : 'asc'
    }));
  };

  const getSortedNFTs = () => {
    // フィルタリングされたNFTsに対してソートを適用
    const activeNFTs = filteredNfts.filter(nft => !nft.is_burned);
    if (!sort.direction) return activeNFTs;

    return _.orderBy(
      activeNFTs,
      [nft => {
        switch (sort.field) {
          case 'tokenId':
            return nft.nft_id.toLowerCase();
          case 'name':
            return nft.name?.toLowerCase() || '';
          case 'owner':
            return nft.owner.toLowerCase();
          case 'mintedAt':
              return nft.mintedAt || -1;
          case 'firstSaleAmount':
            return nft.firstSaleAmount || -1;
          case 'firstSaleAt':
            return nft.firstSaleAt || -1;
          case 'lastSaleAmount':
            return nft.lastSaleAmount || -1;
          case 'lastSaleAt':
            return nft.lastSaleAt || -1;
          case 'priceChange':
            const firstAmount = nft.firstSaleAmount;
            const lastAmount = nft.lastSaleAmount;
            if (!firstAmount || !lastAmount) return sort.direction === 'asc' ? Infinity : -Infinity;
            return ((lastAmount - firstAmount) / firstAmount) * 100;
          case 'isOrderMade':
            return nft.isOrderMade;
          default:
            return nft.nft_id.toLowerCase();
        }
      }],
      [sort.direction]
    );
  };

  const formatDate = (timestamp?: number | null) => {
    if (timestamp === undefined) return '-';
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '/').replace(',', '');
  };

  const formatAmount = (amount?: number | null) => {
    if (amount === undefined) return '-';
    if (amount === null) return '-';
    return `${amount.toLocaleString()} XRP`;
  };

  const formatTokenId = (tokenId: string) => {
    if (tokenId.length <= 12) return tokenId;
    return `${tokenId.substring(0, 6)}...${tokenId.substring(tokenId.length - 6)}`;
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  const calculatePriceChange = (firstAmount?: number | null, lastAmount?: number | null) => {
    if (!firstAmount || !lastAmount) return null;
    const change = ((lastAmount - firstAmount) / firstAmount) * 100;
    return change;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    if (sort.direction === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
    if (sort.direction === 'desc') return <ArrowDown className="ml-2 h-4 w-4" />;
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const handleNameSave = async (nft: NFToken, newName: string | null) => {
    const updatedNFT = {
      ...nft,
      name: newName
    };

    try {
      await dbManager.updateNFTDetails(updatedNFT);
      setNfts(prev => prev.map(n => 
        n.nft_id === nft.nft_id ? updatedNFT : n
      ));
    } catch (error) {
      console.error('Failed to update name:', error);
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead>
      <Button
        variant="ghost"
        onClick={() => handleSort(field)}
        className="h-8 p-0 font-semibold hover:bg-transparent"
      >
        {children}
        <SortIcon field={field} />
      </Button>
    </TableHead>
  );

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

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  const sortedNFTs = getSortedNFTs();
  const burnedCount = nfts.filter(nft => nft.is_burned).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500 space-y-1">
          <div>
            Showing {sortedNFTs.length} NFTs
          </div>
          <div>
            Total NFTs: {nfts.length.toLocaleString()} 
            (Active: {(nfts.length - burnedCount).toLocaleString()}, 
            Burned: {burnedCount.toLocaleString()})
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NFTFilters
            activeNfts={nfts.filter(nft => !nft.is_burned)}
            onFilterChange={setFilteredNfts}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await refreshData();
              updateAllNFTHistory();
            }}
            disabled={isLoading || updatingNFTs.size > 0}
            className="flex items-center gap-2"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? "Refreshing" : "Refresh"}
            {updatingNFTs.size > 0 ? " / Updating History..." : " / Update History"}
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="tokenId">Token ID</SortableHeader>
              <SortableHeader field="name">Name</SortableHeader>
              <SortableHeader field="owner">Owner / Label</SortableHeader>
              <SortableHeader field="mintedAt">Minted At</SortableHeader>
              <SortableHeader field="lastSaleAmount">Last Sale</SortableHeader>
              <SortableHeader field="lastSaleAt">Last Sale At</SortableHeader>
              <SortableHeader field="priceChange">Price Change</SortableHeader>
              <TableHead>Color</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedNFTs.map((nft) => {
              const priceChange = calculatePriceChange(nft.firstSaleAmount, nft.lastSaleAmount);
              const addressInfo = addressInfos[nft.owner];
              const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;

              return (
                <TableRow key={nft.nft_id}>
                  <TableCell className="font-mono text-xs">
                    {formatTokenId(nft.nft_id)}
                    <NFTSiteIcons tokenId={nft.nft_id} />
                  </TableCell>
                  <TableCell>
                    <NFTNameEdit 
                      nft={nft}
                      onSave={handleNameSave}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <AddressGroupDialog
                        initialAddresses={[nft.owner]}
                        groupId={group?.id}
                        onSave={handleGroupSave}
                      >
                        <Button 
                          variant="link" 
                          className="h-auto p-0 font-mono"
                        >
                          {formatAddress(nft.owner)}
                        </Button>
                      </AddressGroupDialog>
                    </div>
                    {group && (
                      <div className="text-sm text-gray-500 mt-1">
                        {group.name}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatDate(nft.mintedAt)}
                  </TableCell>
                  <TableCell>
                    {formatAmount(nft.lastSaleAmount)}
                  </TableCell>
                  <TableCell>
                    {formatDate(nft.lastSaleAt)}
                  </TableCell>
                  <TableCell>
                    {priceChange !== null ? (
                      <span className={priceChange > 0 ? 'text-green-600' : priceChange < 0 ? 'text-red-600' : ''}>
                        {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={nft.color || undefined}
                      onValueChange={(value) => handleColorChange(nft.nft_id, value as ColorType || null)}
                    >
                      <SelectTrigger className="w-24 text-xs">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {COLORS.map(color => (
                          <SelectItem key={color.value} value={color.value}>
                            {color.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => updateNFTHistory(nft.nft_id)}
                      disabled={updatingNFTs.has(nft.nft_id)}
                    >
                      <RefreshCcw className={`h-4 w-4 ${updatingNFTs.has(nft.nft_id) ? 'animate-spin' : ''}`} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={isLoading || updatingNFTs.size > 0}
          >
            {isLoading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default NFTList;