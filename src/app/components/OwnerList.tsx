import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AddressGroupDialog } from './AddressGroupDialog';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import NFTSiteWalletIcons from '@/app/components/NFTSiteWalletIcons';
import Papa from 'papaparse';
import { Download, Pencil, Loader2 } from "lucide-react";
import OwnerValueEditor from '@/app/components/OwnerValueEditor';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

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

const OwnerList: React.FC<OwnerListProps> = ({ lang, issuer, taxon }) => {
  const { nfts, hasMore } = useNFTContext();
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [editingCell, setEditingCell] = useState<{ address: string; field: 'userValue1' | 'userValue2' } | null>(null);
  const [ownerValues, setOwnerValues] = useState<Record<string, { userValue1: number | null; userValue2: number | null }>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [showGrouped, setShowGrouped] = useState(false);

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

  const handleValueSave = async (address: string, field: 'userValue1' | 'userValue2', value: number | null) => {
    if (!projectId) return;

    try {
      await dbManager.setProjectOwnerValues(projectId, address, {
        [field]: value
      });

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
  

  // グループ表示時のデータ作成
  const createGroupedExportData = (
    groupedStats: GroupedStats[],
    ungroupedStats: OwnerStats[],
    ranks: (number | string)[]
  ): GroupedExportData[] => {
    // グループ化されたデータの作成
    const groupedData = groupedStats.map((stat, index) => ({
      rank: ranks[index],
      addresses: stat.addresses,
      addressCount: stat.addresses.length,
      name: stat.groupName || 'Ungrouped',
      xAccount: stat.xAccount || '',
      nftCount: stat.nftCount,
      userValue1: stat.userValue1,
      userValue2: stat.userValue2,
      holdingPercentage: stat.holdingRatio.toFixed(2),
    }));
  
    // グループ化されていないデータの作成
    const ungroupedData = ungroupedStats.map((stat, index) => ({
      rank: ranks[index + groupedStats.length],
      addresses: [stat.address],
      addressCount: 1,
      name: '-',
      xAccount: stat.group?.xAccount || '',
      nftCount: stat.nftCount,
      userValue1: stat.userValue1 || 0,
      userValue2: stat.userValue2 || 0,
      holdingPercentage: stat.holdingRatio.toFixed(2),
    }));
  
    return [...groupedData, ...ungroupedData];
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
        className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
      >
        @{username}
      </a>
    );
  };

  const burnedCount = nfts.filter(nft => nft.is_burned).length;

  if (!dict) return null;

  const { ownerList } = dict.project.detail;

  const isGroupedStat = (stat: DisplayStat): stat is ({ type: 'group' } & GroupedStats) => {
    return stat.type === 'group';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
          <Checkbox
            id="showGrouped"
            checked={showGrouped}
            onCheckedChange={(checked) => setShowGrouped(checked as boolean)}
          />
            <label htmlFor="showGrouped" className="text-sm">
              {ownerList.actions.showGrouped}
            </label>
          </div>
          <div className="text-sm text-gray-500">
            {ownerList.status.showingOwners.replace('{count}', displayStats.length.toLocaleString())}
            {hasMore && (
              <span className="ml-2 inline-flex items-center gap-1 text-gray-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                {ownerList.status.loadingMore}
              </span>
            )}
          </div>
        </div>
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

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{ownerList.table.rank}</TableHead>
              <TableHead className="w-40">{ownerList.table.owner}</TableHead>
              <TableHead className="w-40">{ownerList.table.name}</TableHead>
              <TableHead className="w-40">{ownerList.table.xAccount}</TableHead>
              <TableHead className="w-32 text-right">{ownerList.table.nftCount}</TableHead>
              <TableHead className="w-32 text-right">{ownerList.table.userValue1}</TableHead>
              <TableHead className="hidden lg:table-cell w-32 text-right">{ownerList.table.userValue2}</TableHead>
              <TableHead className="hidden lg:table-cell w-32 text-right">{ownerList.table.holdingPercentage}</TableHead>
              {!showGrouped && (
                <TableHead className="w-40">{ownerList.table.links}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayStats.map((stat, index) => (
              <TableRow 
                key={stat.type === 'group' 
                  ? `group-${stat.groupId}` 
                  : `individual-${stat.address}`
                } 
                className="group"
              >
                <TableCell className="text-center font-medium">
                  {ranks[index]}
                </TableCell>
                <TableCell className="font-mono">
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
                  )}
                </TableCell>
                <TableCell>
                  {isGroupedStat(stat) ? (stat as GroupedStats).groupName || '-' : (stat as OwnerStats).group?.name || '-'}
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
                          onClick={() => setEditingCell({ address: (stat as OwnerStats).address, field: 'userValue1' })}
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
                          onClick={() => setEditingCell({ address: (stat as OwnerStats).address, field: 'userValue2' })}
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
    </div>
  );
};

export default OwnerList;