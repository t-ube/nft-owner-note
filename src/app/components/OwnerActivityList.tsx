import React, { useState, useMemo, useEffect, useCallback } from 'react';
import _ from 'lodash';
import Papa from 'papaparse';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import HelpPopover from '@/app/components/HelpPopover';
import SortableTableHead from '@/app/components/SortableTableHead';
import { useNFTContext } from '@/app/contexts/NFTContext';
import { useCollectors, Collector } from '@/app/components/useCollectors';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import NFTSiteWalletIcons from '@/app/components/NFTSiteWalletIcons';
import { STICKY_COL, STICKY_ROW_HOVER } from '@/app/components/stickyColumn';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface OwnerActivityListProps {
  lang: string;
  issuer: string;
  taxon: string;
}

interface ActivityRow extends Collector {
  group: AddressGroup | null;
  /** 現在の保有数（ローカルの NFT データから数える） */
  holding: number;
  purchaseXrpValue: number;
  /** 初回取得からの日数（オーナー歴） */
  ownerDays: number | null;
  /** 最終活動からの日数 */
  idleDays: number | null;
}

/** ISO 日時から今日までの経過日数。日時が無い・不正なら null。 */
const daysSince = (iso: string): number | null => {
  const t = new Date(iso).getTime();
  if (!iso || isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

type SortField =
  | 'holding'
  | 'purchaseCount'
  | 'purchaseXrpValue'
  | 'distributionCount'
  | 'launchpadCount'
  | 'activeDays'
  | 'activeMonths'
  | 'ownerDays'
  | 'idleDays';

type SortDirection = 'asc' | 'desc';

const OwnerActivityList: React.FC<OwnerActivityListProps> = ({ lang, issuer, taxon }) => {
  const { nfts } = useNFTContext();
  const { status, collectors } = useCollectors(issuer, taxon);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});
  const [holdersOnly, setHoldersOnly] = useState(false);
  const [sort, setSort] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'purchaseXrpValue',
    direction: 'desc',
  });

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const loadData = useCallback(async () => {
    const [groups, infos] = await Promise.all([
      dbManager.getAllAddressGroups(),
      dbManager.getAllAddressInfos(),
    ]);
    setAddressGroups(_.keyBy(groups, 'id'));
    setAddressInfos(_.keyBy(infos, 'address'));
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const holdings = useMemo(
    () => _.countBy(nfts.filter(nft => !nft.is_burned), 'owner'),
    [nfts]
  );

  const rows = useMemo(() => {
    const all = collectors.map((c): ActivityRow => {
      const info = addressInfos[c.wallet];
      return {
        ...c,
        group: info?.groupId ? addressGroups[info.groupId] ?? null : null,
        holding: holdings[c.wallet] ?? 0,
        purchaseXrpValue: Number(c.purchaseXrp) || 0,
        ownerDays: daysSince(c.firstAt),
        idleDays: daysSince(c.lastAt),
      };
    });
    const filtered = holdersOnly ? all.filter(r => r.holding > 0) : all;
    return _.orderBy(filtered, [sort.field, 'wallet'], [sort.direction, 'asc']);
  }, [collectors, addressInfos, addressGroups, holdings, holdersOnly, sort]);

  const handleSort = (field: SortField) => {
    setSort(prev =>
      prev.field === field
        ? { field, direction: prev.direction === 'desc' ? 'asc' : 'desc' }
        : { field, direction: 'desc' }
    );
  };

  const formatAddress = (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

  // 日付は比較しやすいよう日数で出し、正確な日時はツールチップに回す
  const formatDaysAgo = (days: number) =>
    new Intl.RelativeTimeFormat(lang, { numeric: 'always' }).format(-days, 'day');

  const formatDuration = (days: number) =>
    new Intl.NumberFormat(lang, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(days);

  const formatXrp = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const handleExportCSV = () => {
    const data = rows.map(r => ({
      address: r.wallet,
      name: r.group?.name || '',
      xAccount: r.group?.xAccount || '',
      holding: r.holding,
      purchaseCount: r.purchaseCount,
      purchaseXrp: r.purchaseXrp,
      distributionCount: r.distributionCount,
      launchpadCount: r.launchpadCount,
      activeDays: r.activeDays,
      activeMonths: r.activeMonths,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
    }));
    const csv = Papa.unparse(data);
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
    const date = new Date().toISOString().split('T')[0];

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `owner_activity_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  if (!dict) return null;

  const { ownerActivity } = dict.project.detail;

  // 列の説明（表の列と同じ並び）
  const legendItems: [string, string][] = [
    [ownerActivity.table.holding, ownerActivity.legend.holding],
    [ownerActivity.table.purchaseXrp, ownerActivity.legend.purchaseXrp],
    [ownerActivity.table.purchaseCount, ownerActivity.legend.purchaseCount],
    [ownerActivity.table.distributionCount, ownerActivity.legend.distributionCount],
    [ownerActivity.table.launchpadCount, ownerActivity.legend.launchpadCount],
    [ownerActivity.table.activeDays, ownerActivity.legend.activeDays],
    [ownerActivity.table.activeMonths, ownerActivity.legend.activeMonths],
    [ownerActivity.table.lastAt, ownerActivity.legend.lastAt],
    [ownerActivity.table.firstAt, ownerActivity.legend.firstAt],
  ];

  const SortableHeader = ({
    field,
    children,
    className,
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <SortableTableHead
      active={sort.field === field}
      direction={sort.direction}
      onSort={() => handleSort(field)}
      className={className}
      buttonClassName="whitespace-normal text-right"
    >
      {children}
    </SortableTableHead>
  );

  const DaysCell = ({
    days,
    iso,
    format,
  }: {
    days: number | null;
    iso: string;
    format: (days: number) => string;
  }) => (
    <TableCell className="hidden md:table-cell whitespace-nowrap text-right tabular-nums">
      {days === null ? '-' : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">{format(days)}</span>
          </TooltipTrigger>
          <TooltipContent>{new Date(iso).toLocaleString(lang)}</TooltipContent>
        </Tooltip>
      )}
    </TableCell>
  );

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {ownerActivity.status.loading}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{ownerActivity.errors.loadFailed}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="activityHoldersOnly"
              checked={holdersOnly}
              onCheckedChange={(checked) => setHoldersOnly(checked as boolean)}
            />
            <label htmlFor="activityHoldersOnly" className="text-sm">
              {ownerActivity.actions.holdersOnly}
            </label>
          </div>
          <div className="text-sm text-gray-500">
            {ownerActivity.status.showing.replace('{count}', rows.length.toLocaleString())}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={rows.length === 0}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {ownerActivity.actions.export}
          </Button>
          <HelpPopover
            label={ownerActivity.legend.toggle}
            description={ownerActivity.description}
            items={legendItems}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">{ownerActivity.status.noData}</div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={`${STICKY_COL} min-w-[140px] max-w-[200px] whitespace-normal`}>{ownerActivity.table.owner}</TableHead>
                  <SortableHeader field="holding" className="min-w-[80px] text-right">{ownerActivity.table.holding}</SortableHeader>
                  <SortableHeader field="purchaseXrpValue" className="min-w-[100px] text-right">{ownerActivity.table.purchaseXrp}</SortableHeader>
                  <SortableHeader field="purchaseCount" className="min-w-[80px] text-right">{ownerActivity.table.purchaseCount}</SortableHeader>
                  <SortableHeader field="distributionCount" className="hidden md:table-cell min-w-[80px] text-right">{ownerActivity.table.distributionCount}</SortableHeader>
                  <SortableHeader field="launchpadCount" className="hidden md:table-cell min-w-[80px] text-right">{ownerActivity.table.launchpadCount}</SortableHeader>
                  <SortableHeader field="activeDays" className="min-w-[80px] text-right">{ownerActivity.table.activeDays}</SortableHeader>
                  <SortableHeader field="activeMonths" className="hidden lg:table-cell min-w-[80px] text-right">{ownerActivity.table.activeMonths}</SortableHeader>
                  <SortableHeader field="idleDays" className="hidden md:table-cell min-w-[90px] text-right">{ownerActivity.table.lastAt}</SortableHeader>
                  <SortableHeader field="ownerDays" className="hidden md:table-cell min-w-[90px] text-right">{ownerActivity.table.firstAt}</SortableHeader>
                  <TableHead className="min-w-[120px] whitespace-normal hidden sm:table-cell">{ownerActivity.table.links}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.wallet} className={r.holding === 0 ? 'group text-muted-foreground' : 'group'}>
                    <TableCell className={`${STICKY_COL} ${STICKY_ROW_HOVER} min-w-[140px] max-w-[200px] whitespace-normal break-words`}>
                      <div title={r.wallet}>
                        {r.group?.name ? r.group.name : (
                          <span className="font-mono">{formatAddress(r.wallet)}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{r.holding.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatXrp(r.purchaseXrpValue)}</TableCell>
                    <TableCell className="text-right">{r.purchaseCount.toLocaleString()}</TableCell>
                    <TableCell className="hidden md:table-cell text-right">{r.distributionCount.toLocaleString()}</TableCell>
                    <TableCell className="hidden md:table-cell text-right">{r.launchpadCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.activeDays.toLocaleString()}</TableCell>
                    <TableCell className="hidden lg:table-cell text-right">{r.activeMonths.toLocaleString()}</TableCell>
                    <DaysCell days={r.idleDays} iso={r.lastAt} format={formatDaysAgo} />
                    <DaysCell days={r.ownerDays} iso={r.firstAt} format={formatDuration} />
                    <TableCell className="hidden sm:table-cell">
                      <NFTSiteWalletIcons wallet={r.wallet} issuer={issuer} taxon={taxon} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default OwnerActivityList;
