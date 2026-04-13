import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil, Trash2, Check, Copy, X, ExternalLink } from 'lucide-react';
import { dbManager, AddressGroup } from '@/utils/db';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface OwnerDetailSheetProps {
  owner: AddressGroup | null;
  initialAddresses?: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => Promise<void>;
  onDelete: (owner: AddressGroup) => void;
  lang: string;
}

export const OwnerDetailSheet: React.FC<OwnerDetailSheetProps> = ({
  owner,
  initialAddresses = [],
  isOpen,
  onOpenChange,
  onSave,
  onDelete,
  lang,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<Partial<AddressGroup>>({});
  const [newAddress, setNewAddress] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  useEffect(() => {
    if (isOpen) {
      if (owner) {
        setEditedData(owner);
        setIsEditing(false);
      } else {
        const baseData = {
          name: '',
          addresses: initialAddresses,
          xAccount: null,
          memo: null
        };
        setEditedData(baseData);
        setIsEditing(true);
      }
      setNewAddress('');
    }
  }, [owner, isOpen, initialAddresses]);

  const handleBack = () => {
    if (!owner) {
      onOpenChange(false);
    } else if (isEditing) {
      setEditedData(owner);
      setIsEditing(false);
      setNewAddress('');
    } else {
      onOpenChange(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddAddress = () => {
    const trimmed = newAddress.trim();
    if (trimmed && !editedData.addresses?.includes(trimmed)) {
      setEditedData(prev => ({
        ...prev,
        addresses: [...(prev.addresses || []), trimmed]
      }));
      setNewAddress('');
    }
  };

  const handleRemoveAddress = (addr: string) => {
    setEditedData(prev => ({
      ...prev,
      addresses: prev.addresses?.filter(a => a !== addr)
    }));
  };

  const handleSave = async () => {
    if (!editedData.name) return;
    try {
      const dataToSave = {
        ...editedData,
        addresses: editedData.addresses?.map(a => a.trim()) || []
      };

      if (owner) {
        await dbManager.updateAddressGroup(dataToSave as AddressGroup);
        window.postMessage({ type: 'OWNERNOTE_UPDATED' }, '*');
      } else {
        await dbManager.createAddressGroup(dataToSave as Omit<AddressGroup, 'id' | 'updatedAt'>);
        window.postMessage({ type: 'OWNERNOTE_UPDATED' }, '*');
        onOpenChange(false);
      }

      await onSave();
      setIsEditing(false);
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  if (!dict) return null;
  const { dialog: t } = dict.project.owners;

  const isNew = !owner;
  const xUsername = editedData.xAccount?.startsWith('@') ? editedData.xAccount.substring(1) : editedData.xAccount;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 [&>button]:hidden flex flex-col h-full bg-background">
        <div className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <SheetTitle className="text-xl font-bold truncate">
              {isNew ? t.title.create : (isEditing ? t.title.edit : editedData.name)}
            </SheetTitle>
          </div>
          {isEditing ? (
            <Button
              variant="ghost"
              className="text-blue-500 font-bold px-4"
              onClick={handleSave}
              disabled={!editedData.name}
            >
              {t.actions.save}
            </Button>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
              <Pencil className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {(isEditing) && (
            <section className="space-y-2 animate-in fade-in slide-in-from-top-1">
              <Label className="text-xs text-muted-foreground uppercase font-bold">{t.labels.ownerName}</Label>
              <Input
                value={editedData.name || ''}
                onChange={e => setEditedData({...editedData, name: e.target.value})}
                placeholder={t.placeholders.name}
              />
            </section>
          )}

          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase font-bold">{t.labels.xAccount}</Label>
            {isEditing ? (
              <Input
                value={editedData.xAccount || ''}
                onChange={e => setEditedData({...editedData, xAccount: e.target.value})}
                placeholder={t.placeholders.xAccount}
              />
            ) : (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex-1 truncate">
                  {xUsername ? (
                    <a href={`https://x.com/${xUsername}`} target="_blank" rel="noreferrer" className="text-blue-500 flex items-center gap-1">
                      @{xUsername} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : '-'}
                </div>
                {xUsername && (
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(`@${xUsername}`, 'x')}>
                    {copiedKey === 'x' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase font-bold">{t.labels.walletAddresses}</Label>
            {isEditing && (
              <div className="flex gap-2 mb-4">
                <Input
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  placeholder={t.placeholders.address}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAddress())}
                />
                <Button variant="outline" onClick={handleAddAddress} type="button">{t.actions.add}</Button>
              </div>
            )}
            <div className="space-y-2">
              {editedData.addresses?.map((addr, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="font-mono text-xs break-all flex-1 pr-2">{addr}</span>
                  {isEditing ? (
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveAddress(addr)}>
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(addr, addr)}>
                      {copiedKey === addr ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              ))}
              {(isEditing && editedData.addresses?.length === 0) && (
                <p className="text-xs text-muted-foreground italic px-1">{t.actions.addWalletAddress}</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase font-bold">{t.labels.memo}</Label>
            {isEditing ? (
              <Textarea
                value={editedData.memo || ''}
                onChange={e => setEditedData({...editedData, memo: e.target.value})}
                className="min-h-[150px]"
                placeholder={t.placeholders.memo}
              />
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap min-h-[100px]">
                {editedData.memo || '-'}
              </div>
            )}
          </section>
        </div>

        {(!isEditing && !isNew) && (
          <div className="p-6 border-t bg-background">
            <Button
              variant="outline"
              className="w-full h-12 text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => onDelete(owner)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t.actions.removeThisOwner}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
