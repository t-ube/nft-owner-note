"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dbManager } from '@/utils/db';
import { collectionPath } from '@/utils/routes';
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
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dbManager.getProjectByProjectId(projectId)
      .then(project => {
        if (cancelled) return;
        if (project) {
          router.replace(collectionPath(lang, project));
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
  }, [projectId, lang, router]);

  // 見つからないときは、従来どおりの「見つかりません」表示に任せる
  if (notFound) {
    return <ProjectDetailWrapper projectId={projectId} lang={lang} />;
  }
  return null;
};

export default LegacyProjectRedirect;
