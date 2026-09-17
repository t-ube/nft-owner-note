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
  };
}

/** グループ化済みの NFT 名（＋URI のサムネイル）から複数選択するドロップダウン。 */
const NFTNameMultiSelect: React.FC<NFTNameMultiSelectProps> = ({
  options,
  selected,
  onChange,
  labels,
}) => {
  const [open, setOpen] = useState(false);
  const optionsByName = useMemo(
    () => new Map(options.map(option => [option.name, option])),
    [options]
  );

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
            <Command>
              <CommandInput placeholder={labels.searchPlaceholder} />
              <CommandList>
                <CommandEmpty>{labels.noResults}</CommandEmpty>
                <CommandGroup>
                  {options.map(option => {
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
