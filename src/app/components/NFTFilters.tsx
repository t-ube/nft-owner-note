import React from 'react';
import { NFToken } from '@/utils/db';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterIcon, X } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import _ from 'lodash';

interface FilterState {
  name: string;
  color: string | null;
  mintedAtStart: string;
  mintedAtEnd: string;
  lastTransferredAtStart: string;
  lastTransferredAtEnd: string;
}

export interface NFTFiltersProps {
  activeNfts: NFToken[];
  onFilterChange: (filteredNfts: NFToken[]) => void;
}

const COLORS = [
  { value: '🔴', label: '🔴 Red' },
  { value: '🟠', label: '🟠 Orange' },
  { value: '🟡', label: '🟡 Yellow' },
  { value: '🟢', label: '🟢 Green' },
  { value: '🔵', label: '🔵 Blue' },
  { value: '🟣', label: '🟣 Purple' },
  { value: '🟤', label: '🟤 Brown' },
] as const;

export const NFTFilters: React.FC<NFTFiltersProps> = ({ activeNfts, onFilterChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<FilterState>({
    name: '',
    color: null,
    mintedAtStart: '',
    mintedAtEnd: '',
    lastTransferredAtStart: '',
    lastTransferredAtEnd: '',
  });

  const activeFilterCount = Object.values(filters).filter(value => 
    value !== '' && value !== null
  ).length;

  // フィルター処理をデバウンス
  const debouncedFilter = React.useCallback(
    _.debounce((currentFilters: FilterState) => {
      const filteredNfts = activeNfts.filter(nft => {
        // Name filter
        if (currentFilters.name && (!nft.name || !nft.name.toLowerCase().includes(currentFilters.name.toLowerCase()))) {
          return false;
        }

        // color filter
        if (currentFilters.color && nft.color !== currentFilters.color) {
          return false;
        }

        // Minted date range
        if (currentFilters.mintedAtStart && (!nft.mintedAt || new Date(nft.mintedAt) < new Date(currentFilters.mintedAtStart))) {
          return false;
        }
        if (currentFilters.mintedAtEnd && (!nft.mintedAt || new Date(nft.mintedAt) > new Date(currentFilters.mintedAtEnd))) {
          return false;
        }

        // Last transferred date range
        if (currentFilters.lastTransferredAtStart && 
            (!nft.lastTransferredAt || new Date(nft.lastTransferredAt) < new Date(currentFilters.lastTransferredAtStart))) {
          return false;
        }
        if (currentFilters.lastTransferredAtEnd && 
            (!nft.lastTransferredAt || new Date(nft.lastTransferredAt) > new Date(currentFilters.lastTransferredAtEnd))) {
          return false;
        }

        return true;
      });

      onFilterChange(filteredNfts);
    }, 300),
    [activeNfts, onFilterChange]
  );

  // フィルターの変更を監視
  React.useEffect(() => {
    debouncedFilter(filters);
    return () => debouncedFilter.cancel();
  }, [filters, debouncedFilter]);

  const clearFilters = () => {
    setFilters({
      name: '',
      color: null,
      mintedAtStart: '',
      mintedAtEnd: '',
      lastTransferredAtStart: '',
      lastTransferredAtEnd: '',
    });
  };

  const updateFilter = (key: keyof FilterState, value: string | null) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <FilterIcon className="h-4 w-4 mr-2" />
            Filter
            {activeFilterCount > 0 && (
              <Badge 
                variant="secondary" 
                className="ml-2 h-5 w-5 p-0 flex items-center justify-center"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <div className="flex justify-between items-center">
              <SheetTitle>Filter NFTs</SheetTitle>
              {activeFilterCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearFilters}
                  className="h-8 px-2 lg:px-3"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Filter by name..."
                value={filters.name}
                onChange={e => updateFilter('name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                <Select
                  value={filters.color || undefined}
                  onValueChange={value => updateFilter('color', value)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map(color => (
                    <SelectItem key={color.value} value={color.value}>
                      {color.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.color && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => updateFilter('color', null)}
                  className="h-10 w-10"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Minted Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.mintedAtStart}
                  onChange={e => updateFilter('mintedAtStart', e.target.value)}
                />
                <Input
                  type="date"
                  value={filters.mintedAtEnd}
                  onChange={e => updateFilter('mintedAtEnd', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Last Transfer Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.lastTransferredAtStart}
                  onChange={e => updateFilter('lastTransferredAtStart', e.target.value)}
                />
                <Input
                  type="date"
                  value={filters.lastTransferredAtEnd}
                  onChange={e => updateFilter('lastTransferredAtEnd', e.target.value)}
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};