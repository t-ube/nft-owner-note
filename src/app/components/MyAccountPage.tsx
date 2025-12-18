"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Copy, Check, LogOut, Wallet } from "lucide-react";
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { useXRPLWallet } from "@/app/contexts/XRPLWalletContext";

type Props = { lang: string };

// 収益機能は未実装なので、表示は基本OFF（いつでもONにできる）
const SHOW_REVENUE_SECTION = false;

function shortAddr(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

export default function MyAccountPageWrapper({ lang }: Props) {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const { account, balanceXrp, walletType, disconnect } = useXRPLWallet();
  const router = useRouter();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  // 設定（ローカルに保持。後でクラウド同期に置き換え可）
  const [backupEnabled, setBackupEnabled] = useState<boolean>(true);
  const [revenueTrackingEnabled, setRevenueTrackingEnabled] = useState<boolean>(false);

  useEffect(() => {
    try {
      const b = localStorage.getItem("settings.backupEnabled");
      const r = localStorage.getItem("settings.revenueTrackingEnabled");
      if (b !== null) setBackupEnabled(b === "true");
      if (r !== null) setRevenueTrackingEnabled(r === "true");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("settings.backupEnabled", String(backupEnabled));
    } catch {}
  }, [backupEnabled]);

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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.wallet}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1 flex items-center gap-8">
              <div>
                <div className="text-sm text-muted-foreground">{t.address}</div>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-sm break-all">
                    {addr ? shortAddr(addr) : "Not connected"}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopyAddress(addr)}
                    disabled={!addr}
                    className="h-7 w-7"
                  >
                    {copiedAddress === addr ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{t.balance}</div>
                  <div className="text-lg font-bold break-all">{balanceLabel} {t.xrp}</div>
                </div>
              </div>
            </div>

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
                <div className="font-medium">{t.cloudBackup}</div>
                <div className="text-sm text-muted-foreground">
                  {t.backupFeature}
                </div>
              </div>
              <Switch
                checked={backupEnabled}
                onCheckedChange={setBackupEnabled}
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

        <Card>
          <CardContent className="py-4 flex justify-center">
              <Button
                variant="destructive"
                onClick={async () => {
                  await disconnect();
                  router.push("/");
                }}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                {t.logout}
              </Button>
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
