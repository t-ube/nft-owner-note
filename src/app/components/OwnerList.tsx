import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useNFTContext } from '@/app/contexts/NFTContext';
import _ from 'lodash';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressGroupDialog } from './AddressGroupDialog';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import NFTSiteWalletIcons from '@/app/components/NFTSiteWalletIcons';
import Papa from 'papaparse';
import { BookUser, Download, Pencil, Loader2, Search, Sparkles } from "lucide-react";
import OwnerValueEditor from '@/app/components/OwnerValueEditor';
import { SegmentedControl } from '@/app/components/SegmentedControl';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { OwnerDetailSheet } from '@/app/components/OwnerDetailSheet';
import { XRPCAFE_ENDPOINT } from '@/utils/xrpcafe';

interface OwnerStats {
  address: string;
  group: AddressGroup | null;
  nftCount: number;
  holdingRatio: number;
  nftIds: string[];
  userValue1: number | null;
  userValue2: number | null;
}

interface GroupedStats {
  groupId: string | null;
  groupName: string | null;
  xAccount: string | null;
  addresses: string[];
  nftCount: number;
  holdingRatio: number;
  userValue1: number;
  userValue2: number;
}

interface GroupedExportData {
  rank: number | string;
  addresses: string[];
  addressCount: number;
  name: string;
  xAccount: string;
  nftCount: number;
  userValue1: number;
  userValue2: number;
  holdingPercentage: string;
}

interface IndividualExportData {
  rank: number | string;
  address: string;
  name: string;
  xAccount: string;
  nftCount: number;
  userValue1: string;
  userValue2: string;
  holdingPercentage: string;
}

interface OwnerListProps {
  lang: string;
  issuer: string;
  taxon: string;
}

type DisplayStat = 
  | ({ type: 'individual' } & OwnerStats)
  | ({ type: 'group' } & GroupedStats);

type ExportData = GroupedExportData | IndividualExportData;

/**
 * アドレス収集率のバーの色（バー全体が単色で、値によって色が変わる）。
 * 60% まではティールのまま、80% に向けて濃いティールになり、
 * 80% を超えると淡いピンクから、やさしいピンクへ濃くなる。
 */
const COVERAGE_STOPS: [number, [number, number, number]][] = [
  [0, [0x14, 0xB8, 0xA6]],   // ティール
  [60, [0x14, 0xB8, 0xA6]],  // ここまで同じ
  [80, [0x0F, 0x76, 0x6E]],  // 濃いティール
  [80.01, [0xF9, 0xA8, 0xD4]], // 淡いピンク
  [100, [0xF4, 0x72, 0xB6]], // やさしいピンク
];

function coverageColor(ratio: number): string {
  const r = Math.min(100, Math.max(0, ratio));
  for (let i = 1; i < COVERAGE_STOPS.length; i++) {
    const [to, color] = COVERAGE_STOPS[i];
    if (r > to) continue;
    const [from, prev] = COVERAGE_STOPS[i - 1];
    const t = to === from ? 1 : (r - from) / (to - from);
    return `rgb(${prev.map((v, k) => Math.round(v + (color[k] - v) * t)).join(' ')})`;
  }
  return `rgb(${COVERAGE_STOPS[COVERAGE_STOPS.length - 1][1].join(' ')})`;
}

const OwnerList: React.FC<OwnerListProps> = ({ lang, issuer, taxon }) => {
  const { nfts } = useNFTContext();
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [editingCell, setEditingCell] = useState<{ address: string; field: 'userValue1' | 'userValue2' } | null>(null);
  const [ownerValues, setOwnerValues] = useState<Record<string, { userValue1: number | null; userValue2: number | null }>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [showGrouped, setShowGrouped] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ownerToDelete, setOwnerToDelete] = useState<AddressGroup | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<AddressGroup | null>(null);
  const [initialAddresses, setInitialAddresses] = useState<string[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  // データ読み込み関数
  const loadData = useCallback(async (): Promise<void> => {
    const [groups, infos, project] = await Promise.all([
      dbManager.getAllAddressGroups(),
      dbManager.getAllAddressInfos(),
      dbManager.getProjectByIssuerAndTaxon(issuer, taxon),
    ]);

    setAddressGroups(_.keyBy(groups, 'id'));
    setAddressInfos(_.keyBy(infos, 'address'));

    if (project) {
      setProjectId(project.projectId);
      const values = await dbManager.getProjectOwnerValues(project.projectId);
      setOwnerValues(_.keyBy(values, 'owner'));
    }
  }, [issuer, taxon]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  // Individual owner statistics
  const ownerStats = useMemo(() => {
    const activeNFTs = nfts.filter(nft => !nft.is_burned);
    const totalActiveNFTs = activeNFTs.length;
    
    const ownerGroups = _.groupBy(activeNFTs, 'owner');
    
    const stats = Object.entries(ownerGroups).map(([address, ownerNFTs]): OwnerStats => {
      const addressInfo = addressInfos[address];
      const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;
      const ownerValue = ownerValues[address];

      return {
        address,
        group,
        nftCount: ownerNFTs.length,
        holdingRatio: (ownerNFTs.length / totalActiveNFTs) * 100,
        nftIds: ownerNFTs.map(nft => nft.nft_id),
        userValue1: ownerValue?.userValue1 ?? null,
        userValue2: ownerValue?.userValue2 ?? null
      };
    });

    return _.orderBy(stats, ['nftCount', 'address'], ['desc', 'asc']);
  }, [nfts, addressGroups, addressInfos, ownerValues]);

  // Grouped statistics
  const groupedStats = useMemo(() => {
    // グループIDがあるものだけをグループ化
    const groupedOwners = ownerStats.filter(stat => stat.group?.id);
    const statsByGroup = _.groupBy(groupedOwners, stat => stat.group?.id);
    
    return Object.entries(statsByGroup).map(([groupId, stats]): GroupedStats => {
      const group = addressGroups[groupId];
      const totalNFTs = _.sumBy(stats, 'nftCount');
      const totalActiveNFTs = nfts.filter(nft => !nft.is_burned).length;
      
      return {
        groupId,
        groupName: group?.name || null,
        xAccount: group?.xAccount || null,
        addresses: stats.map(s => s.address),
        nftCount: totalNFTs,
        holdingRatio: (totalNFTs / totalActiveNFTs) * 100,
        userValue1: _.sumBy(stats, s => s.userValue1 || 0),
        userValue2: _.sumBy(stats, s => s.userValue2 || 0)
      };
    }).sort((a, b) => b.nftCount - a.nftCount);
  }, [ownerStats, addressGroups, nfts]);

  const displayStats = useMemo(() => {
    if (!showGrouped) {
      return ownerStats.map(stat => ({
        type: 'individual' as const,
        ...stat
      }));
    }
  
    const groupedStatsList = groupedStats.map(stat => ({
      type: 'group' as const,
      ...stat
    }));
  
    const ungroupedStats = ownerStats
      .filter(stat => !stat.group?.id)
      .map(stat => ({
        type: 'individual' as const,
        ...stat
      }));
    
    return [...groupedStatsList, ...ungroupedStats]
      .sort((a, b) => b.nftCount - a.nftCount);
  }, [showGrouped, ownerStats, groupedStats]);

  // ランク計算用の関数
  const calculateRank = useCallback((stats: (OwnerStats | GroupedStats)[]): (number | string)[] => {
    const ranks: (number | string)[] = [];
    let currentRank = 1;
    let currentCount: number | null = null;
    let sameRankCount = 0;

    stats.forEach((stat) => {
      if (stat.nftCount !== currentCount) {
        currentRank = currentRank + sameRankCount;
        currentCount = stat.nftCount;
        sameRankCount = 0;
      }
      ranks.push(currentRank);
      sameRankCount++;
    });

    return ranks;
  }, []);

  const ranks = useMemo(() => calculateRank(displayStats), [displayStats, calculateRank]);

  // 検索で絞り込む（オーナー一覧と同じく、名前・Xアカウント・アドレスが対象）。順位は絞り込む前のまま
  const visibleRows = useMemo(() => {
    const rows = displayStats.map((stat, index) => ({ stat, rank: ranks[index] }));
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(({ stat }) => {
      const name = stat.type === 'group' ? stat.groupName : stat.group?.name;
      const xAccount = stat.type === 'group' ? stat.xAccount : stat.group?.xAccount;
      const addresses = stat.type === 'group' ? stat.addresses : [stat.address];
      return (
        name?.toLowerCase().includes(term) ||
        xAccount?.toLowerCase().includes(term) ||
        addresses.some(address => address.toLowerCase().includes(term))
      );
    });
  }, [displayStats, ranks, searchTerm]);

  // 名前が入っている割合（まとめ表示のときはグループ単位で数える）
  const namedProgress = useMemo(() => ({
    named: displayStats.filter(stat =>
      (stat.type === 'group' ? stat.groupName : stat.group?.name)?.trim()
    ).length,
    total: displayStats.length,
  }), [displayStats]);

  // グループ表示にしたときの行数（グループ＋どこにも属さないアドレス）
  const groupedCount = useMemo(
    () => groupedStats.length + ownerStats.filter(stat => !stat.group?.id).length,
    [groupedStats, ownerStats]
  );

  const handleValueSave = async (address: string, field: 'userValue1' | 'userValue2', value: number | null) => {
    if (!projectId) return;

    try {
      await dbManager.setProjectOwnerValues(projectId, address, {
        [field]: value
      });
      await dbManager.markProjectAsUserEdited(projectId);

      setOwnerValues(prev => ({
        ...prev,
        [address]: {
          userValue1: field === 'userValue1' ? value : prev[address]?.userValue1 ?? null,
          userValue2: field === 'userValue2' ? value : prev[address]?.userValue2 ?? null,
        }
      }));
    } catch (error) {
      console.error('Failed to save owner value:', error);
    }

    setEditingCell(null);
  };

  const formatValue = (value: number | null) => {
    if (value === null) return '-';
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  
  // 個別表示時のデータ作成
  const createIndividualExportData = (
    ownerStats: OwnerStats[],
    ranks: (number | string)[]
    ): IndividualExportData[] => {
    return ownerStats.map((stat, index) => ({
      rank: ranks[index],
      address: stat.address,
      name: stat.group?.name || '',
      xAccount: stat.group?.xAccount || '',
      nftCount: stat.nftCount,
      userValue1: stat.userValue1?.toString() ?? '',
      userValue2: stat.userValue2?.toString() ?? '',
      holdingPercentage: stat.holdingRatio.toFixed(2),
    }));
  };

  // CSVファイルの生成とダウンロード
  const downloadCSV = (data: ExportData[], isGrouped: boolean) => {
    const csv = Papa.unparse(data);
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
    
    const date = new Date().toISOString().split('T')[0];
    const fileName = isGrouped 
      ? `owners_rank_by_group_${date}.csv`
      : `owners_rank_by_address_${date}.csv`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  // 自動プロフィール取得処理
  const handleFetchAutoProfile = async () => {
    if (!projectId) return;
    if (!ownerStats.length) return;
    if (isFetchingProfile) return;

    setIsFetchingProfile(true);
    const REFRESH_EVERY = 5; // 5行更新するごとに画面へ反映
    let updatedSinceRefresh = 0;
    try {
    for (const stat of ownerStats) {
      
      if (!stat.address) {
        console.log('Skipping empty address.');
        continue;
      }

      if (stat.group && stat.group.xAccount?.length) {
        console.log(`Skipping ${stat.address} as it belongs to a group.`);
        continue;
      }

      try {
        const response = await fetch(
          `${XRPCAFE_ENDPOINT}user/profile?xrpAddress=${encodeURIComponent(stat.address)}`
        );

        if (!response.ok) {
          console.error(`Failed to fetch profile for ${stat.address}: ${response.statusText}`);
          continue;
        }

        const json = await response.json();
        //console.log(`Fetched profile for ${stat.address}:`, json);

        if (json.success === false) {
          console.log(`No xrp.cafe profile for ${stat.address}. Skipping.`);
          continue;
        }

        const data = {
          address: json.data?.xrp_address ?? '',
          username: json.data?.username ?? '',
          twitter: json.data?.twitter ?? '',
        };

        const userName = data.username ? data.username : (data.twitter ? `${data.twitter}` : null);
        if (!userName) {
          console.log(`No username or twitter found for ${stat.address}. Skipping.`);
          continue;
        }
        
        await dbManager.getAddressGroups(stat.address).then(async (existingGroups) => {
          if (existingGroups.length > 0) {
            const existingGroup = existingGroups[0];
            const addressGroup : AddressGroup = {
              ...existingGroup,
              xAccount: existingGroup.xAccount ? existingGroup.xAccount : (data.twitter ? `${data.twitter}` : null),
            };
            addressGroup.id = existingGroup.id;
            await dbManager.updateAddressGroup(addressGroup as AddressGroup);
            console.log(`Updating group for ${stat.address}:`, addressGroup);
          } else {
            const addressGroup : Partial<AddressGroup> = {
              name: userName,
              xAccount: data.twitter ? `${data.twitter}` : null,
              addresses: data.address ? [data.address] : [],
              memo: ``,
            };
            await dbManager.createAddressGroup(addressGroup as Omit<AddressGroup, 'id' | 'updatedAt'>);
            console.log(`Creating group for ${stat.address}:`, addressGroup);
          }
        });

        // 5行更新するごとに画面へ反映(IndexedDBローカル読みなので低コスト)
        updatedSinceRefresh++;
        if (updatedSinceRefresh >= REFRESH_EVERY) {
          updatedSinceRefresh = 0;
          await loadData();
        }

      } catch (error) {
        console.error(`Error fetching profile for ${stat.address}:`, error);
      }
    };

    // ループ終了後、5行に満たない残り分を反映
    if (updatedSinceRefresh > 0) {
      await loadData();
    }
    } finally {
      setIsFetchingProfile(false);
    }
  }

  // メインのエクスポート関数
  const handleExportCSV = () => {
    if (showGrouped) {
      // グループ化されたデータとグループ化されていないデータを結合して
      // NFT数でソートしてからエクスポート
      const ungroupedStats = ownerStats.filter(stat => !stat.group?.id);
      const combinedData = [
        ...groupedStats,
        ...ungroupedStats.map(stat => ({
          groupId: null,
          groupName: null,
          xAccount: null,
          addresses: [stat.address],
          nftCount: stat.nftCount,
          holdingRatio: stat.holdingRatio,
          userValue1: stat.userValue1 || 0,
          userValue2: stat.userValue2 || 0
        }))
      ].sort((a, b) => b.nftCount - a.nftCount);
  
      // ソート済みデータに対してランクを計算
      const sortedRanks = calculateRank(combinedData);
      
      const exportData = combinedData.map((stat, index) => ({
        rank: sortedRanks[index],
        addresses: stat.addresses,
        addressCount: stat.addresses.length,
        name: stat.groupName || '-',
        xAccount: stat.xAccount || '',
        nftCount: stat.nftCount,
        userValue1: stat.userValue1,
        userValue2: stat.userValue2,
        holdingPercentage: stat.holdingRatio.toFixed(2),
      }));
  
      downloadCSV(exportData, true);
    } else {
      const exportData = createIndividualExportData(ownerStats, ranks);
      downloadCSV(exportData, false);
    }
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
        await dbManager.deleteAddressGroup(ownerToDelete.id);
        await loadData();

        setIsDetailOpen(false);

        window.postMessage({ type: 'OWNERNOTE_UPDATED' }, '*');
      } catch (error) {
        console.error('Failed to delete owner:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setOwnerToDelete(null);
  };

  const handleRowClick = (stat: OwnerStats | GroupedStats) => {
    if (showGrouped) return;

    if (window.innerWidth < 640) {
      const ownerStat = stat as OwnerStats;
      if (ownerStat.group) {
        setSelectedOwner(ownerStat.group);
        setInitialAddresses([]);
      } else {
        setSelectedOwner(null);
        setInitialAddresses([ownerStat.address]);
      }
      setIsDetailOpen(true);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  const formatXAccount = (xAccount?: string | null) => {
    if (!xAccount) return '-';
    const username = xAccount.startsWith('@') ? xAccount.substring(1) : xAccount;
    return (
      <a
        href={`https://x.com/${username}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 hover:underline transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        @{username}
      </a>
    );
  };

  if (!dict) return null;

  const { ownerList } = dict.project.detail;

  const isGroupedStat = (stat: DisplayStat): stat is ({ type: 'group' } & GroupedStats) => {
    return stat.type === 'group';
  };

  const namedRatio = namedProgress.total > 0 ? (namedProgress.named / namedProgress.total) * 100 : 0;
  const isAllNamed = namedProgress.total > 0 && namedProgress.named === namedProgress.total;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* オーナー単位とグループ単位の切り替え。件数もここに出す */}
          <SegmentedControl
            value={showGrouped}
            onChange={setShowGrouped}
            options={[
              [false, ownerList.actions.byOwner, ownerStats.length],
              [true, ownerList.actions.byGroup, groupedCount],
            ].map(([grouped, label, count]) => ({
              value: grouped as boolean,
              label: (
                <>
                  {label as string}
                  <span className="tabular-nums text-muted-foreground">{(count as number).toLocaleString()}</span>
                </>
              ),
            }))}
          />
          {/* アドレス収集率（アドレス帳に名前があるオーナーの割合） */}
          {namedProgress.total > 0 && (
            <div
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              title={isAllNamed ? ownerList.named.complete : ownerList.named.help}
            >
              {isAllNamed ? <Sparkles className="h-4 w-4 shrink-0" /> : <BookUser className="h-4 w-4 shrink-0" />}
              <div className="w-36 space-y-0.5">
                <div className="flex items-baseline gap-1.5 leading-none">
                  <span className="truncate">{ownerList.named.label}</span>
                  {/* 収集率。やわらかい印象の丸ゴシックで少し大きめに出す */}
                  <span className="ml-auto shrink-0 font-rounded text-sm text-foreground tabular-nums">
                    {Math.round(namedRatio)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/15">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-500"
                    style={{ width: `${namedRatio}%`, backgroundColor: coverageColor(namedRatio) }}
                  />
                </div>
                <div className="text-right text-[10px] leading-none tabular-nums">
                  {ownerList.named.count
                    .replace('{named}', namedProgress.named.toLocaleString())
                    .replace('{total}', namedProgress.total.toLocaleString())}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className='flex items-center space-x-2'>
          {/* 検索（オーナー一覧と同じく、名前・Xアカウント・アドレスが対象） */}
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder={ownerList.search.placeholder}
              className="h-9 pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetchAutoProfile}
            disabled={isFetchingProfile}
            className="gap-2"
          >
            {isFetchingProfile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Image
                src="/images/xrpcafe.jpg"
                alt="xrp.cafe"
                width={16}
                height={16}
                className="object-contain rounded-full"
              />
            )}
            {ownerList.actions.getProfileFromXrpCafe}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {ownerList.actions.exportRank}
          </Button>
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center whitespace-normal">{ownerList.table.rank}</TableHead>
              <TableHead className="min-w-[120px] max-w-[160px] whitespace-normal hidden sm:table-cell">{ownerList.table.owner}</TableHead>
              <TableHead className="min-w-[160px] max-w-[200px] whitespace-normal break-words">
                {ownerList.table.name}
              </TableHead>
              <TableHead className="min-w-[120px] max-w-[160px] whitespace-normal break-words">{ownerList.table.xAccount}</TableHead>
              <TableHead className="min-w-[80px] text-right whitespace-normal">{ownerList.table.nftCount}</TableHead>
              <TableHead className="min-w-[100px] text-right whitespace-normal">{ownerList.table.userValue1}</TableHead>
              <TableHead className="hidden lg:table-cell min-w-[100px] text-right whitespace-normal">{ownerList.table.userValue2}</TableHead>
              <TableHead className="hidden lg:table-cell min-w-[100px] text-right whitespace-normal">{ownerList.table.holdingPercentage}</TableHead>
              {!showGrouped && (
                <TableHead className="min-w-[120px] whitespace-normal">{ownerList.table.links}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map(({ stat, rank }) => (
              <TableRow
                key={stat.type === 'group'
                  ? `group-${stat.groupId}`
                  : `individual-${stat.address}`
                }
                className="group"
                onClick={() => {handleRowClick(stat)}}
              >
                <TableCell className="text-center font-medium">
                  {rank}
                </TableCell>
                <TableCell className="font-mono hidden sm:table-cell">
                  {isGroupedStat(stat) ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{formatAddress(stat.addresses[0])}</span>
                      {stat.addresses.length > 1 &&
                        <span className="text-sm text-gray-500">
                          (+{stat.addresses.length - 1})
                        </span>
                      }
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{formatAddress((stat as OwnerStats).address)}</span>
                      <div className="hidden sm:block">
                        <AddressGroupDialog
                          initialAddresses={[(stat as OwnerStats).address]}
                          groupId={(stat as OwnerStats).group?.id}
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
                    </div>
                  )}
                </TableCell>
                <TableCell className="min-w-[160px] max-w-[200px] whitespace-normal break-words">
                  {isGroupedStat(stat) ? (
                    <>
                      <span className="hidden sm:inline">
                        {(stat as GroupedStats).groupName || '-'}
                      </span>
                      <span className="sm:hidden">
                        {(stat as GroupedStats).groupName || (
                          <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1 rounded">
                            {`${(stat as GroupedStats).groupId?.slice(0, 6)}...${(stat as GroupedStats).groupId?.slice(-4)}`}
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">
                        {(stat as OwnerStats).group?.name || '-'}
                      </span>
                      <span className="sm:hidden">
                        {(stat as OwnerStats).group?.name || (
                          <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1 rounded">
                            {`${(stat as OwnerStats).address.slice(0, 6)}...${(stat as OwnerStats).address.slice(-4)}`}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  {formatXAccount(isGroupedStat(stat) ? (stat as GroupedStats).xAccount : (stat as OwnerStats).group?.xAccount)}
                </TableCell>
                <TableCell className="text-right">
                  {stat.nftCount.toLocaleString()}
                </TableCell>
                <TableCell>
                  {!showGrouped && !isGroupedStat(stat) && editingCell?.address === (stat as OwnerStats).address && editingCell?.field === 'userValue1' ? (
                    <OwnerValueEditor
                      initialValue={(stat as OwnerStats).userValue1}
                      onSave={(value) => handleValueSave((stat as OwnerStats).address, 'userValue1', value)}
                      onCancel={() => setEditingCell(null)}
                    />
                  ) : (
                    <div className="flex items-center justify-end gap-2 min-h-[32px]">
                      <span>{formatValue(isGroupedStat(stat) ? stat.userValue1 : (stat as OwnerStats).userValue1)}</span>
                      {!showGrouped && !isGroupedStat(stat) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCell({ address: (stat as OwnerStats).address, field: 'userValue1' })
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {!showGrouped && !isGroupedStat(stat) && editingCell?.address === (stat as OwnerStats).address && editingCell?.field === 'userValue2' ? (
                    <OwnerValueEditor
                      initialValue={(stat as OwnerStats).userValue2}
                      onSave={(value) => handleValueSave((stat as OwnerStats).address, 'userValue2', value)}
                      onCancel={() => setEditingCell(null)}
                    />
                  ) : (
                    <div className="flex items-center justify-end gap-2 min-h-[32px]">
                      <span>{formatValue(isGroupedStat(stat) ? stat.userValue2 : (stat as OwnerStats).userValue2)}</span>
                      {!showGrouped && !isGroupedStat(stat) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCell({ address: (stat as OwnerStats).address, field: 'userValue2' })
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right">
                  {stat.holdingRatio.toFixed(2)}%
                </TableCell>
                {!showGrouped && !isGroupedStat(stat) && (
                  <TableCell>
                    <NFTSiteWalletIcons 
                      wallet={(stat as OwnerStats).address}
                      issuer={issuer}
                      taxon={taxon}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <OwnerDetailSheet
        owner={selectedOwner}
        initialAddresses={initialAddresses}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onSave={async () => {
          await loadData();
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

export default OwnerList;