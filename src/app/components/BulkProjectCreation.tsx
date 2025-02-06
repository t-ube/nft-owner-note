import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus } from 'lucide-react';
import { dbManager, Project } from '@/utils/db';
import { Dictionary } from '@/i18n/dictionaries';

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
  const [taxons, setTaxons] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!dictionary) {
    return null;
  }

  const fetchTaxons = async () => {
    if (!issuerAddress) return;
    
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `https://api.xrpldata.com/api/v1/xls20-nfts/taxon/${issuerAddress}?limit=100`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch taxons');
      }

      const data: TaxonApiResponse = await response.json();
      setTaxons(data.data.taxons);
    } catch (err) {
      console.log(err);
      setError(dictionary.project.bulkCreate.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProjects = async () => {
    if (!issuerAddress || taxons.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const creationPromises = taxons.map(async (taxon) => {
        const existing = await dbManager.getProjectByIssuerAndTaxon(
          issuerAddress,
          taxon.toString()
        );
        
        if (!existing) {
          return dbManager.addProject({
            name: `Collection ${taxon}`,
            issuer: issuerAddress,
            taxon: taxon.toString()
          });
        }
        return null;
      });

      const results = await Promise.all(creationPromises);
      const createdProjects = results.filter((p): p is Project => p !== null);
      
      if (createdProjects.length > 0) {
        const message = dictionary.project.bulkCreate.success
          .replace('{count}', createdProjects.length.toString());
        setSuccessMessage(message);
        onProjectsCreated();

        // 最後に作成されたプロジェクトへの遷移を遅延実行
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full mt-4">
          <Plus className="h-4 w-4 mr-2" />
          {dictionary.project.bulkCreate.button}
        </Button>
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

          {taxons.length > 0 && (
            <div className="space-y-4">
              <div className="max-h-64 overflow-y-auto border rounded-md dark:border-gray-700">
                <div className="grid grid-cols-3 gap-2 p-4">
                  {taxons.map((taxon) => (
                    <div 
                      key={taxon}
                      className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md text-center"
                    >
                      <span className="text-sm text-gray-900 dark:text-gray-300">
                        Collection {taxon}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        Taxon: {taxon}
                      </span>
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
                {taxons.length > 0 && ` (${taxons.length})`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkProjectCreation;