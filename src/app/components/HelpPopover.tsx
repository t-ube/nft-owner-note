"use client";

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface HelpPopoverProps {
  /** ボタンの読み上げ名と、ポップオーバーの見出し */
  label: string;
  /** 見出しの下に出す説明文 */
  description?: string;
  /** 項目ごとの説明（[見出し, 本文]） */
  items?: [string, string][];
  /** 項目の下に出す補足 */
  note?: string;
}

/** 各タブの操作行の右端に置くヘルプ（「?」アイコン） */
const HelpPopover: React.FC<HelpPopoverProps> = ({ label, description, items, note }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={label}
        title={label}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      collisionPadding={16}
      className="w-[min(36rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto space-y-3 text-sm"
    >
      <div className="font-medium">{label}</div>
      {description && <p className="text-muted-foreground">{description}</p>}
      {items && items.length > 0 && (
        <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {items.map(([term, text]) => (
            <div key={term}>
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && <p className="text-muted-foreground">{note}</p>}
    </PopoverContent>
  </Popover>
);

export default HelpPopover;
