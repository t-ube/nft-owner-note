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
import { Download, Pencil } from 'lucide-react';
import { AddressGroupDialog } from './AddressGroupDialog';
import { BatchUpdateComponent, UpdateProgress } from '@/app/components/BatchUpdateComponent';
import { dbManager, Project, NFToken, AddressGroup, AddressInfo } from '@/utils/db';
import { useSyncSession } from '@/app/contexts/SyncSessionContext';
import _ from 'lodash';
import Papa from 'papaparse';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { OwnerDetailSheet } from '@/app/components/OwnerDetailSheet';

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
}

const CrossProjectOwnerList: React.FC<CrossProjectOwnerListProps> = ({
  selectedProjects,
  lang,
  onUpdate,
  isUpdating,
  updateProgress
}) => {
  const [nfts, setNFTs] = useState<Record<string, NFToken[]>>({});
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [showGrouped, setShowGrouped] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ownerToDelete, setOwnerToDelete] = useState<AddressGroup | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<AddressGroup | null>(null);
  const [initialAddresses, setInitialAddresses] = useState<string[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const { syncCompleteCount } = useSyncSession();

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const loadAddressData = async () => {
    const [groups, infos] = await Promise.all([
      dbManager.getAllAddressGroups(),
      dbManager.getAllAddressInfos(),
    ]);
    setAddressGroups(_.keyBy(groups, 'id'));
    setAddressInfos(_.keyBy(infos, 'address'));
  };

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

        await loadAddressData();
      } catch (error) {
        console.error('Failed to load NFT data:', error);
      }
    };

    loadNFTData();
  }, [selectedProjects, syncCompleteCount]);

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
        className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 hover:underline transition-all"
        onClick={(e) => e.stopPropagation()}
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

  const handleDeleteConfirm = async () => {
    if (ownerToDelete) {
      try {
        await dbManager.deleteAddressGroup(ownerToDelete.id);
        await loadAddressData();

        setIsDetailOpen(false);

        window.postMessage({ type: 'OWNERNOTE_UPDATED' }, '*');
      } catch (error) {
        console.error('Failed to delete owner:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setOwnerToDelete(null);
  };

  const handleRowClick = (stat: DisplayStat) => {
    if (isGroupedStat(stat)) return;

    if (stat.group) {
      setSelectedOwner(stat.group);
      setInitialAddresses([]);
    } else {
      setSelectedOwner(null);
      setInitialAddresses([stat.address]);
    }
    setIsDetailOpen(true);
  };

  if (!dict) return null;

  const { integration: integrationText } = dict.project;

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
              {integrationText.actions.showGrouped}
            </label>
          </div>
          <div className="text-sm text-gray-500">
            {integrationText.status.showingOwners.replace('{count}', displayStats.length.toString())}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <BatchUpdateComponent
            onUpdate={onUpdate}
            isUpdating={isUpdating}
            progress={updateProgress}
            projects={selectedProjects}
            dictionary={{
              updating: integrationText.actions.updateNFTs,
              projectProgress: integrationText.status.updatingProject,
              complete: integrationText.status.updateComplete
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {integrationText.actions.exportRank}
          </Button>
        </div>
      </div>

      <Card className="mx-[-0.5rem] sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle>{integrationText.table.title}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center whitespace-normal">{integrationText.table.rank}</TableHead>
                  <TableHead className="min-w-[140px] max-w-[200px] whitespace-normal">{integrationText.table.owner}</TableHead>
                  <TableHead className="min-w-[160px] max-w-[200px] whitespace-normal break-words hidden lg:table-cell">{integrationText.table.name}</TableHead>
                  <TableHead className="min-w-[120px] max-w-[160px] whitespace-normal break-words">{integrationText.table.xAccount}</TableHead>
                  <TableHead className="min-w-[80px] text-right whitespace-normal">{integrationText.table.totalNfts}</TableHead>
                  <TableHead className="min-w-[80px] text-right hidden sm:table-cell whitespace-normal">{integrationText.table.share}</TableHead>
                  {selectedProjects.map(project => (
                    <TableHead 
                      key={project.projectId} 
                      className="min-w-[100px] max-w-[160px] text-right whitespace-normal break-words px-4"
                    >
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
                    onClick={() => {
                      if (window.innerWidth < 640) {
                        handleRowClick(stat);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{ranks[index]}</TableCell>
                    <TableCell className="font-mono hidden lg:table-cell">
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
                    <TableCell>
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
                            {(stat as AggregatedOwnerStats).group?.name || '-'}
                          </span>
                          <span className="sm:hidden">
                            {(stat as AggregatedOwnerStats).group?.name || (
                              <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1 rounded">
                                {`${(stat as AggregatedOwnerStats).address.slice(0, 6)}...${(stat as AggregatedOwnerStats).address.slice(-4)}`}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="table-cell">
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

      <OwnerDetailSheet
        owner={selectedOwner}
        initialAddresses={initialAddresses}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onSave={async () => {
          await loadAddressData();
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
  
  export default CrossProjectOwnerList;