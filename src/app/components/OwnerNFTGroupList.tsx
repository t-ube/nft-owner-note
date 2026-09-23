"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, Check, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import HelpPopover from '@/app/components/HelpPopover';
import _ from 'lodash';
import { dbManager, AddressGroup, AddressInfo, NFToken } from '@/utils/db';
import {
  groupNFTsByOwner,
  buildNameOptions,
  filterOwnersByNames,
  findNextUnusedIndex,
  countUsed,
  hasTransferredAfterUse,
  OwnerNFTGroup,
  OwnerNFTNameGroup,
} from '@/utils/ownerNftGroups';
import { fetchNftName, fetchNftNames } from '@/app/components/useNftCache';
import { useNFTContext } from '@/app/contexts/NFTContext';
import NFTThumbnail from '@/app/components/NFTThumbnail';
import NFTNameMultiSelect from '@/app/components/NFTNameMultiSelect';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 50;
const COLLAPSED_TILES = 12;
const SELECTED_NAMES_STORAGE_KEY = 'ownerNote.ownerCollection.selectedNames';
const REWARD_MODE_STORAGE_KEY = 'ownerNote.ownerCollection.rewardMode';
const NAME_FETCH_CONCURRENCY = 4;

// 絞り込みで選んだ NFT 名はプロジェクトごとにブラウザへ保存する
const loadSelectedNames = (projectId: string): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(`${SELECTED_NAMES_STORAGE_KEY}.${projectId}`) ?? '[]');
    return Array.isArray(stored) ? stored.filter((name): name is string => typeof name === 'string') : [];
  } catch {
    return [];
  }
};

// 特典管理モード（使用済みの付け外し）のオンオフもプロジェクトごとに保存する
const loadRewardMode = (projectId: string): boolean => {
  try {
    return localStorage.getItem(`${REWARD_MODE_STORAGE_KEY}.${projectId}`) === '1';
  } catch {
    return false;
  }
};

const saveRewardMode = (projectId: string, enabled: boolean) => {
  try {
    const key = `${REWARD_MODE_STORAGE_KEY}.${projectId}`;
    if (enabled) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ストレージが使えない環境では保存しない */
  }
};

const saveSelectedNames = (projectId: string, names: string[]) => {
  try {
    const key = `${SELECTED_NAMES_STORAGE_KEY}.${projectId}`;
    if (names.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(names));
    }
  } catch {
    /* ストレージが使えない環境では保存しない */
  }
};

interface OwnerNFTGroupListProps {
  lang: string;
  projectId: string;
}

const OwnerNFTGroupList: React.FC<OwnerNFTGroupListProps> = ({ lang, projectId }) => {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [nfts, setNfts] = useState<NFToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [selectedNames, setSelectedNames] = useState<string[]>(() => loadSelectedNames(projectId));
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());
  const [nameFetchProgress, setNameFetchProgress] = useState<{ done: number; total: number } | null>(null);
  // 開発用の操作を出すか（URL に ?dev があるとき）
  const isDev = useSearchParams().has('dev');
  const [hideUsedOwners, setHideUsedOwners] = useState(false);
  const [rewardMode, setRewardMode] = useState<boolean>(() => loadRewardMode(projectId));
  const { isLoading: isSyncingNFTs, updatingNFTs } = useNFTContext();

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [projectNFTs, groups, infos] = await Promise.all([
        dbManager.getNFTsByProjectId(projectId),
        dbManager.getAllAddressGroups(),
        dbManager.getAllAddressInfos(),
      ]);
      setNfts(projectNFTs);
      setAddressGroups(_.keyBy(groups, 'id'));
      setAddressInfos(_.keyBy(infos, 'address'));
    } catch (err) {
      console.error('Failed to load NFTs:', err);
      setError('Failed to load NFTs');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // XRPL からの NFT 取得・履歴更新が終わるたびに IndexedDB から読み直す
  useEffect(() => {
    if (isSyncingNFTs || updatingNFTs.size > 0) return;
    loadData();
  }, [loadData, isSyncingNFTs, updatingNFTs.size]);

  const ownerGroups = useMemo(() => groupNFTsByOwner(nfts), [nfts]);
  const nameOptions = useMemo(() => buildNameOptions(ownerGroups), [ownerGroups]);
  const filteredOwners = useMemo(
    () => filterOwnersByNames(ownerGroups, selectedNames),
    [ownerGroups, selectedNames]
  );
  const unnamedNFTs = useMemo(
    () => nfts.filter(nft => !nft.is_burned && !nft.name?.trim()),
    [nfts]
  );

  const handleSelectedNamesChange = (names: string[]) => {
    setSelectedNames(names);
    saveSelectedNames(projectId, names);
    setCurrentPage(1);
  };

  // 名前未取得の NFT について、キャッシュ API から名前を取得して DB に保存する
  const handleFetchNames = async () => {
    const nftsByUri = _.groupBy(unnamedNFTs.filter(nft => nft.uri), 'uri');
    const uris = Object.keys(nftsByUri);
    if (uris.length === 0) return;

    let done = 0;
    setNameFetchProgress({ done, total: uris.length });
    try {
      // まず一括 API でまとめて取り、1 つのトランザクションで保存する
      const bulk = await fetchNftNames(uris);
      await dbManager.updateNFTsDetails(
        Array.from(bulk, ([uri, name]) => nftsByUri[uri].map(nft => ({ ...nft, name }))).flat()
      );
      done = bulk.size;
      setNameFetchProgress({ done, total: uris.length });

      // 一括で取れなかったものだけ 1 件ずつ取る（キャッシュに無ければ生成も依頼する）
      const rest = uris.filter(uri => !bulk.has(uri));
      for (const batch of _.chunk(rest, NAME_FETCH_CONCURRENCY)) {
        await Promise.all(batch.map(async (uri) => {
          try {
            const name = (await fetchNftName(uri))?.trim();
            if (name) {
              for (const nft of nftsByUri[uri]) {
                await dbManager.updateNFTDetails({ ...nft, name });
              }
            }
          } catch (err) {
            console.error(`Failed to fetch NFT name for ${uri}:`, err);
          } finally {
            done++;
            setNameFetchProgress({ done, total: uris.length });
          }
        }));
      }
    } finally {
      setNameFetchProgress(null);
      await loadData();
    }
  };

  // 特典の受け渡しに使った NFT を使用済みにする（使い回し防止のため NFT 側に記録する）
  const setUsed = async (ids: string[], used: boolean, owner: string) => {
    if (ids.length === 0) return;
    try {
      await dbManager.setNFTsUsed(ids, used, owner);
      await dbManager.markProjectAsUserEdited(projectId);
      await loadData();
    } catch (err) {
      console.error('Failed to update used state:', err);
    }
  };

  // 名前ごとに未使用の1枚（シリアルが小さいもの）を使用済みにする
  const markGroupUsed = (owner: string, groups: OwnerNFTNameGroup[]) => {
    const ids = groups
      .map(group => {
        const index = findNextUnusedIndex(group);
        return index === -1 ? null : group.ids[index];
      })
      .filter((id): id is string => id !== null);
    return setUsed(ids, true, owner);
  };

  // 名前ごとに最後に使用済みにした1枚を未使用へ戻す
  const unmarkGroupUsed = (owner: string, groups: OwnerNFTNameGroup[]) => {
    const ids = groups
      .map(group => {
        let latest = -1;
        group.usedAt.forEach((usedAt, i) => {
          if (usedAt === null) return;
          if (latest === -1 || usedAt > (group.usedAt[latest] ?? 0)) latest = i;
        });
        return latest === -1 ? null : group.ids[latest];
      })
      .filter((id): id is string => id !== null);
    return setUsed(ids, false, owner);
  };

  const handleRewardModeChange = (enabled: boolean) => {
    setRewardMode(enabled);
    saveRewardMode(projectId, enabled);
    if (!enabled) setHideUsedOwners(false);
  };

  const toggleExpanded = (owner: string) => {
    setExpandedOwners(prev => {
      const next = new Set(prev);
      if (next.has(owner)) {
        next.delete(owner);
      } else {
        next.add(owner);
      }
      return next;
    });
  };

  if (!dict) return null;

  const page = dict.project.detail.ownerCollection;
  const pagination = dict.project.detail.nftListPage.pagination;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{page.errors.loadFailed}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading && nfts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCcw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (ownerGroups.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{page.status.noData}</AlertDescription>
      </Alert>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filteredOwners.length / ITEMS_PER_PAGE));
  const pageOwners = filteredOwners.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatAddress = (address: string) =>
    `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;

  // 絞り込み中は対象の NFT を先頭に、対象外をその後ろに並べる（それぞれシリアル順を維持）
  const selectedNameSet = new Set(selectedNames);
  const orderNameGroups = (nameGroups: OwnerNFTNameGroup[]) =>
    selectedNameSet.size === 0
      ? nameGroups
      : _.sortBy(nameGroups, g => (g.name !== null && selectedNameSet.has(g.name) ? 0 : 1));

  // 絞り込み対象の名前グループと、その使用済み状況
  const describeRow = (ownerGroup: OwnerNFTGroup) => {
    const targetGroups = ownerGroup.nameGroups.filter(
      g => g.name !== null && selectedNameSet.has(g.name)
    );
    const usedNames = targetGroups.filter(g => countUsed(g) > 0).length;
    return {
      targetGroups,
      usedNames,
      // 使用済みにした後で別のオーナーへ渡った NFT を含むか
      hasTransferred: targetGroups.some(g => hasTransferredAfterUse(g, ownerGroup.owner)),
      // 対象のどれかに未使用の1枚が残っていれば、まだ特典を渡せる
      canMark: targetGroups.length > 0 && targetGroups.some(g => findNextUnusedIndex(g) !== -1),
      isFullyUsed: targetGroups.length > 0 && usedNames === targetGroups.length,
    };
  };

  const visibleOwners = rewardMode && hideUsedOwners
    ? pageOwners.filter(ownerGroup => !describeRow(ownerGroup).isFullyUsed)
    : pageOwners;

  const rows = visibleOwners.map((ownerGroup, index) => {
    const addressInfo = addressInfos[ownerGroup.owner];
    const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;
    return {
      owner: ownerGroup.owner,
      rank: (currentPage - 1) * ITEMS_PER_PAGE + index + 1,
      groupName: group?.name ?? null,
      nftCount: ownerGroup.nftCount,
      namedKinds: ownerGroup.nameGroups.filter(g => g.name !== null).length,
      unnamedCount: ownerGroup.nameGroups.find(g => g.name === null)?.nftIds.length ?? 0,
      nameGroups: orderNameGroups(ownerGroup.nameGroups),
      ...describeRow(ownerGroup),
    };
  });

  // 種類数は名前のある NFT だけで数えるので、名前未取得の分があるときは印を付ける（件数はツールチップで）
  const renderUnnamedHint = (count: number) => {
    if (count === 0) return null;
    const label = page.table.kindsUnnamed.replace('{count}', count.toLocaleString());
    return (
      <span title={label} className="ml-1 inline-flex align-[-2px]">
        <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  };

  const formatUsedAt = (usedAt: number) =>
    new Date(usedAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US');

  // 対象の使用済み状況を示すバッジと、まとめて付け外しするボタン
  const renderUsedControls = (row: (typeof rows)[number]) => {
    if (!rewardMode || row.targetGroups.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {row.hasTransferred && (
          <Badge variant="destructive" className="gap-1 whitespace-nowrap">
            <AlertTriangle className="h-3 w-3" />
            {page.used.badgeTransferred}
          </Badge>
        )}
        {row.usedNames > 0 && (
          <Badge variant={row.isFullyUsed ? 'default' : 'secondary'} className="whitespace-nowrap">
            {row.isFullyUsed
              ? page.used.badgeUsed
              : page.used.badgePartial
                  .replace('{used}', row.usedNames.toLocaleString())
                  .replace('{total}', row.targetGroups.length.toLocaleString())}
          </Badge>
        )}
        {row.canMark ? (
          <Button size="sm" variant="outline" onClick={() => markGroupUsed(row.owner, row.targetGroups)}>
            {page.used.mark}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => unmarkGroupUsed(row.owner, row.targetGroups)}>
            {page.used.unmark}
          </Button>
        )}
      </div>
    );
  };

  // 保有 NFT を画像タイルで表示する。名前ごとに1枚（×枚数）、名前未取得の NFT は1件ずつ。
  // タイルを押すと、その名前の未使用1枚を使用済みにする（すべて使用済みなら最後の1枚を戻す）。
  const renderNameGroups = (owner: string, nameGroups: OwnerNFTNameGroup[], className?: string) => {
    const usedLabel = (usedAt: number | null, usedOwner: string | null) => {
      if (!rewardMode || usedAt === null) return '';
      let label = `\n${page.used.usedAtLabel.replace('{date}', formatUsedAt(usedAt))}`;
      if (usedOwner) {
        label += `\n${page.used.usedByLabel.replace('{address}', usedOwner)}`;
        if (usedOwner !== owner) label += `\n${page.used.transferredNote}`;
      }
      return label;
    };

    const tiles = nameGroups.flatMap(nameGroup => {
      if (nameGroup.name === null) {
        return nameGroup.nftIds.map((nftId, i) => ({
          key: nftId,
          uri: nameGroup.uris[i],
          title:
            `${page.unnamed}\n#${nameGroup.serials[i]}` +
            usedLabel(nameGroup.usedAt[i], nameGroup.usedOwners[i]),
          count: 1,
          usedCount: nameGroup.usedAt[i] === null ? 0 : 1,
          isTransferred: hasTransferredAfterUse(nameGroup, owner),
          isSelected: false,
          onToggle: () => setUsed([nameGroup.ids[i]], nameGroup.usedAt[i] === null, owner),
        }));
      }
      const usedIndex = nameGroup.usedAt.findIndex(usedAt => usedAt !== null);
      return [{
        key: `name:${nameGroup.name}`,
        uri: nameGroup.uris[0],
        title:
          `${nameGroup.name}\n${nameGroup.serials.map(serial => `#${serial}`).join(', ')}` +
          usedLabel(usedIndex === -1 ? null : nameGroup.usedAt[usedIndex], nameGroup.usedOwners[usedIndex] ?? null),
        count: nameGroup.nftIds.length,
        usedCount: countUsed(nameGroup),
        isTransferred: hasTransferredAfterUse(nameGroup, owner),
        isSelected: selectedNameSet.has(nameGroup.name),
        // 押すたびに未使用を1枚ずつ消費し、すべて使用済みになったら次の1押しで全部戻す
        onToggle: () =>
          findNextUnusedIndex(nameGroup) === -1
            ? setUsed(nameGroup.ids, false, owner)
            : markGroupUsed(owner, [nameGroup]),
      }];
    });
    const isExpanded = expandedOwners.has(owner);
    const visibleTiles = isExpanded ? tiles : tiles.slice(0, COLLAPSED_TILES);
    const hiddenCount = tiles.length - visibleTiles.length;

    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        {visibleTiles.map(tile => (
          <button
            key={tile.key}
            type="button"
            title={tile.title}
            aria-label={tile.title}
            onClick={rewardMode ? tile.onToggle : undefined}
            disabled={!rewardMode}
            className={cn(
              'relative shrink-0 rounded-md transition-opacity',
              rewardMode && 'hover:opacity-80',
              selectedNameSet.size > 0 && !tile.isSelected && 'opacity-40'
            )}
          >
            <NFTThumbnail
              uri={tile.uri}
              alt={tile.title}
              className={cn('h-14 w-14', rewardMode && tile.usedCount > 0 && 'grayscale')}
            />
            {rewardMode && tile.usedCount > 0 && (
              <span
                className={cn(
                  'absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full',
                  tile.isTransferred
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-primary text-primary-foreground'
                )}
              >
                {tile.isTransferred ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              </span>
            )}
            {tile.count > 1 && (
              <span className="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-1 text-[10px] font-medium leading-4">
                {rewardMode && tile.usedCount > 0 ? `${tile.usedCount}/${tile.count}` : `×${tile.count}`}
              </span>
            )}
          </button>
        ))}
        {tiles.length > COLLAPSED_TILES && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 text-xs"
            onClick={() => toggleExpanded(owner)}
          >
            {isExpanded
              ? page.showLess
              : page.showMore.replace('{count}', hiddenCount.toLocaleString())}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-medium">{page.filter.label}</div>
        <NFTNameMultiSelect
          options={nameOptions}
          selected={selectedNames}
          onChange={handleSelectedNamesChange}
          labels={{ ...page.filter, more: page.showMore }}
        />
        {/* 名前未取得の NFT は絞り込みと種類数に入らないので、そのことをフィルタのすぐ下で伝える */}
        {unnamedNFTs.length > 0 && (
          <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-900/60 dark:bg-amber-950/30">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="flex-1 min-w-0 text-xs text-amber-900 dark:text-amber-200">
              {page.status.unnamed.replace('{count}', unnamedNFTs.length.toLocaleString())}
            </span>
            {/* 名前は同期のときに一括で入るので、手動の取得は開発用（URL に ?dev があるとき）だけ出す */}
            {isDev && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleFetchNames}
                disabled={nameFetchProgress !== null}
                className="h-7 shrink-0 px-2.5 text-xs bg-background"
              >
                <RefreshCcw className={cn('h-3.5 w-3.5 mr-1.5', nameFetchProgress && 'animate-spin')} />
                {nameFetchProgress
                  ? page.actions.fetchingNames
                      .replace('{done}', nameFetchProgress.done.toLocaleString())
                      .replace('{total}', nameFetchProgress.total.toLocaleString())
                  : page.actions.fetchNames}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{selectedNames.length > 0
          ? page.status.matched
              .replace('{matched}', filteredOwners.length.toLocaleString())
              .replace('{total}', ownerGroups.length.toLocaleString())
              .replace('{count}', selectedNames.length.toLocaleString())
          : page.status.owners.replace('{count}', ownerGroups.length.toLocaleString())}</span>
        <div className="flex flex-wrap items-center gap-4">
          {rewardMode && selectedNames.length > 0 && (
            <div className="flex items-center gap-2">
              <Switch id="hide-used" checked={hideUsedOwners} onCheckedChange={setHideUsedOwners} />
              <Label htmlFor="hide-used" className="font-normal">{page.used.hideUsed}</Label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="reward-mode" checked={rewardMode} onCheckedChange={handleRewardModeChange} />
            <Label htmlFor="reward-mode" className="font-normal">{page.used.modeLabel}</Label>
          </div>
          <HelpPopover label={page.title} description={page.description} />
        </div>
      </div>

      {/* PC: テーブル表示 */}
      <div className="hidden sm:block border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{page.table.owner}</TableHead>
              <TableHead className="text-right whitespace-nowrap">{page.table.nftCount}</TableHead>
              <TableHead className="text-right whitespace-nowrap">{page.table.kinds}</TableHead>
              <TableHead>{page.table.nfts}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.owner} className="align-top">
                <TableCell className="text-muted-foreground">{row.rank}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div title={row.owner}>
                    {row.groupName ? row.groupName : (
                      <span className="font-mono">{formatAddress(row.owner)}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{row.nftCount.toLocaleString()}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {row.namedKinds.toLocaleString()}
                  {renderUnnamedHint(row.unnamedCount)}
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    {renderUsedControls(row)}
                    {renderNameGroups(row.owner, row.nameGroups, 'min-w-[16rem]')}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* スマホ: カード表示 */}
      <div className="sm:hidden border rounded-md divide-y">
        {rows.map(row => (
          <div key={row.owner} className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-sm text-muted-foreground w-6 shrink-0">{row.rank}</span>
              <div className="min-w-0 flex-1">
                {row.groupName ? (
                  <div className="font-medium truncate">{row.groupName}</div>
                ) : (
                  <div className="text-sm font-mono">{formatAddress(row.owner)}</div>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <div>{page.table.nftCount}: <span className="text-foreground font-medium">{row.nftCount.toLocaleString()}</span></div>
                <div>{page.table.kinds}: <span className="text-foreground font-medium">{row.namedKinds.toLocaleString()}</span>{renderUnnamedHint(row.unnamedCount)}</div>
              </div>
            </div>
            {renderUsedControls(row)}
            {renderNameGroups(row.owner, row.nameGroups)}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
          >
            {pagination.previous}
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            {pagination.next}
          </Button>
        </div>
      )}
    </div>
  );
};

export default OwnerNFTGroupList;
