import React, { useRef, useEffect } from 'react';
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

export interface FilterState {
  colors?: string[];
  minAmount?: number;
  maxAmount?: number;
  minDate?: number;
  maxDate?: number;
  minLatestSaleDate?: number;
  maxLatestSaleDate?: number;
  nftName?: string;
}

export interface NFTFiltersProps {
  onFilterChange: (filters: FilterState) => void;
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

export const NFTFilters: React.FC<NFTFiltersProps> = ({ onFilterChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<FilterState>({});

  // フィルターの適用数をカウント
  const activeFilterCount = Object.values(filters).filter(value => 
    value !== undefined && (
      !Array.isArray(value) || value.length > 0
    )
  ).length;

  // フィルター更新をデバウンス
  const debouncedFilterRef = useRef(
    _.debounce((currentFilters: FilterState) => {
      onFilterChange(currentFilters);
    }, 300)
  );

  useEffect(() => {
    const debouncedFilter = debouncedFilterRef.current;
    debouncedFilter(filters);
    
    return () => {
      debouncedFilter.cancel();
    };
  }, [filters]);

  const clearFilters = () => {
    setFilters({});
  };

  // フィルター更新のヘルパー関数
   const updateFilter = <K extends keyof FilterState>(
    key: K, 
    value: FilterState[K] | undefined
  ) => {
    setFilters(prev => {
      if (value === undefined || 
         (Array.isArray(value) && value.length === 0)) {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      }
      return { ...prev, [key]: value };
    });
  };

  // 日付を Unix タイムスタンプに変換
  const dateToTimestamp = (dateStr: string): number => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
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
              <Label>NFT Name</Label>
              <Input
                type="text"
                placeholder="Search by name"
                value={filters.nftName || ''}
                onChange={e => updateFilter(
                  'nftName',
                  e.target.value || undefined
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                <Select
                  value={filters.colors?.[0] || ''}
                  onValueChange={value => 
                    updateFilter('colors', value ? [value] : undefined)
                  }
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
                {filters.colors && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => updateFilter('colors', undefined)}
                    className="h-10 w-10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mint Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.minDate 
                    ? new Date(filters.minDate).toISOString().split('T')[0]
                    : ''}
                  onChange={e => updateFilter(
                    'minDate',
                    e.target.value ? dateToTimestamp(e.target.value) : undefined
                  )}
                />
                <Input
                  type="date"
                  value={filters.maxDate
                    ? new Date(filters.maxDate).toISOString().split('T')[0]
                    : ''}
                  onChange={e => updateFilter(
                    'maxDate',
                    e.target.value ? dateToTimestamp(e.target.value) : undefined
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Last Sale Amount Range (XRP)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.minAmount || ''}
                  onChange={e => updateFilter(
                    'minAmount',
                    e.target.value ? Number(e.target.value) : undefined
                  )}
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.maxAmount || ''}
                  onChange={e => updateFilter(
                    'maxAmount',
                    e.target.value ? Number(e.target.value) : undefined
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Latest Sale Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.minLatestSaleDate 
                    ? new Date(filters.minLatestSaleDate).toISOString().split('T')[0]
                    : ''}
                  onChange={e => updateFilter(
                    'minLatestSaleDate',
                    e.target.value ? dateToTimestamp(e.target.value) : undefined
                  )}
                />
                <Input
                  type="date"
                  value={filters.maxLatestSaleDate
                    ? new Date(filters.maxLatestSaleDate).toISOString().split('T')[0]
                    : ''}
                  onChange={e => updateFilter(
                    'maxLatestSaleDate',
                    e.target.value ? dateToTimestamp(e.target.value) : undefined
                  )}
                />
              </div>
            </div>
            
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};