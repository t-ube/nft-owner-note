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
import { AddressGroupDialog } from './AddressGroupDialog';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import NFTSiteWalletIcons from '@/app/components/NFTSiteWalletIcons';
import Papa from 'papaparse';
import { Download } from 'lucide-react';
import { Pencil, Loader2 } from "lucide-react";
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

interface OwnerListProps {
  lang: string;
  issuer: string;
  taxon: string;
}

const OwnerList: React.FC<OwnerListProps> = ({ lang, issuer, taxon }) => {
  const { nfts, hasMore } = useNFTContext();
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [editingCell, setEditingCell] = useState<{ address: string; field: 'userValue1' | 'userValue2' } | null>(null);
  const [ownerValues, setOwnerValues] = useState<Record<string, { userValue1: number | null; userValue2: number | null }>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);

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

  // 初期データ読み込み
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

  // Calculate owner statistics
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

  // ランク計算用の関数
  const calculateRank = useCallback((stats: OwnerStats[]): (number | string)[] => {
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

  const ranks = useMemo(() => calculateRank(ownerStats), [ownerStats, calculateRank]);

  const handleExportCSV = () => {
    // CSV用のデータを準備
    const csvData = ownerStats.map((stat, index) => ({
      rank: ranks[index],
      address: stat.address,
      name: stat.group?.name || '',
      xAccount: stat.group?.xAccount || '',
      nftCount: stat.nftCount,
      userValue1: stat.userValue1 ?? '',
      userValue2: stat.userValue2 ?? '',
      holdingPercentage: stat.holdingRatio.toFixed(2),
    }));

    // Generate CSV
    const csv = Papa.unparse(csvData);
    
    // Add BOM for UTF-8
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    
    // Create and trigger download
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `owners_rank_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGroupSave = async (savedGroup: AddressGroup) => {
    setAddressGroups(prev => ({
      ...prev,
      [savedGroup.id]: savedGroup
    }));
    
    // アドレス情報も更新
    const infos = await dbManager.getAllAddressInfos();
    setAddressInfos(_.keyBy(infos, 'address'));
  };

  // Format address
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-gray-500 space-y-1">
          <div>
            {ownerList.status.showingOwners.replace('{count}', ownerStats.length.toLocaleString())}
            {hasMore && (
              <span className="ml-2 inline-flex items-center gap-1 text-gray-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                {ownerList.status.loadingMore}
              </span>
            )}
          </div>
          <div>
            {ownerList.status.totalNFTs.replace('{count}', (nfts.length - burnedCount).toLocaleString())}
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
              <TableHead className="w-32 text-center">{ownerList.table.userValue1}</TableHead>
              <TableHead className="hidden lg:table-cell w-32 text-center">{ownerList.table.userValue2}</TableHead>
              <TableHead className="hidden lg:table-cell w-32 text-right">{ownerList.table.holdingPercentage}</TableHead>
              <TableHead className="w-40">{ownerList.table.links}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownerStats.map((stat, index) => (
              <TableRow key={stat.address} className="group">
                <TableCell className="text-center font-medium">
                  {ranks[index]}
                </TableCell>
                <TableCell className="font-mono">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{formatAddress(stat.address)}</span>
                    <AddressGroupDialog
                      initialAddresses={[stat.address]}
                      groupId={stat.group?.id}
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
                </TableCell>
                <TableCell>
                  {stat.group?.name || '-'}
                </TableCell>
                <TableCell>
                  {formatXAccount(stat.group?.xAccount)}
                </TableCell>
                <TableCell className="text-right">
                  {stat.nftCount.toLocaleString()}
                </TableCell>
                <TableCell>
                  {editingCell?.address === stat.address && editingCell?.field === 'userValue1' ? (
                    <OwnerValueEditor
                      initialValue={stat.userValue1}
                      onSave={(value) => handleValueSave(stat.address, 'userValue1', value)}
                      onCancel={() => setEditingCell(null)}
                    />
                  ) : (
                    <div className="flex items-center justify-end gap-2 min-h-[32px]">
                      <span>{formatValue(stat.userValue1)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => setEditingCell({ address: stat.address, field: 'userValue1' })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {editingCell?.address === stat.address && editingCell?.field === 'userValue2' ? (
                    <OwnerValueEditor
                      initialValue={stat.userValue2}
                      onSave={(value) => handleValueSave(stat.address, 'userValue2', value)}
                      onCancel={() => setEditingCell(null)}
                    />
                  ) : (
                    <div className="flex items-center justify-end gap-2 min-h-[32px]">
                      <span>{formatValue(stat.userValue2)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => setEditingCell({ address: stat.address, field: 'userValue2' })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right">
                  {stat.holdingRatio.toFixed(2)}%
                </TableCell>
                <TableCell>
                  <NFTSiteWalletIcons wallet={stat.address} issuer={issuer} taxon={taxon} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OwnerList;