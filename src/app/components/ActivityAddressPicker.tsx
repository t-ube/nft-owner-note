"use client";

// マイアクティビティの対象アドレスを、アドレス帳（グループ）から検索して追加する。
// グループを選ぶと、そのグループのアドレスをまとめて対象にする。アドレスを直接入れて足すこともできる。
import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { isValidClassicAddress } from "ripple-address-codec";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { AddressGroup } from "@/utils/db";
import { cn } from "@/lib/utils";

/** 一度に描く候補の数 */
const MAX_VISIBLE = 50;

type Props = {
  groups: AddressGroup[];
  /** すでに対象にしているグループの id と、直接追加したアドレス */
  selectedGroupIds: string[];
  selectedAddresses: string[];
  onToggleGroup: (groupId: string) => void;
  onAddAddress: (address: string) => void;
  labels: {
    search: string;
    searchPlaceholder: string;
    noResults: string;
    addRaw: string;
    addressCount: string;
  };
};

export function ActivityAddressPicker({
  groups,
  selectedGroupIds,
  selectedAddresses,
  onToggleGroup,
  onAddAddress,
  labels,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // 名前・X アカウント・アドレスの部分一致。名前の前方一致を先に並べる
  const matched = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return groups;
    const hits = groups.filter(
      (g) =>
        g.name.toLowerCase().includes(term) ||
        (g.xAccount ?? "").toLowerCase().includes(term) ||
        g.addresses.some((a) => a.toLowerCase().includes(term))
    );
    return hits.sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(term)) - Number(!b.name.toLowerCase().startsWith(term)) ||
        a.name.localeCompare(b.name)
    );
  }, [groups, query]);

  const raw = query.trim();
  const canAddRaw = isValidClassicAddress(raw) && !selectedAddresses.includes(raw);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          {labels.search}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] p-0 sm:w-80" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={labels.searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {canAddRaw && (
              <CommandGroup>
                <CommandItem
                  value={`raw:${raw}`}
                  onSelect={() => {
                    onAddAddress(raw);
                    setQuery("");
                  }}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {labels.addRaw} <span className="font-mono text-xs">{raw}</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {matched.length === 0 && !canAddRaw && <CommandEmpty>{labels.noResults}</CommandEmpty>}
            <CommandGroup>
              {matched.slice(0, MAX_VISIBLE).map((g) => {
                const selected = selectedGroupIds.includes(g.id);
                return (
                  <CommandItem key={g.id} value={g.id} onSelect={() => onToggleGroup(g.id)}>
                    <Check className={cn("h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{g.name}</div>
                      {g.xAccount && <div className="truncate text-xs text-muted-foreground">@{g.xAccount}</div>}
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {labels.addressCount.replace("{count}", String(g.addresses.length))}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
