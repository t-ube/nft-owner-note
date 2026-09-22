// utils/routes.ts

import type { Project } from '@/utils/db';

/** プロジェクト詳細ページの URL。内部では projectId を使うが、URL は issuer/taxon で表す。 */
export function collectionPath(lang: string, project: Pick<Project, 'issuer' | 'taxon'>): string {
  return `/${lang}/collections/${encodeURIComponent(project.issuer)}/${encodeURIComponent(project.taxon)}`;
}
