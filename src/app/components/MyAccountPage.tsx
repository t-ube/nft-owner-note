"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, LogOut, Wallet, Cloud, CloudOff } from "lucide-react";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Dictionary } from "@/i18n/dictionaries/index";
import { useXRPLWallet } from "@/app/contexts/XRPLWalletContext";
import { useSyncSession } from "@/app/contexts/SyncSessionContext";
import { WalletSelectDialog } from "@/app/components/WalletSelectDialog";

type Props = { lang: string };

const SHOW_REVENUE_SECTION = false;

function shortAddr(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

export default function MyAccountPage({ lang }: Props) {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const {
    account,
    balanceXrp,
    walletType,
    disconnect,
    authenticateJoeySync,
    isAuthenticatingJoey,
  } = useXRPLWallet();
  const { session: syncSession } = useSyncSession();
  const router = useRouter();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const [dataProvisionEnabled, setDataProvisionEnabled] = useState<boolean>(false);
  const [dataProvisionSaving, setDataProvisionSaving] = useState<boolean>(false);
  const [revenueTrackingEnabled, setRevenueTrackingEnabled] = useState<boolean>(false);

  useEffect(() => {
    try {
      const r = localStorage.getItem("settings.revenueTrackingEnabled");
      if (r !== null) setRevenueTrackingEnabled(r === "true");
    } catch {}
  }, []);

  useEffect(() => {
    if (!syncSession) {
      setDataProvisionEnabled(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { dataProvisionEnabled?: boolean };
        if (!cancelled) {
          setDataProvisionEnabled(Boolean(json.dataProvisionEnabled));
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncSession]);

  const handleDataProvisionChange = async (next: boolean) => {
    if (!syncSession) return;
    const prev = dataProvisionEnabled;
    setDataProvisionEnabled(next);
    setDataProvisionSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dataProvisionEnabled: next }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setDataProvisionEnabled(prev);
    } finally {
      setDataProvisionSaving(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem("settings.revenueTrackingEnabled", String(revenueTrackingEnabled));
    } catch {}
  }, [revenueTrackingEnabled]);

  useEffect(() => {
    const d = getDictionary(lang as "en" | "ja") as unknown as Dictionary;
    setDict(d);
  }, [lang]);

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  const addr = account ?? "";
  const balanceLabel = useMemo(() => {
    if (balanceXrp === null || balanceXrp === undefined) return "—";
    return typeof balanceXrp === "number" ? balanceXrp.toLocaleString() : String(balanceXrp);
  }, [balanceXrp]);

  if (!dict) return null;
  const t = dict.project.myAccount;
  const cs = t.cloudSync;
  const ws = dict.walletSelect;
  const menu = dict.menu;
  const expiresLabel = syncSession
    ? new Date(syncSession.expiresAt).toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US")
    : null;

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          <h1 className="text-xl font-bold">{t.title}</h1>
        </div>

        <Card className="mt-4">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Wallet className="h-10 w-10 text-muted-foreground" />
            <div className="text-center space-y-1">
              <div className="text-base font-medium">{ws.title}</div>
              <div className="text-sm text-muted-foreground">{ws.description}</div>
            </div>
            <WalletSelectDialog lang={lang}>
              <Button className="gap-2">
                <Wallet className="h-4 w-4" />
                {menu.connect}
              </Button>
            </WalletSelectDialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5" />
        <h1 className="text-xl font-bold">{t.title}</h1>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t.wallet}</CardTitle>
              {walletType && (
                <Badge variant="outline" className="text-xs capitalize">
                  {walletType}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-8">
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
              <div>
                <div className="text-sm text-muted-foreground">{t.balance}</div>
                <div className="text-lg font-bold break-all">
                  {balanceLabel} {t.xrp}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {syncSession ? (
                  <Cloud className="h-4 w-4 text-green-600" />
                ) : (
                  <CloudOff className="h-4 w-4 text-muted-foreground" />
                )}
                {cs.title}
              </CardTitle>
              {syncSession ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                  {cs.signedInAs}
                </Badge>
              ) : (
                <Badge variant="secondary">{cs.notSignedIn}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">{cs.description}</div>

            {syncSession && (
              <div className="flex flex-col gap-1 text-sm">
                <div>
                  <span className="text-muted-foreground">{cs.signedInAs}: </span>
                  <span className="font-mono">{shortAddr(syncSession.address)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{cs.expiresAt}: </span>
                  <span>{expiresLabel}</span>
                </div>
              </div>
            )}

            {/* Joey は接続と認証が二段階。WC 接続済みでまだ sync session が
                ない(あるいはアドレス不一致)ときだけ認証ボタンを出す。 */}
            {walletType === 'joey' &&
              account &&
              syncSession?.address !== account && (
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={async () => {
                      const result = await authenticateJoeySync();
                      if (!result.ok && result.error) {
                        console.error('Joey authenticate failed:', result.error);
                      }
                    }}
                    disabled={isAuthenticatingJoey}
                  >
                    {isAuthenticatingJoey ? '...' : cs.signIn}
                  </Button>
                </div>
              )}
          </CardContent>
        </Card>

        {SHOW_REVENUE_SECTION ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.revenue}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">{t.last30Days}</div>
              <div className="mt-1 text-lg font-bold">— {t.xrp}</div>
              <div className="mt-2 text-xs text-muted-foreground">({t.commingSoon})</div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.settings}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{t.dataProvision}</div>
                <div className="text-sm text-muted-foreground">{t.dataProvisionDescription}</div>
              </div>
              <Switch
                checked={syncSession ? dataProvisionEnabled : false}
                onCheckedChange={handleDataProvisionChange}
                disabled={!syncSession || dataProvisionSaving}
                aria-label="Enable address data sharing"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{t.revenueTracking}</div>
                <div className="text-sm text-muted-foreground">{t.prepareRevenue}</div>
              </div>
              <Switch
                checked={revenueTrackingEnabled}
                onCheckedChange={setRevenueTrackingEnabled}
                aria-label="Enable revenue tracking"
                disabled={!SHOW_REVENUE_SECTION}
              />
            </div>
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
