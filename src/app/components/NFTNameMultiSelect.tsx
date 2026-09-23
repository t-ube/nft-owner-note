"use client";

import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import NFTThumbnail from '@/app/components/NFTThumbnail';
import { NFTNameOption } from '@/utils/ownerNftGroups';
import { cn } from '@/lib/utils';

interface NFTNameMultiSelectProps {
  options: NFTNameOption[];
  selected: string[];
  onChange: (names: string[]) => void;
  labels: {
    placeholder: string;
    selectedCount: string;
    searchPlaceholder: string;
    noResults: string;
    holders: string;
    clear: string;
    /** 候補が多すぎて省いたときの表示（{count} 件） */
    more: string;
  };
}

/** 一度に描く候補の数（多いと開くのが重くなるため） */
const MAX_VISIBLE_OPTIONS = 100;

/** グループ化済みの NFT 名（＋URI のサムネイル）から複数選択するドロップダウン。 */
const NFTNameMultiSelect: React.FC<NFTNameMultiSelectProps> = ({
  options,
  selected,
  onChange,
  labels,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const optionsByName = useMemo(
    () => new Map(options.map(option => [option.name, option])),
    [options]
  );

  // 既定のあいまい検索（入力した文字が順に含まれていれば一致）ではなく、部分一致で絞り込む。
  // 「#1」と入れたときに「#10000」に埋もれないよう、完全一致・前方一致・短い名前の順に並べる
  const matched = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    const rank = (name: string) => {
      const lower = name.toLowerCase();
      if (lower === term) return 0;
      if (lower.startsWith(term)) return 1;
      return 2;
    };
    return options
      .filter(option => option.name.toLowerCase().includes(term))
      .sort((a, b) =>
        rank(a.name) - rank(b.name) ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name)
      );
  }, [options, query]);
  const visibleOptions = matched.slice(0, MAX_VISIBLE_OPTIONS);
  const hiddenCount = matched.length - visibleOptions.length;

  const toggle = (name: string) => {
    onChange(
      selected.includes(name)
        ? selected.filter(n => n !== name)
        : [...selected, name]
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full sm:w-96 justify-between font-normal"
            >
              <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
                {selected.length === 0
                  ? labels.placeholder
                  : labels.selectedCount.replace('{count}', selected.length.toString())}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={labels.searchPlaceholder}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {matched.length === 0 && <CommandEmpty>{labels.noResults}</CommandEmpty>}
                <CommandGroup>
                  {visibleOptions.map(option => {
                    const isSelected = selected.includes(option.name);
                    return (
                      <CommandItem
                        key={option.name}
                        value={option.name}
                        onSelect={() => toggle(option.name)}
                      >
                        <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                        <NFTThumbnail uri={option.uris[0]} alt={option.name} className="h-8 w-8 shrink-0" />
                        <span className="flex-1 truncate">{option.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {labels.holders.replace('{count}', option.ownerCount.toLocaleString())}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {hiddenCount > 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {labels.more.replace('{count}', hiddenCount.toLocaleString())}
                  </div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="self-start sm:self-center" onClick={() => onChange([])}>
            {labels.clear}
          </Button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map(name => (
            <Badge key={name} variant="secondary" className="max-w-full gap-2 p-1 pr-2 text-sm font-medium">
              <NFTThumbnail uri={optionsByName.get(name)?.uris[0]} alt={name} className="h-12 w-12 shrink-0" />
              <span className="min-w-0 max-w-[12rem] truncate">{name}</span>
              <button
                type="button"
                aria-label={`${labels.clear}: ${name}`}
                onClick={() => toggle(name)}
                className="shrink-0 rounded-sm p-1 opacity-60 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export default NFTNameMultiSelect;
