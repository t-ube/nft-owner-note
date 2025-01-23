import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { dbManager } from '@/utils/db';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import _ from 'lodash';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

const COLORS = [
  { value: '🔴', label: '🔴 Red' },
  { value: '🟠', label: '🟠 Orange' },
  { value: '🟡', label: '🟡 Yellow' },
  { value: '🟢', label: '🟢 Green' },
  { value: '🔵', label: '🔵 Blue' },
  { value: '🟣', label: '🟣 Purple' },
  { value: '🟤', label: '🟤 Brown' },
] as const;

interface StatisticsProps {
  projectId: string;
  lang: string;
}

interface ColorStats {
  colorDistribution: {
    color: string;
    count: number;
    percentage: number;
  }[];
  recentColorActivity: {
    total: number;
    byColor: Record<string, number>;
    lastUpdated: string | null;
  };
  totalClassified: number;
  totalUnclassified: number;
  classificationRate: number;
}

interface StatisticsState extends ColorStats {
  mintLast7Days: number;
  salesLast7Days: number;
  uniqueBuyersLast7Days: number;
  totalMints: number;
  totalSales: number;
  avgTimeToFirstSale: number;
  paretoMetrics: {
    topHoldersPercentage: number;
    topHoldersCount: number;
    totalHolders: number;
  };
}

interface DistributionStatus {
  label: string;
  variant: 'secondary' | 'outline' | 'destructive';
  description: string;
  className: string;
}

const getDistributionStatus = (dict:Dictionary, percentage: number): DistributionStatus => {
  const paretoSts = dict.project.detail.stats.paretoAnalysis.status;

  if (percentage < 70) {
    return {
      label: paretoSts.wellDistributed.label,
      variant: 'secondary',
      description: paretoSts.wellDistributed.description,
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
    };
  } else if (percentage < 85) {
    return {
      label: paretoSts.typical.label,
      variant: 'outline',
      description: paretoSts.typical.label,
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
    };
  } else {
    return {
      label: paretoSts.concentrated.label,
      variant: 'destructive',
      description: paretoSts.concentrated.label,
      className: ''
    };
  }
};

const Statistics: React.FC<StatisticsProps> = ({ lang, projectId }) => {
  const [error, setError] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [stats, setStats] = useState<StatisticsState>({
    mintLast7Days: 0,
    salesLast7Days: 0,
    uniqueBuyersLast7Days: 0,
    totalMints: 0,
    totalSales: 0,
    avgTimeToFirstSale: 0,
    paretoMetrics: {
      topHoldersPercentage: 0,
      topHoldersCount: 0,
      totalHolders: 0
    },
    colorDistribution: [],
    recentColorActivity: {
      total: 0,
      byColor: {},
      lastUpdated: null
    },
    totalClassified: 0,
    totalUnclassified: 0,
    classificationRate: 0
  });

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  useEffect(() => {
    const loadNFTData = async () => {
      try {
        const nftData = await dbManager.getNFTsByProjectId(projectId);
        
        // Basic stats calculation
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        // Pareto analysis
        const holderCounts = _.chain(nftData)
          .filter(nft => !nft.is_burned)
          .groupBy('owner')
          .mapValues(nfts => nfts.length)
          .values()
          .orderBy(count => -count)
          .value();

        const totalHolders = holderCounts.length;
        const totalNFTs = _.sum(holderCounts);
        
        const cumulativeDistribution: number[] = [];
        let cumulativeSum = 0;

        holderCounts.forEach(count => {
          cumulativeSum += count;
          cumulativeDistribution.push((cumulativeSum / totalNFTs) * 100);
        });

        const topHoldersCount = Math.ceil(totalHolders * 0.2);
        const paretoIndex = Math.floor(holderCounts.length * 0.2);
        const topHoldersPercentage = cumulativeDistribution[paretoIndex] || 0;

        // Activity stats
        const mintLast7Days = nftData.filter(nft => 
          nft.mintedAt && nft.mintedAt >= sevenDaysAgo
        ).length;

        const recentSales = nftData.filter(nft => 
          nft.firstSaleAt && nft.firstSaleAt >= sevenDaysAgo
        );
        const salesLast7Days = recentSales.length;
        const uniqueBuyersLast7Days = _.uniqBy(recentSales, 'owner').length;

        const totalMints = nftData.filter(nft => nft.mintedAt).length;
        const totalSales = nftData.filter(nft => nft.firstSaleAt).length;

        const timeToFirstSale = nftData
          .filter(nft => nft.mintedAt && nft.firstSaleAt)
          .map(nft => {
            const mintDate = nft.mintedAt!;
            const saleDate = nft.firstSaleAt!;
            return (saleDate - mintDate) / (24 * 60 * 60 * 1000);
          });
        
        const avgTimeToFirstSale = timeToFirstSale.length > 0
          ? _.mean(timeToFirstSale)
          : 0;

        // Color stats
        const activeNFTs = nftData.filter(nft => !nft.is_burned);
        const colorCounts = _.countBy(activeNFTs, 'color');
        const colorDistribution = COLORS.map(({ value, label }) => ({
          color: label,
          count: colorCounts[value] || 0,
          percentage: ((colorCounts[value] || 0) / activeNFTs.length) * 100
        }));

        const totalUnclassified = activeNFTs.filter(nft => !nft.color).length;
        const totalClassified = activeNFTs.length - totalUnclassified;
        const classificationRate = (totalClassified / activeNFTs.length) * 100;

        const recentlyColored = activeNFTs.filter(nft => 
          nft.updatedAt >= sevenDaysAgo && nft.color
        );

        const lastColorUpdate = activeNFTs
          .filter(nft => nft.color && nft.updatedAt !== null)
          .map(nft => nft.updatedAt!)
          .sort((a, b) => b - a)[0] || null;

        // Update all stats
        setStats({
          mintLast7Days,
          salesLast7Days,
          uniqueBuyersLast7Days,
          totalMints,
          totalSales,
          avgTimeToFirstSale,
          paretoMetrics: {
            topHoldersPercentage,
            topHoldersCount,
            totalHolders
          },
          colorDistribution,
          recentColorActivity: {
            total: recentlyColored.length,
            byColor: _.countBy(recentlyColored, 'color'),
            lastUpdated: lastColorUpdate ? new Date(lastColorUpdate).toLocaleString() : null
          },
          totalClassified,
          totalUnclassified,
          classificationRate
        });
      } catch (err) {
        setError('Failed to load NFT data');
        console.error(err);
      }
    };

    loadNFTData();
  }, [projectId]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!dict) return null;

  const dictStats = dict.project.detail.stats;

  return (
    <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>{dictStats.sevenDayMints.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.mintLast7Days}</div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {dictStats.sevenDayMints.totalMints}: {stats.totalMints}
            </p>
            <p className="text-xs text-muted-foreground italic">
              {dictStats.notice.noSalesData}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictStats.sevenDayFirstSales.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.salesLast7Days}</div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {dictStats.sevenDayFirstSales.totalFirstSales}: {stats.totalSales}
            </p>
            <p className="text-xs text-muted-foreground italic">
              {dictStats.notice.noSalesData}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictStats.sevenDayUniqueBuyers.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.uniqueBuyersLast7Days}</div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {dictStats.sevenDayUniqueBuyers.description}
            </p>
            <p className="text-xs text-muted-foreground italic">
              {dictStats.notice.noSalesData}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictStats.avgTimeToFirstSale.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {stats.totalSales > 0 
              ? `${stats.avgTimeToFirstSale.toFixed(1)}`
              : dictStats.notice.noSalesDataYet
            }
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {dictStats.avgTimeToFirstSale.description}
            </p>
            <p className="text-xs text-muted-foreground italic">
              {dictStats.notice.noSalesData}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictStats.colorClassification.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {stats.classificationRate.toFixed(1)}%
          </div>
          <div className="space-y-2 mt-4">
            <p className="text-sm">
              {dictStats.colorClassification.classified}: {stats.totalClassified.toLocaleString()}
              <span className="text-muted-foreground ml-1">{dictStats.colorClassification.nfts}</span>
            </p>
            <p className="text-sm">
              {dictStats.colorClassification.unclassified}: {stats.totalUnclassified.toLocaleString()}
              <span className="text-muted-foreground ml-1">{dictStats.colorClassification.nfts}</span>
            </p>
            {stats.recentColorActivity.lastUpdated && (
              <p className="text-xs text-muted-foreground mt-2">
                {dictStats.colorClassification.lastUpdated}: {stats.recentColorActivity.lastUpdated}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictStats.colorDistribution.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.colorDistribution.map(({ color, count, percentage }) => (
              <div key={color} className="flex justify-between items-center">
                <span className="text-sm">{color}</span>
                <span className="text-sm font-medium">
                  {count.toLocaleString()} ({percentage.toFixed(1)}%)
                </span>
              </div>
            ))}
            {/* Unclassified NFTs */}
            <div className="flex justify-between items-center">
              <span className="text-sm">⚪ Unclassified</span>
              <span className="text-sm font-medium">
                {stats.totalUnclassified.toLocaleString()} 
                ({((stats.totalUnclassified / (stats.totalClassified + stats.totalUnclassified)) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>{dictStats.paretoAnalysis.title}</CardTitle>
          <Badge 
            variant={getDistributionStatus(dict,stats.paretoMetrics.topHoldersPercentage).variant}
            className={`text-xs ${getDistributionStatus(dict,stats.paretoMetrics.topHoldersPercentage).className}`}
          >
            {getDistributionStatus(dict,stats.paretoMetrics.topHoldersPercentage).label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-bold">
            {stats.paretoMetrics.topHoldersPercentage.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">
            {dictStats.paretoAnalysis.holdersInfo
              .replace('{topHolders}', stats.paretoMetrics.topHoldersCount.toString())
              .replace('{totalHolders}', stats.paretoMetrics.totalHolders.toString())}
          </p>
          <p className="text-xs text-muted-foreground">
            {getDistributionStatus(dict,stats.paretoMetrics.topHoldersPercentage).description}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Statistics;