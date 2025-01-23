import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NFTSiteWalletIconsProps {
  wallet: string;
  issuer: string;
  taxon: string;
}

const NFTSiteWalletIcons: React.FC<NFTSiteWalletIconsProps> = ({ wallet, issuer, taxon }) => {
  const sites = [
    {
      name: 'Bithomp',
      url: `https://xrplexplorer.com/en/nft-explorer?issuer=${issuer}&owner=${wallet}&taxon=${taxon}&includeWithoutMediaData=true`,
      icon: 'images/bithomp.png',
      description: 'View on Bithomp'
    },
    {
      name: 'XRPCAFE',
      url: `https://xrp.cafe/usercollection/${wallet}/${issuer}/${taxon}`,
      icon: 'images/xrpcafe.jpg',
      description: 'View on XRPCAFE'
    }
  ];

  return (
    <div className="flex gap-2">
      <TooltipProvider>
        {sites.map((site) => (
          <Tooltip key={site.name}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6 hover:bg-gray-100 rounded-full"
                onClick={() => window.open(site.url, '_blank')}
              >
                <Image
                  src={`/${site.icon}`}
                  alt={site.name}
                  width={24}
                  height={24}
                  className="object-contain rounded-full"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{site.description}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
};

export default NFTSiteWalletIcons;