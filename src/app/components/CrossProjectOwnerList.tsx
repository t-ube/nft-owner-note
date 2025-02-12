import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Download, Pencil } from 'lucide-react';
import { AddressGroupDialog } from './AddressGroupDialog';
import { BatchUpdateComponent, UpdateProgress } from '@/app/components/BatchUpdateComponent';
import { dbManager, Project, NFToken, AddressGroup, AddressInfo } from '@/utils/db';
import _ from 'lodash';
import Papa from 'papaparse';
import { Dictionary } from '@/i18n/dictionaries/index';

interface AggregatedOwnerStats {
  address: string;
  group: AddressGroup | null;
  projectHoldings: {
    [projectId: string]: number;
  };
  totalNFTs: number;
  holdingRatio: number;
  userValue1: number | null;
  userValue2: number | null;
}

interface GroupedStats {
  groupId: string | null;
  groupName: string | null;
  xAccount: string | null;
  addresses: string[];
  projectHoldings: {
    [projectId: string]: number;
  };
  totalNFTs: number;
  holdingRatio: number;
}

type DisplayStat = 
  | ({ type: 'individual' } & AggregatedOwnerStats)
  | ({ type: 'group' } & GroupedStats);

interface CrossProjectOwnerListProps {
  selectedProjects: Project[];
  lang: string;
  onUpdate: () => Promise<void>;
  isUpdating: boolean;
  updateProgress: UpdateProgress | null;
  dictionary: Dictionary['project']['integration'];
}

const CrossProjectOwnerList: React.FC<CrossProjectOwnerListProps> = ({
  selectedProjects,
  lang,
  onUpdate,
  isUpdating,
  updateProgress,
  dictionary
}) => {
  const [nfts, setNFTs] = useState<Record<string, NFToken[]>>({});
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [showGrouped, setShowGrouped] = useState(false);

  // データの読み込み
  useEffect(() => {
    const loadNFTData = async () => {
      try {
        const nftData: Record<string, NFToken[]> = {};
        for (const project of selectedProjects) {
          const projectNFTs = await dbManager.getNFTsByProjectId(project.projectId);
          nftData[project.projectId] = projectNFTs.filter(nft => !nft.is_burned);
        }
        setNFTs(nftData);

        const [groups, infos] = await Promise.all([
          dbManager.getAllAddressGroups(),
          dbManager.getAllAddressInfos(),
        ]);
        setAddressGroups(_.keyBy(groups, 'id'));
        setAddressInfos(_.keyBy(infos, 'address'));
      } catch (error) {
        console.error('Failed to load NFT data:', error);
      }
    };

    loadNFTData();
  }, [selectedProjects]);

  // NFTの合計数を計算
  const totalNftCount = useMemo(() => 
    _.sum(Object.values(nfts).map(projectNFTs => 
      projectNFTs.filter(nft => !nft.is_burned).length
    )), [nfts]
  );

  // 統計データの集計
  const aggregatedStats = useMemo(() => {
    const stats: Record<string, AggregatedOwnerStats> = {};

    Object.entries(nfts).forEach(([projectId, projectNFTs]) => {
      projectNFTs.forEach(nft => {
        if (!stats[nft.owner]) {
          const addressInfo = addressInfos[nft.owner];
          const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;

          stats[nft.owner] = {
            address: nft.owner,
            group,
            projectHoldings: {},
            totalNFTs: 0,
            holdingRatio: 0,
            userValue1: null,
            userValue2: null
          };
        }

        stats[nft.owner].projectHoldings[projectId] = 
          (stats[nft.owner].projectHoldings[projectId] || 0) + 1;
        stats[nft.owner].totalNFTs += 1;
      });
    });

    const totalNFTs = _.sum(Object.values(stats).map(s => s.totalNFTs));
    Object.values(stats).forEach(stat => {
      stat.holdingRatio = (stat.totalNFTs / totalNFTs) * 100;
    });

    return _.orderBy(Object.values(stats), ['totalNFTs'], ['desc']);
  }, [nfts, addressGroups, addressInfos]);

  // グループ化された統計データ
  const groupedStats = useMemo(() => {
    const groupedOwners = aggregatedStats.filter(stat => stat.group?.id);
    const statsByGroup = _.groupBy(groupedOwners, stat => stat.group?.id);
    
    return Object.entries(statsByGroup).map(([groupId, stats]): GroupedStats => {
      const group = addressGroups[groupId];
      const totalNFTs = _.sumBy(stats, 'totalNFTs');
      const projectHoldings = stats.reduce((acc, stat) => {
        Object.entries(stat.projectHoldings).forEach(([projectId, count]) => {
          acc[projectId] = (acc[projectId] || 0) + count;
        });
        return acc;
      }, {} as { [projectId: string]: number });
      
      return {
        groupId,
        groupName: group?.name || null,
        xAccount: group?.xAccount || null,
        addresses: stats.map(s => s.address),
        projectHoldings,
        totalNFTs,
        holdingRatio: (totalNFTs / totalNftCount) * 100
      };
    }).sort((a, b) => b.totalNFTs - a.totalNFTs);
  }, [aggregatedStats, addressGroups, totalNftCount]);

  // 表示用の統計データ
  const displayStats = useMemo(() => {
    if (!showGrouped) {
      return aggregatedStats.map(stat => ({
        type: 'individual' as const,
        ...stat
      }));
    }

    const groupedStatsList = groupedStats.map(stat => ({
      type: 'group' as const,
      ...stat
    }));

    const ungroupedStats = aggregatedStats
      .filter(stat => !stat.group?.id)
      .map(stat => ({
        type: 'individual' as const,
        ...stat
      }));
    
    return [...groupedStatsList, ...ungroupedStats]
      .sort((a, b) => b.totalNFTs - a.totalNFTs);
  }, [showGrouped, aggregatedStats, groupedStats]);

  // ランクの計算
  const ranks = useMemo(() => {
    const result: (number | string)[] = [];
    let currentRank = 1;
    let currentCount: number | null = null;
    let sameRankCount = 0;
  
    displayStats.forEach((stat) => {
      if (stat.totalNFTs !== currentCount) {
        currentRank = currentRank + sameRankCount;
        currentCount = stat.totalNFTs;
        sameRankCount = 0;
      }
      result.push(currentRank);
      sameRankCount++;
    });
  
    return result;
  }, [displayStats]);

  const isGroupedStat = (stat: DisplayStat): stat is ({ type: 'group' } & GroupedStats) => {
    return stat.type === 'group';
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

  // CSVエクスポート処理
  const handleExportCSV = () => {
    const exportData = displayStats.map((stat, index) => ({
      rank: ranks[index],
      addresses: isGroupedStat(stat) ? stat.addresses : [stat.address],
      addressCount: isGroupedStat(stat) ? stat.addresses.length : 1,
      name: isGroupedStat(stat) ? stat.groupName || '' : stat.group?.name || '',
      xAccount: isGroupedStat(stat) ? stat.xAccount || '' : stat.group?.xAccount || '',
      totalNFTs: stat.totalNFTs,
      holdingPercentage: stat.holdingRatio.toFixed(2),
      ...selectedProjects.reduce((acc, project) => ({
        ...acc,
        [`${project.name}_count`]: stat.projectHoldings[project.projectId] || 0
      }), {})
    }));
  
    const csv = Papa.unparse(exportData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { 
      type: 'text/csv;charset=utf-8;' 
    });
    
    const date = new Date().toISOString().split('T')[0];
    const fileName = showGrouped 
      ? `cross_project_owners_grouped_${date}.csv`
      : `cross_project_owners_${date}.csv`;
  
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  // グループの保存処理
  const handleGroupSave = async (savedGroup: AddressGroup) => {
    setAddressGroups(prev => ({
      ...prev,
      [savedGroup.id]: savedGroup
    }));
    
    const infos = await dbManager.getAllAddressInfos();
    setAddressInfos(_.keyBy(infos, 'address'));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2 sm:px-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="showGrouped"
              checked={showGrouped}
              onCheckedChange={(checked) => setShowGrouped(checked as boolean)}
            />
            <label htmlFor="showGrouped" className="text-sm">
              {dictionary.actions.showGrouped}
            </label>
          </div>
          <div className="text-sm text-gray-500">
            {dictionary.status.showingOwners.replace('{count}', displayStats.length.toString())}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <BatchUpdateComponent
            onUpdate={onUpdate}
            isUpdating={isUpdating}
            progress={updateProgress}
            projects={selectedProjects}
            dictionary={{
              updating: dictionary.actions.updateNFTs,
              projectProgress: dictionary.status.updatingProject,
              complete: dictionary.status.updateComplete
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {dictionary.actions.exportRank}
          </Button>
        </div>
      </div>

      <Card className="mx-[-0.5rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle>{dictionary.table.title}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{dictionary.table.rank}</TableHead>
                  <TableHead className="min-w-[140px]">{dictionary.table.owner}</TableHead>
                  <TableHead className="hidden sm:table-cell">{dictionary.table.name}</TableHead>
                  <TableHead className="hidden sm:table-cell">{dictionary.table.xAccount}</TableHead>
                  <TableHead className="text-right">{dictionary.table.totalNfts}</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{dictionary.table.share}</TableHead>
                  {selectedProjects.map(project => (
                    <TableHead key={project.projectId} className="text-right min-w-[80px]">
                      {project.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayStats.map((stat, index) => (
                  <TableRow 
                    key={isGroupedStat(stat) ? `group-${stat.groupId}` : `individual-${stat.address}`} 
                    className="group"
                  >
                    <TableCell className="font-medium">{ranks[index]}</TableCell>
                    <TableCell className="font-mono">
                      {isGroupedStat(stat) ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{formatAddress(stat.addresses[0])}</span>
                            {stat.addresses.length > 1 &&
                              <span className="text-xs text-gray-500">
                                (+{stat.addresses.length - 1})
                              </span>
                            }
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{formatAddress(stat.address)}</span>
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
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {isGroupedStat(stat) ? stat.groupName || '-' : stat.group?.name || '-'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {formatXAccount(isGroupedStat(stat) ? stat.xAccount : stat.group?.xAccount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {stat.totalNFTs.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {stat.holdingRatio.toFixed(2)}%
                      </TableCell>
                      {selectedProjects.map(project => (
                        <TableCell key={project.projectId} className="text-right">
                          {(stat.projectHoldings[project.projectId] || 0).toLocaleString()}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };
  
  export default CrossProjectOwnerList;