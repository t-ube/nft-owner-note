// components/SyncPromptDialog.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSync } from '@/app/contexts/SyncContext';
import { useXRPLWallet } from '@/app/contexts/XRPLWalletContext';
import { Cloud } from 'lucide-react';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

const SYNC_PROMPT_DISMISSED_KEY = 'ownernote_sync_prompt_dismissed';

interface SyncPromptDialogProps {
  lang: string;
}

export function SyncPromptDialog({ lang }: SyncPromptDialogProps) {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { syncEnabled, setSyncEnabled } = useSync();
  const { isAuthenticated } = useXRPLWallet();
  const [dict, setDict] = useState<Dictionary | null>(null);

  // 一度でもチェック済みならスキップ
  const hasChecked = useRef(false);
  // ダイアログを表示したかどうか
  const hasShown = useRef(false);

  useEffect(() => {
    // 既にチェック済み or 表示済みならスキップ
    if (hasChecked.current || hasShown.current) return;

    // 条件チェック: ログイン中 & 同期オフ & 非表示設定なし
    if (!isAuthenticated) return;
    
    // 同期が既に有効ならスキップ
    if (syncEnabled) {
      hasChecked.current = true;
      return;
    }
    
    // 非表示設定がある場合はスキップ
    const dismissed = localStorage.getItem(SYNC_PROMPT_DISMISSED_KEY);
    if (dismissed === 'true') {
      hasChecked.current = true;
      return;
    }

    // チェック完了
    hasChecked.current = true;
    
    // 少し遅延してから表示（ページロード完了後）
    const timer = setTimeout(() => {
      hasShown.current = true;
      setOpen(true);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isAuthenticated, syncEnabled]);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleEnableSync = async () => {
    if (dontShowAgain) {
      localStorage.setItem(SYNC_PROMPT_DISMISSED_KEY, 'true');
    }
    await setSyncEnabled(true);
    setOpen(false);
  };

  const handleNotNow = () => {
    if (dontShowAgain) {
      localStorage.setItem(SYNC_PROMPT_DISMISSED_KEY, 'true');
    }
    setOpen(false);
  };

  const texts = lang === 'ja' ? {
    title: 'クラウド同期を有効にしますか？',
    description: 'クラウド同期を有効にすると、複数のデバイス間でデータを同期できます。データは暗号化されて安全に保存されます。',
    enableSync: '同期を有効にする',
    notNow: '今はしない',
    dontShowAgain: '今後このダイアログを表示しない',
  } : {
    title: 'Enable Cloud Sync?',
    description: 'Enable cloud sync to synchronize your data across multiple devices. Your data will be encrypted and stored securely.',
    enableSync: 'Enable Sync',
    notNow: 'Not Now',
    dontShowAgain: "Don't show this again",
  };

  if (!dict) return null;

  const t = dict.syncPromptDialog;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {t.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center space-x-2 py-4">
          <Checkbox
            id="dontShowAgain"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <Label
            htmlFor="dontShowAgain"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            {t.dontShowAgain}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleNotNow}>
            {t.notNow}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleEnableSync}>
            {t.enableSync}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}