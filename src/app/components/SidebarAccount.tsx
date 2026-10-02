'use client'

// サイドバー（PC）のアカウント欄。未ログインならログインの入り口、ログイン中ならアカウントのメニュー。
import type { ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Activity, ChevronsUpDown, LogIn, LogOut, PenLine, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Dictionary } from '@/i18n/dictionaries/index'
import { Wallets } from '@/types/Wallet'
import { useXRPLWallet } from '@/app/contexts/XRPLWalletContext'
import { useAuthSession } from '@/app/contexts/AuthSessionContext'
import { WalletSelectDialog } from '@/app/components/WalletSelectDialog'

type Props = {
  lang: string
  dict: Dictionary
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="hidden shrink-0 border-t px-3 py-2 dark:border-gray-700 lg:block">{children}</div>
}

function shortAddr(addr: string) {
  return addr.length <= 12 ? addr : `${addr.slice(0, 5)}…${addr.slice(-4)}`
}

export function SidebarAccount({ lang, dict }: Props) {
  const router = useRouter()
  const { account, walletType, disconnect, authenticateJoeySync, isAuthenticatingJoey } = useXRPLWallet()
  const { session, isLoading } = useAuthSession()
  const t = dict.project.sidebar

  if (isLoading) {
    return (
      <Frame>
        <div className="h-9 animate-pulse rounded-md bg-muted" />
      </Frame>
    )
  }

  if (!account) {
    return (
      <Frame>
        <WalletSelectDialog lang={lang}>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 dark:border-gray-600 dark:text-gray-200"
          >
            <LogIn className="h-4 w-4" />
            {dict.menu.login}
          </Button>
        </WalletSelectDialog>
      </Frame>
    )
  }

  const wallet = Wallets.find((w) => w.walletType === walletType)
  // Joey は接続とログインが別。接続中のアドレスでまだ署名していなければ、ログインを促す
  const needsJoeySignIn = walletType === 'joey' && session?.address !== account

  return (
    <Frame>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-gray-700 transition-colors hover:bg-[#F5F5F4] dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {wallet ? (
              <Image src={wallet.icon} alt={wallet.name} width={18} height={18} className="shrink-0" />
            ) : (
              <Wallet className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortAddr(account)}</span>
            {needsJoeySignIn && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">
            {shortAddr(account)}
          </DropdownMenuLabel>
          {needsJoeySignIn && (
            <DropdownMenuItem
              disabled={isAuthenticatingJoey}
              onSelect={async () => {
                const result = await authenticateJoeySync()
                if (!result.ok && result.error) console.error('Joey authenticate failed:', result.error)
              }}
            >
              <PenLine className="mr-2 h-4 w-4" />
              {dict.menu.signInWithSignature}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => router.push(`/${lang}/my-activity`)}>
            <Activity className="mr-2 h-4 w-4" />
            {dict.myActivity.title}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(`/${lang}/my-account`)}>
            <Wallet className="mr-2 h-4 w-4" />
            {t.myAccount}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void disconnect()}>
            <LogOut className="mr-2 h-4 w-4" />
            {dict.menu.logout}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Frame>
  )
}
