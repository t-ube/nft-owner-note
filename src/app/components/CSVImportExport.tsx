import React from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, AlertCircle, FileDown } from 'lucide-react';
import Papa, { ParseResult } from 'papaparse';
import { dbManager, AddressGroup } from '@/utils/db';

interface CSVImportExportProps {
  onGroupsUpdated: () => void;
}

// CSV形式のデータ型を定義
interface AddressGroupCSV {
  name: string;
  addresses: string;
  xAccount: string;
  memo: string;
  userValue1: string;
  userValue2: string;
}

// CSVインポート時のバリデーションエラー型
interface ValidationError {
  row: number;
  errors: string[];
}

const CSVImportExport: React.FC<CSVImportExportProps> = ({ onGroupsUpdated }) => {
  const [error, setError] = React.useState<string | null>(null);

  const handleExport = async (): Promise<void> => {
    try {
      const groups = await dbManager.getAllAddressGroups();
      
      // Convert groups to CSV format
      const csvData: AddressGroupCSV[] = groups.map(group => ({
        name: group.name,
        addresses: group.addresses.join(';'),
        xAccount: group.xAccount || '',
        memo: group.memo || '',
        userValue1: group.userValue1?.toString() || '',
        userValue2: group.userValue2?.toString() || ''
      }));

      // Generate CSV
      const csv = Papa.unparse(csvData);
      
      // Add BOM for UTF-8
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      
      // Create and trigger download
      const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `address_groups_${new Date().toISOString().split('T')[0]}.csv`);
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
      errors.push('Name is required');
    }
    
    const addresses = row.addresses.split(';').filter(Boolean);
    if (addresses.length === 0) {
      errors.push('At least one address is required');
    }
    
    if (row.userValue1 && isNaN(Number(row.userValue1))) {
      errors.push('User Value 1 must be a number');
    }
    
    if (row.userValue2 && isNaN(Number(row.userValue2))) {
      errors.push('User Value 2 must be a number');
    }
    
    return errors.length > 0 ? { row: index + 1, errors } : null;
  };

  const convertCSVToAddressGroup = (row: AddressGroupCSV): Omit<AddressGroup, 'id' | 'updatedAt'> => {
    return {
      name: row.name.trim(),
      addresses: row.addresses.split(';').filter(Boolean),
      xAccount: row.xAccount?.trim() || null,
      memo: row.memo?.trim() || null,
      userValue1: row.userValue1 ? Number(row.userValue1) : null,
      userValue2: row.userValue2 ? Number(row.userValue2) : null
    };
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    try {
      const text = await file.text();
      
      Papa.parse<AddressGroupCSV>(text, {
        header: true,
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
        userValue1: '100',
        userValue2: '200'
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
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>

        <div className="relative">
          <input
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
            Import CSV
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={generateSampleCSV}
          className="flex items-center gap-2"
        >
          <FileDown className="h-4 w-4" />
          Download Sample
        </Button>
      </div>
    </div>
  );
};

export default CSVImportExport;