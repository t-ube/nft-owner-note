import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, AlertCircle, FileDown, MoreVertical } from 'lucide-react';
import Papa, { ParseResult } from 'papaparse';
import { dbManager, AddressGroup } from '@/utils/db';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface CSVImportExportProps {
  onGroupsUpdated: () => void;
  lang: string;
}

// CSV形式のデータ型を定義
interface AddressGroupCSV {
  name: string;
  addresses: string;
  xAccount: string;
  memo: string;
}

// CSVインポート時のバリデーションエラー型
interface ValidationError {
  row: number;
  errors: string[];
}

const CSVImportExport: React.FC<CSVImportExportProps> = ({ onGroupsUpdated, lang }) => {
  const [error, setError] = useState<string | null>(null);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [fileInputKey] = useState(0);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  if (!dict) return null;

  const { csvImportExport: t } = dict.project.owners;

  const handleExport = async (): Promise<void> => {
    try {
      const groups = await dbManager.getAllAddressGroups();
      
      // Convert groups to CSV format
      const csvData: AddressGroupCSV[] = groups.map(group => ({
        name: group.name,
        addresses: group.addresses.join(';'),
        xAccount: group.xAccount || '',
        memo: group.memo || '',
      }));

      // Generate CSV
      const csv = Papa.unparse(csvData);
      
      // Add BOM for UTF-8
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      
      // Create and trigger download
      const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `owner_address_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError('Failed to export groups');
      console.error('Export error:', err);
    }
  };

  const validateCSVRow = (row: AddressGroupCSV, index: number): ValidationError | null => {
    const errors: string[] = [];
    
    if (!row.name?.trim()) {
      errors.push(t.validation.nameRequired);
    }
    
    const addresses = row.addresses.split(';').filter(Boolean);
    if (addresses.length === 0) {
      errors.push(t.validation.addressRequired);
    }
    
    return errors.length > 0 ? { row: index + 1, errors } : null;
  };

  const convertCSVToAddressGroup = (row: AddressGroupCSV): Omit<AddressGroup, 'id' | 'updatedAt'> => {
    return {
      name: row.name.trim(),
      addresses: row.addresses.split(';').filter(Boolean),
      xAccount: row.xAccount?.trim() || null,
      memo: row.memo?.trim() || null,
    };
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    try {
      const text = await file.text();
      
      Papa.parse<AddressGroupCSV>(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results: ParseResult<AddressGroupCSV>) => {
          try {
            // バリデーション
            const validationErrors: ValidationError[] = [];
            results.data.forEach((row: AddressGroupCSV, index: number) => {
              const error = validateCSVRow(row, index);
              if (error) {
                validationErrors.push(error);
              }
            });
  
            if (validationErrors.length > 0) {
              setError(`Validation errors in CSV: ${validationErrors.map(e => 
                `Row ${e.row}: ${e.errors.join(', ')}`
              ).join('; ')}`);
              return;
            }
  
            // 既存のグループを取得
            const existingGroups = await dbManager.getAllAddressGroups();
            const existingGroupsByName = new Map(existingGroups.map(g => [g.name, g]));
  
            // 各行を処理
            const importPromises = results.data.map(async (row: AddressGroupCSV) => {
              const groupData = convertCSVToAddressGroup(row);
              const existingGroup = existingGroupsByName.get(groupData.name);
  
              if (existingGroup) {
                // 既存のグループを更新
                return dbManager.updateAddressGroup({
                  ...existingGroup,
                  ...groupData
                });
              } else {
                // 新規グループを作成
                return dbManager.createAddressGroup(groupData);
              }
            });
  
            await Promise.all(importPromises);
            onGroupsUpdated();
            setError(null);
          } catch (err) {
            setError('Failed to import some groups');
            console.error('Import error:', err);
          }
        },
        error: () => {
          setError('Failed to parse CSV file');
          console.error('Parse error');
        }
      });
    } catch (err) {
      setError('Failed to read file');
      console.error('File read error:', err);
    }
    
    // Reset file input
    event.target.value = '';
  };

  const generateSampleCSV = (): void => {
    const sampleData: AddressGroupCSV[] = [
      {
        name: 'Sample Group',
        addresses: 'rAddress1;rAddress2',
        xAccount: '@sample',
        memo: 'Sample memo',
      }
    ];
    
    const csv = Papa.unparse(sampleData);
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'sample_address_groups.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex items-center gap-2">
        {/* Desktop view */}
        <div className="hidden lg:flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {t.buttons.exportCSV}
          </Button>

          <div className="relative">
            <input
              key={fileInputKey}
              type="file"
              accept=".csv"
              onChange={handleImport}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {t.buttons.importCSV}
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={generateSampleCSV}
            className="flex items-center gap-2"
          >
            <FileDown className="h-4 w-4" />
            {t.buttons.downloadSample}
          </Button>
        </div>

        {/* Mobile view */}
        <div className="lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {t.buttons.exportCSV}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = (e) => handleImport(e as unknown as React.ChangeEvent<HTMLInputElement>);
                input.click();
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t.buttons.importCSV}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={generateSampleCSV}>
              <FileDown className="h-4 w-4 mr-2" />
              {t.buttons.downloadSample}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

export default CSVImportExport;