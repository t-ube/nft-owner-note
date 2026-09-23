// utils/recentProjects.ts
// サイドバーの「最近見た」。端末ごとの表示用なので localStorage に置く。

const STORAGE_KEY = 'sidebar.recentProjects';
/** 保存しておく件数（表示はこのうち先頭の数件） */
const MAX_RECENT = 20;

/** 新しい順の projectId */
export function loadRecentProjectIds(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** 開いたプロジェクトを先頭に記録する。戻り値は記録後の一覧 */
export function pushRecentProject(projectId: string): string[] {
  const next = [projectId, ...loadRecentProjectIds().filter(id => id !== projectId)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 保存できなくても表示には影響しない */
  }
  return next;
}
