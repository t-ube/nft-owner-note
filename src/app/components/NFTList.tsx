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
import { Checkbox } from "@/components/ui/checkbox";
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
import _ from 'lodash';

const SYMBOLS = [
  { value: '🔴', label: '🔴' },
  { value: '🟠', label: '🟠' },
  { value: '🟡', label: '🟡' },
  { value: '🟢', label: '🟢' },
  { value: '🔵', label: '🔵' },
  { value: '🟣', label: '🟣' },
  { value: '🟤', label: '🟤' },
] as const;

type SymbolType = typeof SYMBOLS[number]['value'] | null;

type SortField = 'tokenId' | 'name' | 'owner' | 'mintedAt' | 'firstSaleAmount' | 'firstTransferredAt' | 'lastSaleAmount' | 'lastTransferredAt' | 'priceChange' | 'isOrderMade';
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
    isUpdatingHistory,
    error, 
    hasMore, 
    refreshData,
    loadMore,
    updateAllNFTHistory
  } = useNFTContext();
  const { isReady } = useXrplClient();
  const [addressGroups, setAddressGroups] = React.useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = React.useState<Record<string, AddressInfo>>({});
  const [sort, setSort] = React.useState<SortState>({ field: 'tokenId', direction: null });

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

  const handleGroupSave = async (savedGroup: AddressGroup) => {
    setAddressGroups(prev => ({
      ...prev,
      [savedGroup.id]: savedGroup
    }));
    
    const infos = await dbManager.getAllAddressInfos();
    setAddressInfos(_.keyBy(infos, 'address'));
  };

  const handleOrderMadeChange = async (nftId: string, checked: boolean) => {
    const nft = nfts.find(n => n.nft_id === nftId);
    if (!nft) return;

    const updatedNFT = {
      ...nft,
      isOrderMade: checked
    };

    try {
      await dbManager.updateNFTDetails(updatedNFT);
      const updatedNfts = nfts.map(n => 
        n.nft_id === nftId ? updatedNFT : n
      );
      setNfts(updatedNfts);
    } catch (error) {
      console.error('Failed to update order made status:', error);
    }
  };

  const handleSymbolChange = async (nftId: string, newSymbol: SymbolType) => {
    const nft = nfts.find(n => n.nft_id === nftId);
    if (!nft) return;

    const updatedNFT = {
      ...nft,
      symbol: newSymbol
    };

    try {
      await dbManager.updateNFTDetails(updatedNFT);
      setNfts(prev => prev.map(n => 
        n.nft_id === nftId ? updatedNFT : n
      ));
    } catch (error) {
      console.error('Failed to update symbol:', error);
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
    const activeNFTs = nfts.filter(nft => !nft.is_burned);
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
          case 'firstTransferredAt':
            return nft.firstTransferredAt || -1;
          case 'lastSaleAmount':
            return nft.lastSaleAmount || -1;
          case 'lastTransferredAt':
            return nft.lastTransferredAt || -1;
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
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await refreshData();
            updateAllNFTHistory();
          }}
          disabled={isLoading || isUpdatingHistory}
          className="flex items-center gap-2"
        >
          <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? "Refreshing" : "Refresh"}
          {isUpdatingHistory ? " / Updating History..." : " / Update History"}
        </Button>
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
              <SortableHeader field="lastTransferredAt">Last Sale At</SortableHeader>
              <SortableHeader field="priceChange">Price Change</SortableHeader>
              <SortableHeader field="isOrderMade">Custom Made</SortableHeader>
              <TableHead>Symbol</TableHead>
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
                    {nft.name || '-'}
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
                    {formatDate(nft.lastTransferredAt)}
                  </TableCell>
                  <TableCell>
                    {priceChange !== null ? (
                      <span className={priceChange > 0 ? 'text-green-600' : priceChange < 0 ? 'text-red-600' : ''}>
                        {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={nft.isOrderMade}
                      onCheckedChange={(checked:boolean) => {
                        handleOrderMadeChange(nft.nft_id, checked as boolean);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={nft.symbol || undefined}
                      onValueChange={(value) => handleSymbolChange(nft.nft_id, value as SymbolType || null)}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {SYMBOLS.map(symbol => (
                          <SelectItem key={symbol.value} value={symbol.value}>
                            {symbol.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            disabled={isLoading || isUpdatingHistory}
          >
            {isLoading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default NFTList;