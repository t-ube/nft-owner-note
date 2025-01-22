import React, { useState, useEffect } from 'react';
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useNFTContext } from '@/app/contexts/NFTContext';
import { RefreshCcw, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { dbManager, AddressGroup, AddressInfo, NFToken } from '@/utils/db';
import { AddressGroupDialog } from '@/app/components/AddressGroupDialog';
import NFTSiteIcons from '@/app/components/NFTSiteIcons';
import { NFTFilters, FilterState } from '@/app/components/NFTFilters';
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

type ColorType = typeof COLORS[number]['value'] | 'none' | null;
type SortField = 'nft_serial' | 'tokenId' | 'name' | 'owner' | 'mintedAt' | 'firstSaleAmount' | 'firstSaleAt' | 'lastSaleAmount' | 'lastSaleAt' | 'isOrderMade';
type SortDirection = 'asc' | 'desc' | null;

const ITEMS_PER_PAGE = 100;

interface NFTListProps {
  projectId: string;
}

const NFTList: React.FC<NFTListProps> = ({ projectId }) => {
  const [nfts, setNfts] = useState<NFToken[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [sort, setSort] = useState<{
    field: SortField;
    direction: SortDirection;
  }>({
    field: 'nft_serial',
    direction: "desc"
  });
  const [filters, setFilters] = useState({});
  const { updatingNFTs, updateNFTHistory, updateAllNFTHistory } = useNFTContext();

  const fetchNFTs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await dbManager.getPaginatedNFTs({
        projectId,
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        sortField: sort.field,
        sortDirection: sort.direction,
        includeBurned: false,
        filters
      });

      setNfts(result.items);
      setTotalItems(result.total);
    } catch (error) {
      console.error('Failed to fetch NFTs:', error);
      setError('Failed to load NFTs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadAddressData = async () => {
      const [groups, infos] = await Promise.all([
        dbManager.getAllAddressGroups(),
        dbManager.getAllAddressInfos(),
      ]);
      setAddressGroups(_.keyBy(groups, 'id'));
      setAddressInfos(_.keyBy(infos, 'address'));
    };
    loadAddressData();
  }, []);

  useEffect(() => {
    fetchNFTs();
  }, [updatingNFTs.size]);

  useEffect(() => {
    fetchNFTs();
  }, [projectId, currentPage, sort, filters]);

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
    setCurrentPage(1);
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

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
      color: newColor === 'none' ? null : newColor
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

  const formatDate = (timestamp?: number | null) => {
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
    if (amount === undefined || amount === null) return '-';
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
    return ((lastAmount - firstAmount) / firstAmount) * 100;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    if (sort.direction === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
    if (sort.direction === 'desc') return <ArrowDown className="ml-2 h-4 w-4" />;
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const handleUpdateNFTHistory = async (nftId: string) => {
    try {
      await updateNFTHistory(nftId);
      await fetchNFTs();
    } catch (error) {
      console.error('Failed to update NFT history:', error);
    }
  };

  // Handler for updating all NFT histories
  const handleUpdateAllHistory = async () => {
    try {
      await updateAllNFTHistory();
      await fetchNFTs();
    } catch (error) {
      console.error('Failed to update all NFT histories:', error);
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

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500 space-y-1">
          <div>
            {isLoading ? (
              "Loading..."
            ) : (
              `Showing ${((currentPage - 1) * ITEMS_PER_PAGE) + 1} to ${Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of ${totalItems} NFTs`
            )}
          </div>
          <div>
            Total NFTs: {totalItems.toLocaleString()} 
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUpdateAllHistory}
            disabled={updatingNFTs.size > 0 || isLoading}
            className="relative"
          >
            <RefreshCcw className={`h-4 w-4 ${updatingNFTs.size > 0 ? 'animate-spin' : ''}`} />
            Update All History
            {updatingNFTs.size > 0 && (
              <span className="ml-2">
                ({totalItems - updatingNFTs.size}/{totalItems})
              </span>
            )}
          </Button>
          <NFTFilters onFilterChange={handleFilterChange} />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="nft_serial">Serial</SortableHeader>
              <SortableHeader field="tokenId">Token ID</SortableHeader>
              <SortableHeader field="owner">Owner</SortableHeader>
              <SortableHeader field="name">NFT Name</SortableHeader>
              <SortableHeader field="mintedAt">Minted At</SortableHeader>
              <SortableHeader field="lastSaleAmount">Last Sale</SortableHeader>
              <SortableHeader field="lastSaleAt">Last Sale At</SortableHeader>
              <TableHead>Price Change</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nfts.map((nft) => {
              const priceChange = calculatePriceChange(nft.firstSaleAmount, nft.lastSaleAmount);
              const addressInfo = addressInfos[nft.owner];
              const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;

              return (
                <TableRow key={nft.nft_id}>
                  <TableCell className="font-mono text-xs">
                    {nft.nft_serial}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatTokenId(nft.nft_id)}
                    <NFTSiteIcons tokenId={nft.nft_id} />
                  </TableCell>
                  <TableCell className="font-mono group relative">
                    <div className="flex items-center gap-2">
                      {formatAddress(nft.owner)}
                      <AddressGroupDialog
                        initialAddresses={[nft.owner]}
                        groupId={group?.id}
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
                    {group && (
                      <div className="text-sm text-gray-500 mt-1">
                        {group.name}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {nft.name}
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
                      value={nft.color === null ? 'none' : nft.color || 'none'}
                      onValueChange={(value) => handleColorChange(nft.nft_id, value as ColorType)}
                    >
                      <SelectTrigger className="w-24 text-xs">
                        <SelectValue placeholder="No Color" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          No Color
                        </SelectItem>
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
                      onClick={() => handleUpdateNFTHistory(nft.nft_id)}
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
          <Pagination>
          <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
              onClick={() => currentPage > 1 && setCurrentPage(prev => prev - 1)}
            />
          </PaginationItem>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNumber = currentPage + i - 2;
            if (pageNumber < 1 || pageNumber > totalPages) return null;
            return (
              <PaginationItem key={pageNumber}>
                <PaginationLink
                  onClick={() => setCurrentPage(pageNumber)}
                  isActive={currentPage === pageNumber}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            );
          })}
          <PaginationItem>
            <PaginationNext
              className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
              onClick={() => currentPage < totalPages && setCurrentPage(prev => prev + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default NFTList;