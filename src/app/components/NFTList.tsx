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
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNFTContext } from '@/app/contexts/NFTContext';
import { RefreshCcw, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { dbManager, AddressGroup, AddressInfo, NFToken } from '@/utils/db';
import { AddressGroupDialog } from '@/app/components/AddressGroupDialog';
import NFTSiteIcons from '@/app/components/NFTSiteIcons';
import { NFTFilters, FilterState } from '@/app/components/NFTFilters';
import { OwnerDetailSheet } from '@/app/components/OwnerDetailSheet';
import _ from 'lodash';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';


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
  lang: string;
  projectId: string;
}

const NFTList: React.FC<NFTListProps> = ({ lang, projectId }) => {
  const [dict, setDict] = useState<Dictionary | null>(null);
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ownerToDelete, setOwnerToDelete] = useState<AddressGroup | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<AddressGroup | null>(null);
  const [initialAddresses, setInitialAddresses] = useState<string[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  

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
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const loadAddressData = async () => {
    const [groups, infos] = await Promise.all([
      dbManager.getAllAddressGroups(),
      dbManager.getAllAddressInfos(),
    ]);
    setAddressGroups(_.keyBy(groups, 'id'));
    setAddressInfos(_.keyBy(infos, 'address'));
  };

  useEffect(() => {
    loadAddressData();
  }, []);

  useEffect(() => {
    fetchNFTs();
  }, [updatingNFTs.size]);

  useEffect(() => {
    fetchNFTs();
  }, [projectId, currentPage, sort, filters]);

  const handleSort = (field: SortField) => {
    setSort(prev => {
      if (field === 'nft_serial' || field === 'lastSaleAmount' || field === 'lastSaleAt') {
        if (prev.field !== field) {
          return { field, direction: 'desc' };
        }
        return {
          field,
          direction: 
            prev.direction === 'desc'
              ? 'asc'
              : prev.direction === 'asc'
                ? null
                : 'desc'
        };
      }
      
      return {
        field,
        direction: 
          prev.field === field
            ? prev.direction === null 
              ? 'asc'
              : prev.direction === 'asc'
                ? 'desc'
                : null
            : 'asc'
      };
    });
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

  const handleDeleteConfirm = async () => {
    if (ownerToDelete) {
      try {
        await dbManager.softDeleteAddressGroup(ownerToDelete.id);
        await loadAddressData();

        // 詳細を開いていた場合閉じる
        setIsDetailOpen(false);

        // 拡張機能に通知
        window.postMessage({ type: 'OWNERNOTE_UPDATED' }, '*');
        
      } catch (error) {
        console.error('Failed to delete owner:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setOwnerToDelete(null);
  };

  const handleRowClick = (addressInfo: AddressInfo | string) => {
    if (typeof addressInfo !== 'string') {
      const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;
      // 既存オーナーの場合
      setSelectedOwner(group);
      setInitialAddresses([]);
    } else {
      // 未登録アドレスの場合（新規作成モードへ）
      setSelectedOwner(null);
      setInitialAddresses([addressInfo || '']);
    }
    setIsDetailOpen(true);
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
  
  if (!dict) return null;

  const nftListPage = dict.project.detail.nftListPage;

  const formatAmount = (amount?: number | null) => {
    if (amount === undefined || amount === null) return '-';
    return nftListPage.format.amount.replace('{amount}', amount.toLocaleString());
  };

  /*
  // Token IDを省略表示
  const formatTokenId = (tokenId: string) => {
    if (tokenId.length <= 12) return tokenId;
    return `${tokenId.substring(0, 6)}...${tokenId.substring(tokenId.length - 6)}`;
  };
  */

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

  const SortableHeader = ({ 
    field, 
    children,
    className 
  }: { 
    field: SortField; 
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
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
        <AlertDescription>{nftListPage.errors.loadFailed}</AlertDescription>
      </Alert>
    );
  }


  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="text-sm text-gray-500 space-y-1">
          <div>
            {nftListPage.status.showing
              .replace('{start}', ((currentPage - 1) * ITEMS_PER_PAGE + 1).toLocaleString())
              .replace('{end}', Math.min(currentPage * ITEMS_PER_PAGE, totalItems).toLocaleString())
              .replace('{total}', totalItems.toLocaleString())
            }
          </div>
          <div>
            {nftListPage.status.totalNFTs.replace('{count}', totalItems.toLocaleString())}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
          <Button
            size="sm"
            onClick={handleUpdateAllHistory}
            disabled={updatingNFTs.size > 0 || isLoading}
            className="relative bg-primary hover:bg-primary/90"
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${updatingNFTs.size > 0 ? 'animate-spin' : ''}`} />
            {updatingNFTs.size > 0 ? (
              <span>
                {updatingNFTs.size > 0 
                  ? nftListPage.actions.updating.replace('{count}', updatingNFTs.size.toString())
                  : nftListPage.actions.updateSaleInfo
                }
              </span>
            ) : (
              nftListPage.actions.updateSaleInfo
            )}
          </Button>
          <NFTFilters lang={lang} onFilterChange={handleFilterChange} />
        </div>
      </div>
  
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="nft_serial">{nftListPage.table.serial}</SortableHeader>
              <TableHead>{nftListPage.table.links}</TableHead>
              <SortableHeader field="owner">{nftListPage.table.owner}</SortableHeader>
              <SortableHeader field="name">{nftListPage.table.nftName}</SortableHeader>
              <SortableHeader field="lastSaleAmount" className="hidden lg:table-cell">{nftListPage.table.lastSale}</SortableHeader>
              <SortableHeader field="lastSaleAt" className="hidden lg:table-cell">{nftListPage.table.lastSaleAt}</SortableHeader>
              <TableHead className="hidden lg:table-cell">{nftListPage.table.priceChange}</TableHead>
              <TableHead>{nftListPage.table.color}</TableHead>
              <TableHead>{nftListPage.table.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nfts.map((nft) => {
              const priceChange = calculatePriceChange(nft.firstSaleAmount, nft.lastSaleAmount);
              const addressInfo = addressInfos[nft.owner];
              const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;
  
              return (
                <TableRow
                  key={nft.nft_id}
                  onClick={() => {
                    if (window.innerWidth < 640) { // smのブレイクポイント
                      handleRowClick(addressInfo ? addressInfo : nft.owner);
                    }
                  }}
                >
                  <TableCell className="font-mono text-xs">
                    {nft.nft_serial}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <NFTSiteIcons tokenId={nft.nft_id} />
                  </TableCell>
                  <TableCell className="font-mono group relative hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      {formatAddress(nft.owner)}
                      <AddressGroupDialog
                        initialAddresses={[nft.owner]}
                        groupId={group?.id}
                        onSave={handleGroupSave}
                        lang={lang}
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
                  <TableCell className="sm:hidden">
                    {group ? (group.name) : (
                      <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1 rounded">
                        {`${nft.owner.slice(0, 6)}...${nft.owner.slice(-4)}`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {nft.name}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatAmount(nft.lastSaleAmount)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatDate(nft.lastSaleAt)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {priceChange !== null ? (
                      <span className={priceChange > 0 ? 'text-green-600' : priceChange < 0 ? 'text-red-600' : ''}>
                        {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Select
                      value={nft.color === null ? 'none' : nft.color || 'none'}
                      onValueChange={(value) => handleColorChange(nft.nft_id, value as ColorType)}
                    >
                      <SelectTrigger
                        className="w-24 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SelectValue placeholder="No Color" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Color</SelectItem>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateNFTHistory(nft.nft_id)
                      }}
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
  
      <div className="overflow-x-auto">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                size="sm"
                className={`${currentPage === 1 ? 'pointer-events-none opacity-50' : ''}`}
                onClick={() => currentPage > 1 && setCurrentPage(prev => prev - 1)}
              >
                {nftListPage.pagination.previous}
              </Button>
            </PaginationItem>
            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
              const pageNumber = currentPage + i - 1;
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
              <Button
                variant="outline"
                size="sm"
                className={`${currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}`}
                onClick={() => currentPage < totalPages && setCurrentPage(prev => prev + 1)}
              >
                {nftListPage.pagination.next}
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

      <OwnerDetailSheet
        owner={selectedOwner}
        initialAddresses={initialAddresses}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onSave={async () => {
          await loadAddressData();
        }}
        onDelete={async (owner) => {
          setOwnerToDelete(owner);
          setIsDeleteDialogOpen(true);
        }}
        lang={lang}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict?.project.owners.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dict?.project.owners.deleteDialog.description.replace('{name}', ownerToDelete?.name || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict?.project.owners.deleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-500 hover:bg-red-600"
            >
              {dict?.project.owners.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NFTList;