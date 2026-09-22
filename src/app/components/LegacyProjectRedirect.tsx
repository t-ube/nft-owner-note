"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { dbManager } from '@/utils/db';
import { collectionPath, parseProjectTab } from '@/utils/routes';
import ProjectDetailWrapper from './ProjectDetailWrapper';

interface LegacyProjectRedirectProps {
  projectId: string;
  lang: string;
}

/**
 * 旧 URL（/projects/<projectId>）を /collections/<issuer>/<taxon> へ転送する。
 * プロジェクトは端末の IndexedDB にしかないため、ブラウザ側で引いてから置き換える。
 */
const LegacyProjectRedirect: React.FC<LegacyProjectRedirectProps> = ({ projectId, lang }) => {
  const router = useRouter();
  // ?tab= は転送先にも引き継ぐ
  const tab = parseProjectTab(useSearchParams().get('tab'));
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dbManager.getProjectByProjectId(projectId)
      .then(project => {
        if (cancelled) return;
        if (project) {
          router.replace(collectionPath(lang, project, tab));
        } else {
          setNotFound(true);
        }
      })
      .catch(error => {
        console.error('Failed to resolve legacy project URL:', error);
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, lang, router, tab]);

  // 見つからないときは、従来どおりの「見つかりません」表示に任せる
  if (notFound) {
    return <ProjectDetailWrapper projectId={projectId} lang={lang} />;
  }
  return null;
};

export default LegacyProjectRedirect;
