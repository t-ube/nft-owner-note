import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { dbManager } from '@/utils/db';
import { fetchNFTMetadataSafe } from '@/utils/nftMetadata';
import { Dictionary } from '@/i18n/dictionaries/index';

interface TaxonApiResponse {
  info: {
    ledger_index: number;
    ledger_hash: string;
    ledger_close: string;
    ledger_close_ms: number;
  };
  data: {
    issuer: string;
    taxons: number[];
  };
}

interface NFTMetadataResponse {
  info: {
    ledger_index: number;
    ledger_hash: string;
    ledger_close: string;
    ledger_close_ms: number;
  };
  data: {
    issuer: string;
    nfts: Array<{
      NFTokenID: string;
      Issuer: string;
      Owner: string;
      Taxon: number;
      TransferFee: number;
      Flags: number;
      Sequence: number;
      URI: string;
    }>;
  };
}

interface CollectionInfo {
  taxon: number;
  name: string;
  isLoading: boolean;
  error?: string;
}

interface BulkProjectCreationProps {
  onProjectsCreated: () => void;
  dictionary: Dictionary | null;
  lang: string;
}

const BulkProjectCreation: React.FC<BulkProjectCreationProps> = ({ onProjectsCreated, dictionary, lang }) => {
  const [issuerAddress, setIssuerAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!dictionary) {
    return null;
  }

  const fetchCollectionMetadata = async (issuer: string, taxon: number): Promise<string> => {
    try {
      // First, fetch an NFT from this collection
      const response = await fetch(
        `https://api.xrpldata.com/api/v1/xls20-nfts/issuer/${issuer}/taxon/${taxon}?limit=10`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch NFT');
      }

      const nftData: NFTMetadataResponse = await response.json();
      
      // Find the first non-burned NFT
      const nft = nftData.data.nfts.find(nft => !(nft.Flags & 0x1));
      
      if (!nft?.URI) {
        throw new Error('No active NFT found');
      }

      // Decode URI from hex
      const uri = Buffer.from(nft.URI, 'hex').toString('utf8');
      
      // Fetch metadata using the utility function
      const metadata = await fetchNFTMetadataSafe(uri);
      if (!metadata) {
        throw new Error('Failed to fetch metadata');
      }
      
      // Try to extract collection name from the NFT name
      if (metadata.collection?.name) {
        return metadata.collection?.name;
      }

      if (metadata.name) {
        return metadata.name;
      }
      
      // Fallback to default name
      return `Collection ${taxon}`;
    } catch (err) {
      console.error('Error fetching metadata:', err);
      throw err;
    }
  };

  const fetchTaxons = async () => {
    if (!issuerAddress) return;
    
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setCollections([]);

    try {
      const response = await fetch(
        `https://api.xrpldata.com/api/v1/xls20-nfts/taxon/${issuerAddress}?limit=100`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch taxons');
      }

      const data: TaxonApiResponse = await response.json();
      
      // Initialize collections with loading state
      const initialCollections = data.data.taxons.map(taxon => ({
        taxon,
        name: `Collection ${taxon}`,
        isLoading: true
      }));
      setCollections(initialCollections);

      // Fetch metadata for each collection
      for (const taxon of data.data.taxons) {
        try {
          const name = await fetchCollectionMetadata(issuerAddress, taxon);
          setCollections(prev => 
            prev.map(collection => 
              collection.taxon === taxon
                ? { ...collection, name, isLoading: false }
                : collection
            )
          );
        } catch (err) {
          console.log(err);
          setCollections(prev => 
            prev.map(collection => 
              collection.taxon === taxon
                ? { 
                    ...collection, 
                    isLoading: false, 
                    error: 'Failed to fetch metadata'
                  }
                : collection
            )
          );
        }
      }
    } catch (err) {
      console.log(err);
      setError(dictionary.project.bulkCreate.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProjects = async () => {
    if (!issuerAddress || collections.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const creationPromises = collections.map(async (collection) => {
        const existing = await dbManager.getProjectByIssuerAndTaxon(
          issuerAddress,
          collection.taxon.toString()
        );
        
        if (!existing) {
          return dbManager.addProject({
            name: collection.name,
            issuer: issuerAddress,
            taxon: collection.taxon.toString()
          });
        }
        return null;
      });

      const results = await Promise.all(creationPromises);
      const createdProjects = results.filter((p) => p !== null);
      
      if (createdProjects.length > 0) {
        const message = dictionary.project.bulkCreate.success
          .replace('{count}', createdProjects.length.toString());
        setSuccessMessage(message);
        onProjectsCreated();

        const lastProject = createdProjects[createdProjects.length - 1];
        setTimeout(() => {
          setOpen(false);
          router.push(`/${lang}/projects/${lastProject.projectId}`);
        }, 2000);
      } else {
        setError(dictionary.project.bulkCreate.noNewProjects);
      }
    } catch (err) {
      console.log(err);
      setError(dictionary.project.bulkCreate.createError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNameChange = (taxon: number, newName: string) => {
    setCollections(prev => 
      prev.map(collection => 
        collection.taxon === taxon ? { ...collection, name: newName } : collection
      )
    );
  };

  const handleRefreshMetadata = async (taxon: number) => {
    const collection = collections.find(c => c.taxon === taxon);
    if (!collection || collection.isLoading) return;

    setCollections(prev => 
      prev.map(c => 
        c.taxon === taxon ? { ...c, isLoading: true, error: undefined } : c
      )
    );

    try {
      const name = await fetchCollectionMetadata(issuerAddress, taxon);
      setCollections(prev => 
        prev.map(c => 
          c.taxon === taxon ? { ...c, name, isLoading: false } : c
        )
      );
    } catch (err) {
      console.log(err);
      setCollections(prev => 
        prev.map(c => 
          c.taxon === taxon ? { 
            ...c, 
            isLoading: false, 
            error: 'Failed to fetch metadata'
          } : c
        )
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="space-y-2">
          <Button variant="default" className="w-full mt-4 relative">
            <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">New</div>
            <Plus className="h-5 w-5 mr-2" />
            {dictionary.project.bulkCreate.button}
          </Button>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">✨ {dictionary.project.bulkCreate.description}</p>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dictionary.project.bulkCreate.title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="flex space-x-2">
            <Input
              value={issuerAddress}
              onChange={(e) => setIssuerAddress(e.target.value.trim())}
              placeholder={dictionary.project.bulkCreate.placeholder}
              className="flex-1"
              disabled={isLoading}
            />
            <Button onClick={fetchTaxons} disabled={isLoading || !issuerAddress}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                dictionary.project.bulkCreate.fetch
              )}
            </Button>
          </div>

          {error && (
            <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-800 text-green-700 dark:text-green-400 rounded">
              {successMessage}
            </div>
          )}

          {collections.length > 0 && (
            <div className="space-y-4">
              <div className="max-h-64 overflow-y-auto border rounded-md dark:border-gray-700">
                <div className="grid grid-cols-1 gap-2 p-4">
                  {collections.map((collection) => (
                    <div 
                      key={collection.taxon}
                      className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md flex items-center space-x-2"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          <Input
                            value={collection.name}
                            onChange={(e) => handleNameChange(collection.taxon, e.target.value)}
                            className="flex-1"
                            placeholder="Collection Name"
                            disabled={collection.isLoading}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRefreshMetadata(collection.taxon)}
                            disabled={collection.isLoading}
                          >
                            <RefreshCw 
                              className={`h-4 w-4 ${collection.isLoading ? 'animate-spin' : ''}`}
                            />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Taxon: {collection.taxon}
                          </span>
                          {collection.error && (
                            <span className="text-xs text-red-500">
                              {collection.error}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <Button 
                onClick={handleCreateProjects} 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {dictionary.project.bulkCreate.create}
                {collections.length > 0 && ` (${collections.length})`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkProjectCreation;