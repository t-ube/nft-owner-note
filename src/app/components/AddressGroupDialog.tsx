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
import { X, Copy, Check } from "lucide-react";
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
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
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
    const trimmedAddress = newAddress.trim();
    if (trimmedAddress && !addressGroup.addresses?.includes(trimmedAddress)) {
      setAddressGroup(prev => ({
        ...prev,
        addresses: [...(prev.addresses || []), trimmedAddress]
      }));
      setNewAddress('');
    }
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
        // アドレス全体に対してもtrimを適用
        const trimmedAddresses = addressGroup.addresses?.map(addr => addr.trim()) || [];
        savedGroup = await dbManager.updateAddressGroup({
          ...addressGroup,
          addresses: trimmedAddresses
        } as AddressGroup);
      } else {
        // 新規作成時も同様にtrimを適用
        const groupToSave = {
          ...addressGroup,
          addresses: addressGroup.addresses?.map(addr => addr.trim()) || []
        };
        savedGroup = await dbManager.createAddressGroup(groupToSave as Omit<AddressGroup, 'id' | 'updatedAt'>);
      }
      
      // 拡張機能に通知
      window.postMessage({ type: 'OWNERNOTE_UPDATED' }, '*');

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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyAddress(address)}
                      className="h-8 w-8 dark:hover:bg-gray-600"
                    >
                      {copiedAddress === address ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAddress(address)}
                      className="h-8 w-8 dark:hover:bg-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
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