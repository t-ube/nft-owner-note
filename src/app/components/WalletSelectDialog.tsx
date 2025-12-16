'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { WalletType } from '@/types/Wallet'
import { Wallets } from '@/types/Wallet';
import { getDictionary } from '@/i18n/get-dictionary'
import type { Dictionary } from '@/i18n/dictionaries/index'
import { useConnect, useXamanError } from '@/app/contexts/XamanContext'


interface WalletSelectDialogProps {
  children: React.ReactNode
  lang: string
  onConnected?: () => void
}

export function WalletSelectDialog({
  children,
  lang,
  onConnected,
}: WalletSelectDialogProps) {
  const [open, setOpen] = useState(false)
  const [dict, setDict] = useState<Dictionary | null>(null)

  const { connect } = useConnect()
  const { error, clearError } = useXamanError()


  useEffect(() => {
    const loadDictionary = async () => {
      const d = await getDictionary(lang as 'en' | 'ja')
      setDict(d)
    }
    loadDictionary()
  }, [lang])

  const handleSelect = async (walletType: WalletType) => {
    clearError()
    const ok = await connect(walletType)
    if (ok) {
      setOpen(false)
      onConnected?.()
    }
  }

  if (!dict) return null;

  const t = dict.walletSelect;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {Wallets.map((wallet) => (
            <Button
              key={wallet.walletType}
              variant="outline"
              className="justify-start h-auto py-3"
              disabled={false}
              onClick={() => handleSelect(wallet.walletType)}
            >
              <div className="flex items-center gap-3">
                <Image
                  src={wallet.icon}
                  alt={wallet.name}
                  width={24}
                  height={24}
                />
                <span className="font-semibold">{wallet.name}</span>
              </div>
            </Button>
          ))}
          {error && (
            <div className="text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
