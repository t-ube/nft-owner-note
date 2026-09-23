'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { dbManager } from '@/utils/db';
import { loadCollection } from '@/app/components/useCollection';
import { collectionPath } from '@/utils/routes';
import { Dictionary } from '@/i18n/dictionaries/index';

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: string;
  dict: Dictionary['project']['sidebar']['add'];
  onAdded: () => void;
}

/** XRPL のクラシックアドレスの形式か（厳密なチェックサム検証はしない）。 */
const isValidIssuer = (issuer: string) => /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer);

/** taxon を 10 進の数字列にそろえる（"01" → "1"）。UInt32 の範囲外なら null。 */
const normalizeTaxon = (taxon: string): string | null => {
  if (!/^\d+$/.test(taxon)) return null;
  const value = Number(taxon);
  return value <= 0xFFFFFFFF ? String(value) : null;
};

/** 発行者アドレスとタクソンを入れてプロジェクトを作る。名前はコレクション情報から取る。 */
const AddProjectDialog: React.FC<AddProjectDialogProps> = ({ open, onOpenChange, lang, dict, onAdded }) => {
  const router = useRouter();
  const [issuer, setIssuer] = useState('');
  const [taxon, setTaxon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setIssuer('');
      setTaxon('');
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedIssuer = issuer.trim();
    const normalizedTaxon = normalizeTaxon(taxon.trim());
    if (!isValidIssuer(trimmedIssuer) || normalizedTaxon === null) {
      setError(dict.invalid);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const existing = await dbManager.getProjectByIssuerAndTaxon(trimmedIssuer, normalizedTaxon);
      const name = (await loadCollection(trimmedIssuer, normalizedTaxon).catch(() => null))?.name?.trim();
      const project = existing
        ? await dbManager.updateProject({
            ...existing,
            name: name || existing.name,
            isAutoCreated: false, // 自分で追加したものは通常のプロジェクトとして扱う
          })
        : await dbManager.addProject({
            name: name || `${trimmedIssuer.slice(0, 8)}… / ${normalizedTaxon}`,
            issuer: trimmedIssuer,
            taxon: normalizedTaxon,
          });

      onAdded();
      close(false);
      router.push(collectionPath(lang, project));
    } catch (err) {
      console.error('Failed to add project:', err);
      setError(dict.failed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.dialogTitle}</DialogTitle>
          <DialogDescription>{dict.dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="addProjectIssuer">{dict.issuer}</Label>
            <Input
              id="addProjectIssuer"
              value={issuer}
              onChange={e => setIssuer(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addProjectTaxon">{dict.taxon}</Label>
            <Input
              id="addProjectTaxon"
              value={taxon}
              onChange={e => setTaxon(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dict.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddProjectDialog;
