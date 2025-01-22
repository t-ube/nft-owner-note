// components/AddressGroupDialog.tsx

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { dbManager, AddressGroup } from '@/utils/db';

interface AddressGroupDialogProps {
  groupId?: string;
  initialAddresses?: string[];
  children: React.ReactNode;
  onSave?: (group: AddressGroup) => void;
}

export function AddressGroupDialog({ 
  groupId, 
  initialAddresses = [], 
  children, 
  onSave 
}: AddressGroupDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [addressGroup, setAddressGroup] = React.useState<Partial<AddressGroup>>({
    name: '',
    xAccount: null,
    memo: null,
    addresses: initialAddresses,
  });
  const [newAddress, setNewAddress] = React.useState('');

  // Load initial data
  React.useEffect(() => {
    const loadGroupInfo = async () => {
      if (groupId) {
        const info = await dbManager.getAddressGroup(groupId);
        if (info) {
          setAddressGroup(info);
        }
      }
    };
    if (open && groupId) {
      loadGroupInfo();
    }
  }, [groupId, open]);

  const handleAddAddress = () => {
    if (newAddress && !addressGroup.addresses?.includes(newAddress)) {
      setAddressGroup(prev => ({
        ...prev,
        addresses: [...(prev.addresses || []), newAddress]
      }));
      setNewAddress('');
    }
  };

  const handleRemoveAddress = (address: string) => {
    setAddressGroup(prev => ({
      ...prev,
      addresses: prev.addresses?.filter(addr => addr !== address) || []
    }));
  };

  const handleSave = async () => {
    if (!addressGroup.name) {
      // 名前は必須
      return;
    }

    try {
      let savedGroup: AddressGroup;
      if (groupId) {
        savedGroup = await dbManager.updateAddressGroup(addressGroup as AddressGroup);
      } else {
        // 新規作成時は空の配列をデフォルトとして設定
        const groupToSave = {
          ...addressGroup,
          addresses: addressGroup.addresses || []
        };
        savedGroup = await dbManager.createAddressGroup(groupToSave as Omit<AddressGroup, 'id' | 'updatedAt'>);
      }
      onSave?.(savedGroup);
      setOpen(false);
    } catch (error) {
      console.error('Failed to save address group:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{groupId ? 'Edit Owner' : 'Create Owner'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Owner Name</Label>
            <Input
              id="name"
              value={addressGroup.name || ''}
              onChange={(e) => setAddressGroup(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter owner name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="xAccount">X Account</Label>
            <Input
              id="xAccount"
              value={addressGroup.xAccount || ''}
              onChange={(e) => setAddressGroup(prev => ({ 
                ...prev, 
                xAccount: e.target.value || null 
              }))}
              placeholder="@username"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="memo">Memo</Label>
            <Input
              id="memo"
              value={addressGroup.memo || ''}
              onChange={(e) => setAddressGroup(prev => ({ 
                ...prev, 
                memo: e.target.value || null 
              }))}
              placeholder="Enter memo"
            />
          </div>
          <div className="grid gap-2">
            <Label>Wallet Addresses</Label>
            <div className="flex gap-2">
              <Input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Enter wallet address"
              />
              <Button variant="outline" onClick={handleAddAddress}>Add</Button>
            </div>
            <div className="space-y-2">
              {addressGroup.addresses?.map((address) => (
                <div key={address} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <span className="flex-1 font-mono text-sm">{address}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAddress(address)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}