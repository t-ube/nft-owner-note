import React, { useState, useEffect } from 'react';
import { 
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Users, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Pencil, Copy, Check } from 'lucide-react';
import { AddressGroupDialog } from '@/app/components/AddressGroupDialog';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import { Alert, AlertDescription } from "@/components/ui/alert";
import CSVImportExport from '@/app/components/CSVImportExport';
import _ from 'lodash';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

type SortField = 'name' | 'addresses' | 'xAccount' | 'userValue1' | 'userValue2' | 'updatedAt';
type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

interface OwnersPageProps {
  lang: string;
}

const OwnersPage: React.FC<OwnersPageProps> = ({ lang }) => {
  const [owners, setOwners] = useState<AddressGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sort, setSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [, setAddressGroups] = React.useState<Record<string, AddressGroup>>({});
  const [, setAddressInfos] = React.useState<Record<string, AddressInfo>>({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ownerToDelete, setOwnerToDelete] = useState<AddressGroup | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  // データ読み込み関数
  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [groups, infos] = await Promise.all([
        dbManager.getAllAddressGroups(),
        dbManager.getAllAddressInfos(),
      ]);
      setOwners(groups);
      setAddressGroups(_.keyBy(groups, 'id'));
      setAddressInfos(_.keyBy(infos, 'address'));
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleSort = (field: SortField) => {
    setSort(prev => ({
      field,
      direction: 
        prev.field === field
          ? prev.direction === null 
            ? 'asc'
            : prev.direction === 'asc'
              ? 'desc'
              : null
          : 'asc'
    }));
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleGroupSave = async () => {
    await loadData();
  };

  const getSortedOwners = () => {
    if (!sort.direction) return owners;
  
    return _.orderBy(
      owners,
      [
        owner => {
          const value = (() => {
            switch (sort.field) {
              case 'name':
                return owner.name;
              case 'addresses':
                return owner.addresses.length;
              case 'xAccount':
                return owner.xAccount;
              case 'updatedAt':
                return owner.updatedAt;
              default:
                return owner.name;
            }
          })();
          return value ? 0 : 1;
        },
        owner => {
          switch (sort.field) {
            case 'name':
              return owner.name.toLowerCase();
            case 'addresses':
              return owner.addresses.length;
            case 'xAccount':
              return (owner.xAccount || '').toLowerCase();
            case 'updatedAt':
              return owner.updatedAt;
            default:
              return owner.name.toLowerCase();
          }
        }
      ],
      ['asc', sort.direction]
    );
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

  const filteredOwners = getSortedOwners().filter(owner =>
    owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    owner.xAccount?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    owner.addresses.some(addr => addr.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    if (sort.direction === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
    if (sort.direction === 'desc') return <ArrowDown className="ml-2 h-4 w-4" />;
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead className={field.startsWith('userValue') ? 'w-24' : ''}>
      <Button
        variant="ghost"
        onClick={() => handleSort(field)}
        className="h-8 p-0 font-semibold hover:bg-transparent"
      >
        {children}
        <SortIcon field={field} />
      </Button>
    </TableHead>
  );

  const handleDeleteClick = (owner: AddressGroup) => {
    setOwnerToDelete(owner);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (ownerToDelete) {
      try {
        await dbManager.deleteAddressGroup(ownerToDelete.id);
        await loadData();
      } catch (error) {
        console.error('Failed to delete owner:', error);
      }
    }
    setIsDeleteDialogOpen(false);
    setOwnerToDelete(null);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{dict?.project.owners.loading}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!dict) return null;

  const { owners: t } = dict.project;

  return (
    <div className="p-4 lg:p-8">
      <Card>
        <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t.title}
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              ({filteredOwners.length} {searchTerm ? t.matchingOwners : t.totalOwners})
            </span>
          </div>
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 pointer-events-none" />
              <Input
                placeholder={t.search.placeholder}
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <AddressGroupDialog onSave={handleGroupSave} lang={lang}>
                <Button className="flex-1 lg:flex-none">
                  <Plus className="h-4 w-4 mr-2" />
                  {t.actions.newOwner}
                </Button>
              </AddressGroupDialog>
              <CSVImportExport onGroupsUpdated={loadData} lang={lang} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="name">{t.table.ownerName}</SortableHeader>
                <SortableHeader field="addresses">{t.table.walletAddresses}</SortableHeader>
                <SortableHeader field="xAccount">{t.table.xAccount}</SortableHeader>
                <TableHead>{t.table.memo}</TableHead>
                <TableHead>{t.table.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOwners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell>{owner.name}</TableCell>
                  <TableCell>
                    {owner.addresses.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono">
                          {`${owner.addresses[0].substring(0, 4)}...${owner.addresses[0].substring(owner.addresses[0].length - 4)}`}
                          {owner.addresses.length > 1 && (
                            <span className="text-gray-500 ml-1">
                              (+{owner.addresses.length - 1})
                            </span>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleCopyAddress(owner.addresses[0])}
                        >
                          {copiedAddress === owner.addresses[0] ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{formatXAccount(owner.xAccount)}</TableCell>
                  <TableCell>{owner.memo || '-'}</TableCell>
                  <TableCell>
                    <AddressGroupDialog
                      groupId={owner.id}
                      onSave={handleGroupSave}
                      lang={lang}
                    >
                      <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil className="h-4 w-4" />
                      </Button>
                    </AddressGroupDialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteClick(owner)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

export default OwnersPage;