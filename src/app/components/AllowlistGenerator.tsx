import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressGroupDialog } from './AddressGroupDialog';
import { Project, dbManager, AddressGroup, AllowlistEntry, AllowlistRule, NFToken, AddressInfo } from '@/utils/db';
import Papa from 'papaparse';
import { Download, Pencil, Trash2 } from 'lucide-react';
import _ from 'lodash';
import OwnerValueEditor from '@/app/components/OwnerValueEditor';
import { Dictionary } from '@/i18n/dictionaries/index';

interface AllowlistEditorProps {
  selectedProjects: Project[];
  dict: Dictionary;
  lang: string;
}

const AllowlistGenerator: React.FC<AllowlistEditorProps> = ({
  selectedProjects,
  dict,
  lang
}) => {
  const [entries, setEntries] = useState<Record<string, AllowlistEntry>>({});
  const [editingMints, setEditingMints] = useState<string | null>(null);
  const [nfts, setNFTs] = useState<NFToken[]>([]);
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [rules, setRules] = useState<AllowlistRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(true);

  // Load NFTs and address data
  useEffect(() => {
    const loadData = async () => {
      // Load NFTs from all selected projects
      const allNFTs = await Promise.all(
        selectedProjects.map(project => 
          dbManager.getNFTsByProjectId(project.projectId)
        )
      );
      setNFTs(allNFTs.flat().filter(nft => !nft.is_burned));

      // Load address groups and infos
      const [groups, infos] = await Promise.all([
        dbManager.getAllAddressGroups(),
        dbManager.getAllAddressInfos(),
      ]);
      setAddressGroups(_.keyBy(groups, 'id'));
      setAddressInfos(_.keyBy(infos, 'address'));
    };
    loadData();
  }, [selectedProjects]);

  useEffect(() => {
    const loadEntries = async () => {
      const allEntries = await dbManager.getAllowlistEntries();
      setEntries(_.keyBy(allEntries, 'address'));
    };
    loadEntries();
  }, []);

  useEffect(() => {
    const loadRules = async () => {
      try {
        const savedRules = await dbManager.getAllowlistRules();
        if (savedRules.length > 0) {
          setRules(savedRules);
        } else {
          setRules([
            { id: '', minNFTs: 5, mintCount: 2, updatedAt: 0 },
            { id: '', minNFTs: 1, mintCount: 1, updatedAt: 0 }
          ]);
        }
      } catch (error) {
        console.error('Failed to load allowlist rules:', error);
        setRules([
          { id: '', minNFTs: 5, mintCount: 2, updatedAt: 0 },
          { id: '', minNFTs: 1, mintCount: 1, updatedAt: 0 }
        ]);
      } finally {
        setIsLoadingRules(false);
      }
    };
    loadRules();
  }, []);

  useEffect(() => {
    const saveRules = async () => {
      const rulesToSave = rules.map(({ minNFTs, mintCount }) => ({
        minNFTs,
        mintCount
      }));
      await dbManager.saveAllowlistRules(rulesToSave);
    };
    saveRules();
  }, [rules]);

  const ownerStats = useMemo(() => {
    const ownerNFTs = _.groupBy(nfts, 'owner');
    
    return Object.entries(ownerNFTs).map(([address, ownerNFTs]) => {
      const addressInfo = addressInfos[address];
      const group = addressInfo?.groupId ? addressGroups[addressInfo.groupId] : null;
      
      return {
        address,
        group,
        totalNFTs: ownerNFTs.length,
      };
    }).sort((a, b) => b.totalNFTs - a.totalNFTs || a.address.localeCompare(b.address));
  }, [nfts, addressGroups, addressInfos]);

  const applyRules = async () => {
    const newEntries: Record<string, AllowlistEntry> = {};
    const sortedRules = _.orderBy(rules, ['minNFTs'], ['desc']);
    
    ownerStats.forEach(stat => {
      const matchingRule = sortedRules.find(rule => stat.totalNFTs >= rule.minNFTs);
      if (matchingRule) {
        newEntries[stat.address] = {
          id: stat.address,
          address: stat.address,
          mints: matchingRule.mintCount,
          updatedAt: Date.now()
        };
      }
    });

    const savedEntries = await Promise.all(
      Object.values(newEntries).map(entry => 
        dbManager.setAllowlistEntry(entry.address, entry.mints)
      )
    );

    setEntries(_.keyBy(savedEntries, 'address'));
  };

  const handleMintEdit = async (address: string, mints: number) => {
    const entry = await dbManager.setAllowlistEntry(address, mints);
    setEntries(prev => ({
      ...prev,
      [address]: entry
    }));
    setEditingMints(null);
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  const handleExportCSV = () => {
    const exportData = ownerStats
      .filter(stat => entries[stat.address]?.mints > 0)
      .map(stat => ({
        address: stat.address,
        mints: entries[stat.address].mints,
      }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const date = new Date().toISOString().split('T')[0];
    const fileName = `allowlist_${date}.csv`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleClear = async () => {
    await dbManager.clearAllowlist();
    setEntries({});
  };

  const handleGroupSave = async (savedGroup: AddressGroup) => {
    setAddressGroups(prev => ({
      ...prev,
      [savedGroup.id]: savedGroup
    }));
    const infos = await dbManager.getAllAddressInfos();
    setAddressInfos(_.keyBy(infos, 'address'));
  };

  if (!dict) return null;
  const t = dict.project.allowlist;

  return (
    <div className="space-y-4">
      <div className="border rounded p-4 space-y-4">
        <h3 className="font-medium">{t.ruleSettings}</h3>
        {isLoadingRules ? (
          <div className="h-24 flex items-center justify-center">
            <div className="text-sm text-gray-500">{t.loadingRules}</div>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, index) => (
            <div key={index} className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{t.minNFTs}</span>
                <Input
                  type="number"
                  min="1"
                  value={rule.minNFTs}
                  onChange={e => {
                    const newRules = [...rules];
                    newRules[index].minNFTs = parseInt(e.target.value);
                    setRules(newRules);
                  }}
                  className="w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{t.mintCount}</span>
                <Input
                  type="number"
                  min="1"
                  value={rule.mintCount}
                  onChange={e => {
                    const newRules = [...rules];
                    newRules[index].mintCount = parseInt(e.target.value);
                    setRules(newRules);
                  }}
                  className="w-24"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newRules = rules.filter((_, i) => i !== index);
                  setRules(newRules);
                }}
              >
                {t.removeRule}
              </Button>
            </div>
          ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRules([...rules, { id: '', minNFTs: 1, mintCount: 1, updatedAt: 0 }])}
              className="mt-2"
            >
              {t.addRule}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {t.status.total.replace('{count}', Object.keys(entries).length.toLocaleString())}
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={applyRules}
          >
            {t.applyRules}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={Object.keys(entries).length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            {t.export}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={Object.keys(entries).length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t.clear}
          </Button>
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">{t.address}</TableHead>
              <TableHead className="w-40">{t.name}</TableHead>
              <TableHead className="w-32 text-right">{t.totalNFTs}</TableHead>
              <TableHead className="w-32 text-right">{t.mints}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownerStats.map((stat) => (
              <TableRow key={stat.address} className="group">
                <TableCell className="font-mono">
                  <div className="flex items-center gap-2">
                    <span>{formatAddress(stat.address)}</span>
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
                <TableCell className="text-right">
                  {stat.totalNFTs.toLocaleString()}
                </TableCell>
                <TableCell>
                {editingMints === stat.address ? (
                  <OwnerValueEditor
                    initialValue={entries[stat.address]?.mints || 0}
                    onSave={async (value) => {
                      if (value !== null) {
                        await handleMintEdit(stat.address, value);
                      }
                      setEditingMints(null);
                    }}
                    onCancel={() => setEditingMints(null)}
                  />
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    <span>{entries[stat.address]?.mints || 0}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        setEditingMints(stat.address);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

    </div>
  );
};

export default AllowlistGenerator;