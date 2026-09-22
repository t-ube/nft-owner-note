// utils/routes.ts

import type { Project } from '@/utils/db';

/** プロジェクト詳細ページのタブ（URL の ?tab= に使う名前）。先頭が既定のタブ */
export const PROJECT_TABS = ['owners', 'holdings', 'ecosystem', 'community', 'activity', 'nfts'] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

/** ?tab= の値をタブにする。知らない値や未指定は既定のタブ */
export function parseProjectTab(value: string | null | undefined): ProjectTab {
  return PROJECT_TABS.find(tab => tab === value) ?? PROJECT_TABS[0];
}

/** 既定のタブのときは ?tab= を付けない */
export function tabQuery(tab?: ProjectTab): string {
  return tab && tab !== PROJECT_TABS[0] ? `?tab=${tab}` : '';
}

/** プロジェクト詳細ページの URL。内部では projectId を使うが、URL は issuer/taxon で表す。 */
export function collectionPath(lang: string, project: Pick<Project, 'issuer' | 'taxon'>, tab?: ProjectTab): string {
  return `/${lang}/collections/${encodeURIComponent(project.issuer)}/${encodeURIComponent(project.taxon)}${tabQuery(tab)}`;
}
