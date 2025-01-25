// components/AddressGroupDialog.tsx

import React, { useEffect, useState } from 'react';
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
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface AddressGroupDialogProps {
  groupId?: string;
  initialAddresses?: string[];
  children: React.ReactNode;
  onSave?: (group: AddressGroup) => void;
  lang: string;
}

export function AddressGroupDialog({ 
  groupId, 
  initialAddresses = [], 
  children, 
  onSave,
  lang
}: AddressGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [addressGroup, setAddressGroup] = useState<Partial<AddressGroup>>({
    name: '',
    xAccount: null,
    memo: null,
    addresses: initialAddresses,
  });
  const [newAddress, setNewAddress] = useState('');
  const [dict, setDict] = useState<Dictionary | null>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  // Load initial data
  useEffect(() => {
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

  if (!dict) return null;

  const { dialog: t } = dict.project.owners;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {groupId ? t.title.edit : t.title.create}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t.labels.ownerName}</Label>
            <Input
              id="name"
              value={addressGroup.name || ''}
              onChange={(e) => setAddressGroup(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t.placeholders.name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="xAccount">{t.labels.xAccount}</Label>
            <Input
              id="xAccount"
              value={addressGroup.xAccount || ''}
              onChange={(e) => setAddressGroup(prev => ({ 
                ...prev, 
                xAccount: e.target.value || null 
              }))}
              placeholder={t.placeholders.xAccount}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="memo">{t.labels.memo}</Label>
            <Input
              id="memo"
              value={addressGroup.memo || ''}
              onChange={(e) => setAddressGroup(prev => ({ 
                ...prev, 
                memo: e.target.value || null 
              }))}
              placeholder={t.placeholders.memo}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t.labels.walletAddresses}</Label>
            <div className="flex gap-2">
              <Input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder={t.placeholders.address}
              />
              <Button variant="outline" onClick={handleAddAddress}>{t.actions.add}</Button>
            </div>
            <div className="space-y-2">
              {addressGroup.addresses?.map((address) => (
                <div key={address} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className="flex-1 font-mono text-sm dark:text-gray-200">{address}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAddress(address)}
                    className="dark:hover:bg-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave}>{t.actions.save}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}