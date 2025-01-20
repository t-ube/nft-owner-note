import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { dbManager, NFToken } from '@/utils/db';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import _ from 'lodash';

interface StatisticsProps {
  projectId: string;
}

interface StatisticsState {
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
  }
}

interface DistributionStatus {
  label: string;
  variant: 'secondary' | 'outline' | 'destructive';
  description: string;
  className: string;
}

const getDistributionStatus = (percentage: number): DistributionStatus => {
  if (percentage < 70) {
    return {
      label: 'Well Distributed',
      variant: 'secondary',
      description: 'More evenly distributed than typical Pareto (80/20)',
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
    };
  } else if (percentage < 85) {
    return {
      label: 'Typical Distribution',
      variant: 'outline',
      description: 'Close to typical Pareto distribution',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
    };
  } else {
    return {
      label: 'Highly Concentrated',
      variant: 'destructive',
      description: 'More concentrated than typical Pareto (80/20)',
      className: ''
    };
  }
};

const Statistics: React.FC<StatisticsProps> = ({ projectId }) => {
  const [, setNfts] = useState<NFToken[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    }
  });

  const calculateStats = (nftData: NFToken[]) => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // パレート分析のための保有者データ集計
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

    // 過去7日間のミント数
    const mintLast7Days = nftData.filter(nft => 
      nft.mintedAt && nft.mintedAt >= sevenDaysAgo
    ).length;

    // 過去7日間の販売数とユニーク購入者数
    const recentSales = nftData.filter(nft => 
      nft.firstTransferredAt && nft.firstTransferredAt >= sevenDaysAgo
    );
    const salesLast7Days = recentSales.length;
    const uniqueBuyersLast7Days = _.uniqBy(recentSales, 'owner').length;

    // 合計ミント数と販売数
    const totalMints = nftData.filter(nft => nft.mintedAt).length;
    const totalSales = nftData.filter(nft => nft.firstTransferredAt).length;

    // ミントから初回販売までの平均期間（日数）
    const timeToFirstSale = nftData
      .filter(nft => nft.mintedAt && nft.firstTransferredAt)
      .map(nft => {
        const mintDate = nft.mintedAt!;
        const saleDate = nft.firstTransferredAt!;
        return (saleDate - mintDate) / (24 * 60 * 60 * 1000);
      });
    
    const avgTimeToFirstSale = timeToFirstSale.length > 0
      ? _.mean(timeToFirstSale)
      : 0;

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
      }
    });
  };

  useEffect(() => {
    const loadNFTData = async () => {
      try {
        const nftData = await dbManager.getNFTsByProjectId(projectId);
        setNfts(nftData);
        calculateStats(nftData);
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

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>7 Day Mints</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.mintLast7Days}</div>
          <p className="text-xs text-muted-foreground">
            Total Mints: {stats.totalMints}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7 Day First Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.salesLast7Days}</div>
          <p className="text-xs text-muted-foreground">
            Total First Sales: {stats.totalSales}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7 Day Unique Buyers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.uniqueBuyersLast7Days}</div>
          <p className="text-xs text-muted-foreground">
            Distinct addresses making first purchases
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avg. Time to First Sale</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {stats.avgTimeToFirstSale.toFixed(1)}
          </div>
          <p className="text-xs text-muted-foreground">
            Days from mint to first sale
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Pareto Analysis</CardTitle>
          <Badge 
            variant={getDistributionStatus(stats.paretoMetrics.topHoldersPercentage).variant}
            className={`text-xs ${getDistributionStatus(stats.paretoMetrics.topHoldersPercentage).className}`}
          >
            {getDistributionStatus(stats.paretoMetrics.topHoldersPercentage).label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-bold">
            {stats.paretoMetrics.topHoldersPercentage.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">
            NFTs held by top 20% holders ({stats.paretoMetrics.topHoldersCount} out of {stats.paretoMetrics.totalHolders} holders)
          </p>
          <p className="text-xs text-muted-foreground">
            {getDistributionStatus(stats.paretoMetrics.topHoldersPercentage).description}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Statistics;