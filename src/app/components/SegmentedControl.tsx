'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SegmentedControlOption<T> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedControlProps<T> {
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * 2〜数個から 1 つを選ぶ切り替え。
 * タブ（TabsList / TabsTrigger）と同じ見た目にそろえるための部品。
 */
export function SegmentedControl<T extends string | number | boolean>({
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn('inline-flex items-center rounded-md bg-muted p-1 text-muted-foreground', className)}>
      {options.map(option => {
        const isActive = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
