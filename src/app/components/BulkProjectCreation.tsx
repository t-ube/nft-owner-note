import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus } from 'lucide-react';
import { dbManager, Project } from '@/utils/db';

interface TaxonData {
  issuer: string;
  taxon: string;
  collection_name?: string;
}

interface BulkProjectCreationProps {
  onProjectsCreated: () => void;
  dictionary: any;
}

const BulkProjectCreation: React.FC<BulkProjectCreationProps> = ({ onProjectsCreated, dictionary }) => {
  const [issuerAddress, setIssuerAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxons, setTaxons] = useState<TaxonData[]>([]);
  const [open, setOpen] = useState(false);

  const fetchTaxons = async () => {
    if (!issuerAddress) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `https://api.xrpldata.com/api/v1/xls20-nfts/taxon/${issuerAddress}?limit=100`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch taxons');
      }

      const data = await response.json();
      const uniqueTaxons = data.data.reduce((acc: TaxonData[], curr: any) => {
        const exists = acc.some(item => 
          item.issuer === curr.issuer && item.taxon === curr.taxon
        );
        if (!exists) {
          acc.push({
            issuer: curr.issuer,
            taxon: curr.taxon,
            collection_name: curr.collection_name
          });
        }
        return acc;
      }, []);

      setTaxons(uniqueTaxons);
    } catch (err) {
      setError(dictionary.project.bulkCreate.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProjects = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const creationPromises = taxons.map(async (taxon) => {
        const existing = await dbManager.getProjectByIssuerAndTaxon(
          taxon.issuer,
          taxon.taxon
        );
        
        if (!existing) {
          return dbManager.addProject({
            name: taxon.collection_name || `Collection ${taxon.taxon}`,
            issuer: taxon.issuer,
            taxon: taxon.taxon
          });
        }
        return null;
      });

      const results = await Promise.all(creationPromises);
      const createdProjects = results.filter((p): p is Project => p !== null);
      
      if (createdProjects.length > 0) {
        onProjectsCreated();
        setOpen(false);
      } else {
        setError(dictionary.project.bulkCreate.noNewProjects);
      }
    } catch (err) {
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
              onChange={(e) => setIssuerAddress(e.target.value)}
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

          {taxons.length > 0 && (
            <div className="space-y-4">
              <div className="max-h-64 overflow-y-auto border rounded-md dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {dictionary.project.bulkCreate.table.name}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {dictionary.project.bulkCreate.table.taxon}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {taxons.map((taxon, index) => (
                      <tr key={`${taxon.issuer}-${taxon.taxon}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          {taxon.collection_name || `Collection ${taxon.taxon}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {taxon.taxon}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkProjectCreation;