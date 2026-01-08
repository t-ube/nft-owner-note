"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, LogOut, Wallet, Cloud, CloudOff } from "lucide-react";
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { useSync } from '@/app/contexts/SyncContext';
import { useXRPLWallet } from "@/app/contexts/XRPLWalletContext";
import { Wallets } from "@/types/Wallet";
import { WalletSelectDialog } from '@/app/components/WalletSelectDialog';

type Props = { lang: string };

// 収益機能は未実装なので、表示は基本OFF（いつでもONにできる）
const SHOW_REVENUE_SECTION = false;

function shortAddr(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function shortId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

export default function MyAccountPageWrapper({ lang }: Props) {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const { account, balanceXrp, walletType, disconnect, supabaseUserId, isAuthenticated } = useXRPLWallet();
  const { syncEnabled, setSyncEnabled, isSyncing, lastSyncAt, syncNow } = useSync();
  const router = useRouter();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  
  // 設定（ローカルに保持。後でクラウド同期に置き換え可）
  //const [backupEnabled, setBackupEnabled] = useState<boolean>(false);
  const [revenueTrackingEnabled, setRevenueTrackingEnabled] = useState<boolean>(false);

  useEffect(() => {
    try {
      const r = localStorage.getItem("settings.revenueTrackingEnabled");
      if (r !== null) setRevenueTrackingEnabled(r === "true");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("settings.revenueTrackingEnabled", String(revenueTrackingEnabled));
    } catch {}
  }, [revenueTrackingEnabled]);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleCopyUserId = async (userId: string) => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopiedUserId(userId);
      setTimeout(() => setCopiedUserId(null), 2000);
    } catch (err) {
      console.error('Failed to copy user ID:', err);
    }
  };

  const getWalletName = (type: string): string => {
    return Wallets.find(v => v.walletType === type)?.name ?? 'Unknown';
  };

  const getWalletIcon = (type: string): string => {
    return Wallets.find(v => v.walletType === type)?.icon ?? '';
  };

  const addr = account ?? "";
  const balanceLabel = useMemo(() => {
    if (balanceXrp === null || balanceXrp === undefined) return "—";
    // balanceXrpが string の場合もあるので保険
    return typeof balanceXrp === "number" ? balanceXrp.toLocaleString() : String(balanceXrp);
  }, [balanceXrp]);

  if (!dict) return null;
  const { myAccount: t } = dict.project;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5" />
        <h1 className="text-xl font-bold">{t.title}</h1>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        {/* Wallet */}
        <Card className="relative overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t.wallet}</CardTitle>
              
              {/* アイコンのみのステータス表示エリア */}
              <div className="flex items-center gap-1.5">
                {walletType && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border bg-white dark:bg-gray-800 shadow-sm" title={getWalletName(walletType)}>
                    <img 
                      src={getWalletIcon(walletType)} 
                      alt={walletType} 
                      className="h-4 w-4 object-contain"
                    />
                  </div>
                )}
                
                {isAuthenticated ? (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shadow-sm" title="Cloud Active">
                    <Cloud className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 shadow-sm" title="Local Only">
                    <CloudOff className="h-4 w-4" />
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {account ? (
              <>
                {/* Address & Balance */}
                <div className="flex flex-wrap items-center gap-8">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t.address}</div>
                    <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-lg">
                      <div className="font-mono text-sm font-medium">
                        {addr ? shortAddr(addr) : "Not connected"}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyAddress(addr)}
                        disabled={!addr}
                        className="h-6 w-6"
                      >
                        {copiedAddress === addr ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-0">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t.balance}</div>
                    <div className="text-2xl font-black flex items-baseline gap-1">
                      {balanceLabel} <span className="text-xs font-medium text-muted-foreground">{t.xrp}</span>
                    </div>
                  </div>
                </div>

                {/* User ID - 控えめに表示 */}
                {isAuthenticated && supabaseUserId && (
                  <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cloud ID:</div>
                    <div className="font-mono text-[10px] text-muted-foreground/80">
                      {shortId(supabaseUserId)}
                    </div>
                    <button 
                      onClick={() => handleCopyUserId(supabaseUserId)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedUserId ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                    </button>
                  </div>
                )}
              </>
              ) : (
              /* 未ログイン時の表示 */
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-3 bg-muted rounded-full">
                  <Wallet className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">{t.notConnected ?? "Wallet not connected"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t.connectPrompt ?? "Connect your wallet to enable cloud sync and management."}
                  </p>
                </div>
                <WalletSelectDialog lang={lang}>
                  <Button size="lg" className="w-full sm:w-auto font-bold">
                    <Wallet className="h-4 w-4 mr-2" />
                    {t.connectWallet ?? "Connect Wallet"}
                  </Button>
                </WalletSelectDialog>
              </div>
            )
            }
          </CardContent>
        </Card>

        {/* Revenue (optional / hidden for now) */}
        {SHOW_REVENUE_SECTION ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.revenue}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">{t.last30Days}</div>
              <div className="mt-1 text-lg font-bold">— {t.xrp}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                ({t.commingSoon})
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.settings}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Backup */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{t.cloudSync}</div>
                <div className="text-sm text-muted-foreground">
                  {t.syncFeature}
                </div>
              </div>
              <Switch
                checked={syncEnabled}
                onCheckedChange={setSyncEnabled}
                aria-label="Enable backup"
              />
            </div>

            <Separator />

            {/* Revenue management */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{t.revenueTracking}</div>
                <div className="text-sm text-muted-foreground">
                  {t.prepareRevenue}
                </div>
              </div>
              <Switch
                checked={revenueTrackingEnabled}
                onCheckedChange={setRevenueTrackingEnabled}
                aria-label="Enable revenue tracking"
                disabled={!SHOW_REVENUE_SECTION}
              />
            </div>

            {/* 将来：revenueTrackingEnabled が true のときだけ、SHOW_REVENUE_SECTION を true にするとかでもOK */}
          </CardContent>
        </Card>

        {account ? (
          <Card>
            <CardContent className="py-4 flex justify-center">
              <Button
                variant="destructive"
                onClick={async () => {
                  await disconnect();
                }}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                {t.logout}
              </Button>
            </CardContent>
          </Card>
        ) : (<></>)
        }
      </div>

    </div>
  );
}
