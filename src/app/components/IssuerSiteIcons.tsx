import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface IssuerSiteIconsProps {
  issuer: string;
  taxon: string;
  /** バッジの中など、小さく出したいときに指定する */
  className?: string;
}

const IssuerSiteIcons: React.FC<IssuerSiteIconsProps> = ({ issuer, taxon, className = 'h-6 w-6' }) => {
  const sites = [
    {
      name: 'Bithomp',
      url: `https://xrplexplorer.com/en/nft-explorer?issuer=${issuer}&taxon=${taxon}&includeWithoutMediaData=true`,
      icon: 'images/bithomp.png',
      description: 'View issuer on Bithomp'
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
                className={cn('p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700', className)}
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

export default IssuerSiteIcons;