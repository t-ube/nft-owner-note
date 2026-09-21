import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface SortableTableHeadProps {
  /** この列で並べ替え中か */
  active: boolean;
  direction: 'asc' | 'desc';
  onSort: () => void;
  className?: string;
  buttonClassName?: string;
  children: React.ReactNode;
}

/**
 * 並べ替えできる列の見出し。
 * 並べ替え中の列は文字を太く・矢印を青にし、それ以外は文字と矢印を薄くして違いが一目で分かるようにする
 */
const SortableTableHead: React.FC<SortableTableHeadProps> = ({
  active,
  direction,
  onSort,
  className,
  buttonClassName,
  children,
}) => {
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button
        variant="ghost"
        onClick={onSort}
        className={cn(
          'group/sort h-8 p-0 hover:bg-transparent',
          active
            ? 'font-bold text-foreground'
            : 'font-medium text-muted-foreground hover:text-foreground',
          buttonClassName
        )}
      >
        {children}
        <Icon
          className={cn(
            'ml-1 h-4 w-4 shrink-0',
            active
              ? 'text-blue-600 dark:text-blue-400'
              : 'opacity-40 group-hover/sort:opacity-100'
          )}
          strokeWidth={active ? 2.75 : 2}
        />
      </Button>
    </TableHead>
  );
};

export default SortableTableHead;
