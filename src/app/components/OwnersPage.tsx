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
import { Search, Plus, Users, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Pencil } from 'lucide-react';
import { AddressGroupDialog } from '@/app/components/AddressGroupDialog';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import { Alert, AlertDescription } from "@/components/ui/alert";
import CSVImportExport from '@/app/components/CSVImportExport';
import _ from 'lodash';

type SortField = 'name' | 'addresses' | 'xAccount' | 'userValue1' | 'userValue2' | 'updatedAt';
type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const OwnersPage: React.FC = () => {
  const [owners, setOwners] = useState<AddressGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sort, setSort] = useState<SortState>({ field: 'updatedAt', direction: 'desc' });
  const [, setAddressGroups] = React.useState<Record<string, AddressGroup>>({});
  const [, setAddressInfos] = React.useState<Record<string, AddressInfo>>({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [ownerToDelete, setOwnerToDelete] = useState<AddressGroup | null>(null);
  
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

  const handleGroupSave = async () => {
    await loadData();
  };

  const getSortedOwners = () => {
    if (!sort.direction) return owners;

    return _.orderBy(
      owners,
      [owner => {
        switch (sort.field) {
          case 'name':
            return owner.name.toLowerCase();
          case 'addresses':
            return owner.addresses.length;
          case 'xAccount':
            return (owner.xAccount || '').toLowerCase();
          case 'userValue1':
            return owner.userValue1 || -Infinity;
          case 'userValue2':
            return owner.userValue2 || -Infinity;
          case 'updatedAt':
            return owner.updatedAt;
          default:
            return owner.name.toLowerCase();
        }
      }],
      [sort.direction]
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
          <AlertDescription>Loading owners...</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Owners List
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 pointer-events-none" />
              <Input
                placeholder="Search owners..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <AddressGroupDialog onSave={handleGroupSave}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Owner
              </Button>
            </AddressGroupDialog>
            <CSVImportExport onGroupsUpdated={loadData} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="name">Owner Name</SortableHeader>
                <SortableHeader field="addresses">Wallet Addresses</SortableHeader>
                <SortableHeader field="xAccount">X Account</SortableHeader>
                <TableHead>Memo</TableHead>
                <SortableHeader field="userValue1">User Value 1</SortableHeader>
                <SortableHeader field="userValue2">User Value 2</SortableHeader>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOwners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell>{owner.name}</TableCell>
                  <TableCell>
                    {owner.addresses.length > 0 ? (
                      <span className="font-mono">
                        {`${owner.addresses[0].substring(0, 4)}...${owner.addresses[0].substring(owner.addresses[0].length - 4)}`}
                        {owner.addresses.length > 1 && (
                          <span className="text-gray-500 ml-1">
                            (+{owner.addresses.length - 1})
                          </span>
                        )}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{formatXAccount(owner.xAccount)}</TableCell>
                  <TableCell>{owner.memo || '-'}</TableCell>
                  <TableCell className="w-24">{owner.userValue1 || '-'}</TableCell>
                  <TableCell className="w-24">{owner.userValue2 || '-'}</TableCell>
                  <TableCell>
                    <AddressGroupDialog
                      groupId={owner.id}
                      onSave={handleGroupSave}
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
            <AlertDialogTitle>Delete Owner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {ownerToDelete?.name}? 
              This will remove the owner name from all associated addresses.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OwnersPage;