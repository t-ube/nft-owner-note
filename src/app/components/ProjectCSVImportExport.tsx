import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';
import { dbManager, Project } from '@/utils/db';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface ProjectCSVImportExportProps {
  onProjectsUpdated: () => void;
  lang: string;
}

// CSV形式のデータ型を定義
interface ProjectCSV {
  projectId: string;
  name: string;
  issuer: string;
  taxon: string;
}

// CSVインポート時のバリデーションエラー型
interface ValidationError {
  row: number;
  errors: string[];
}

const ProjectCSVImportExport: React.FC<ProjectCSVImportExportProps> = ({ onProjectsUpdated, lang }) => {
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleExport = async (): Promise<void> => {
    try {
      const projects = await dbManager.getAllProjects();
      
      // Convert projects to CSV format
      const csvData: ProjectCSV[] = projects.map(project => ({
        projectId: project.projectId,
        name: project.name,
        issuer: project.issuer,
        taxon: project.taxon
      }));

      // Generate CSV
      const csv = Papa.unparse(csvData);
      
      // Add BOM for UTF-8
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      
      // Create and trigger download
      const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `projects_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError('Failed to export projects');
      console.error('Export error:', err);
    }
  };

  const validateCSVRow = (row: ProjectCSV, index: number): ValidationError | null => {
    const errors: string[] = [];
    
    if (!row.projectId?.trim()) {
      errors.push('Project ID is required');
    }
    
    if (!row.name?.trim()) {
      errors.push('Name is required');
    }

    if (!row.issuer?.trim()) {
      errors.push('Issuer is required');
    }

    if (!row.taxon?.trim()) {
      errors.push('Taxon is required');
    }
    
    return errors.length > 0 ? { row: index + 1, errors } : null;
  };

  const convertCSVToProject = (row: ProjectCSV): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> => {
    return {
      projectId: row.projectId.trim(),
      name: row.name.trim(),
      issuer: row.issuer.trim(),
      taxon: row.taxon.trim()
    };
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    try {
      const text = await file.text();
      
      Papa.parse<ProjectCSV>(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results: Papa.ParseResult<ProjectCSV>) => {
          try {
            // バリデーション
            const validationErrors: ValidationError[] = [];
            results.data.forEach((row: ProjectCSV, index: number) => {
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
  
            // 既存のプロジェクトを取得
            const existingProjects = await dbManager.getAllProjects();
            const existingProjectsByProjectId = new Map(existingProjects.map(p => [p.projectId, p]));
  
            // 各行を処理
            for (const row of results.data) {
              const projectData = convertCSVToProject(row);
              const existingProject = existingProjectsByProjectId.get(projectData.projectId);
  
              if (!existingProject) {
                // 新規プロジェクトを作成
                await dbManager.addProject(projectData);
              }
            }
  
            onProjectsUpdated();
            setError(null);
          } catch (err) {
            setError('Failed to import some projects');
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

  if (!dict) return null;

  const { csvImportExport: t } = dict.project;

  return (
    <div>
      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex gap-1">
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
      </div>
    </div>
  );
};

export default ProjectCSVImportExport;