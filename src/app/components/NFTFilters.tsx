import React, { useRef, useEffect, useState } from 'react';
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
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

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
  lang: string;
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

export const NFTFilters: React.FC<NFTFiltersProps> = ({ lang, onFilterChange }) => {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

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
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

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

  // 日付をUnixタイムスタンプに変換
  const dateToTimestamp = (dateStr: string): number => {
    console.log(dateStr);
    // 入力された日付文字列をローカルタイムゾーンで解釈
    const date = new Date(dateStr);
    // その日の0時0分0秒を取得（ローカルタイムゾーン）
    const localMidnight = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0, 0, 0, 0
    );
    // Unixタイムスタンプとしてミリセカンドを返す
    return localMidnight.getTime();
  };

  const formatDateToLocal = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (!dict) return null;

  const { filters: t } = dict.project.detail;

  return (
    <div>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <FilterIcon className="h-4 w-4 mr-2" />
            {t.button}
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
              <SheetTitle>{t.title}</SheetTitle>
              {activeFilterCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearFilters}
                  className="h-8 px-2 lg:px-3"
                >
                  <X className="h-4 w-4 mr-2" />
                  {t.clearAll}
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label>{t.labels.nftName}</Label>
              <Input
                type="text"
                placeholder={t.placeholders.searchByName}
                value={filters.nftName || ''}
                onChange={e => updateFilter(
                  'nftName',
                  e.target.value || undefined
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>{t.labels.color}</Label>
              <div className="flex gap-2">
                <Select
                  value={filters.colors?.[0] || ''}
                  onValueChange={value => 
                    updateFilter('colors', value ? [value] : undefined)
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t.placeholders.selectColor} />
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
              <Label>{t.labels.mintDateRange}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.minDate 
                    ? formatDateToLocal(filters.minDate)
                    : ''}
                  onChange={e => updateFilter(
                    'minDate',
                    e.target.value ? dateToTimestamp(e.target.value) : undefined
                  )}
                />
                <Input
                  type="date"
                  value={filters.maxDate
                    ? formatDateToLocal(filters.maxDate)
                    : ''}
                  onChange={e => updateFilter(
                    'maxDate',
                    e.target.value ? dateToTimestamp(e.target.value) : undefined
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t.labels.lastSaleAmount}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder={t.placeholders.min}
                  value={filters.minAmount || ''}
                  onChange={e => updateFilter(
                    'minAmount',
                    e.target.value ? Number(e.target.value) : undefined
                  )}
                />
                <Input
                  type="number"
                  placeholder={t.placeholders.max}
                  value={filters.maxAmount || ''}
                  onChange={e => updateFilter(
                    'maxAmount',
                    e.target.value ? Number(e.target.value) : undefined
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t.labels.lastSaleDate}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.minLatestSaleDate 
                    ? formatDateToLocal(filters.minLatestSaleDate)
                    : ''}
                  onChange={e => updateFilter(
                    'minLatestSaleDate',
                    e.target.value ? dateToTimestamp(e.target.value) : undefined
                  )}
                />
                <Input
                  type="date"
                  value={filters.maxLatestSaleDate
                    ? formatDateToLocal(filters.maxLatestSaleDate)
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