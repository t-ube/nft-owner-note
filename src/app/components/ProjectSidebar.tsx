import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from "next-themes";
import Image from 'next/image';
import {
  Search,
  Trash2,
  Users,
  Moon,
  Sun,
  Network,
  ChevronDown,
  Book,
  Clock,
  LayoutGrid,
  List,
  Menu as MenuIcon,
  Check,
  Plus,
  Settings,
  Star,
  Wallet,
  X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Project } from '@/utils/db';
import { collectionPath } from '@/utils/routes';
import ProjectCSVImportExport from '@/app/components/ProjectCSVImportExport';
import CollectionFace from '@/app/components/CollectionFace';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';
import { CONTRIBUTORS } from '@/constants/contributors';
import AddProjectDialog from '@/app/components/AddProjectDialog';
import { dbManager } from '@/utils/db';
import { loadRecentProjectIds } from '@/utils/recentProjects';
import { SegmentedControl } from '@/app/components/SegmentedControl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type SectionKey = 'pinned' | 'recent' | 'all';

/** 「最近見た」に出す件数 */
const RECENT_LIMIT = 12;
const SECTION_KEY = 'sidebar.section';

/** 前回選んでいたタブ */
function loadSection(): SectionKey {
  try {
    const stored = localStorage.getItem(SECTION_KEY);
    return stored === 'pinned' || stored === 'recent' || stored === 'all' ? stored : 'all';
  } catch {
    return 'all';
  }
}

function saveSection(section: SectionKey) {
  try {
    localStorage.setItem(SECTION_KEY, section);
  } catch {
    /* 保存できなくても表示には影響しない */
  }
}

interface ProjectSidebarProps {
  projects: Project[];
  currentProjectId?: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDeleteClick: (e: React.MouseEvent, project: Project) => void;
  onProjectsUpdated: () => void;
  lang: string;
}

const ProjectSidebar = ({
  projects,
  currentProjectId,
  searchTerm,
  onSearchChange,
  onDeleteClick,
  onProjectsUpdated,
  lang,
}: ProjectSidebarProps) => {
  const router = useRouter();
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  // モバイルの設定内に出す折りたたみ（PC はフッターのダイアログを使う）
  const [isMobileCreditsOpen, setIsMobileCreditsOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [section, setSection] = useState<SectionKey>('all');
  // お気に入りの切り替えは、親へ知らせず、この一覧の表示だけを更新する
  // （親へ知らせると、開いているプロジェクトが読み直されて画面が作り直されるため）
  const [pinOverrides, setPinOverrides] = useState<Record<string, Pick<Project, 'isPinned' | 'pinnedAt'>>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  // 「最近見た」と、セクションの開閉状態は端末ごとの表示設定として持つ
  useEffect(() => {
    setRecentIds(loadRecentProjectIds());
    setSection(loadSection());
  }, [projects]);

  // 開いているプロジェクトが一覧の外にあるときは、その行までスクロールする
  useEffect(() => {
    const row = currentRowRef.current;
    const list = listRef.current;
    if (!row || !list) return;
    const rowRect = row.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
      row.scrollIntoView({ block: 'center' });
    }
  }, [currentProjectId, projects, recentIds, section]);

  // 「/」で検索欄へ移動する
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const changeSection = (key: SectionKey) => {
    setSection(key);
    saveSection(key);
  };

  const handlePinClick = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    try {
      const updated = await dbManager.setProjectPinned(project.projectId, !project.isPinned);
      if (updated) {
        setPinOverrides(prev => ({
          ...prev,
          [updated.projectId]: { isPinned: updated.isPinned, pinnedAt: updated.pinnedAt },
        }));
      }
    } catch (error) {
      console.error('Failed to update pin:', error);
    }
  };

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  const handleProjectClick = (project: Project) => {
    router.push(collectionPath(lang, project));
    setIsOpen(false);
  };

  const handleOwnerNoteClick = () => {
    router.push(`/${lang}/`);
  };

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  // URL から自動作成されたものは、ユーザーが手を加えるまで出さない
  const visibleProjects = projects
    .filter(project => !project.isAutoCreated)
    .map(project => ({ ...project, ...pinOverrides[project.projectId] }));
  const term = searchTerm.trim().toLowerCase();
  // 検索対象は今のところプロジェクト名（将来は発行者名やアドレスも足せるようにしておく）
  const matches = (project: Project) => project.name.toLowerCase().includes(term);
  const searchResults = visibleProjects.filter(matches);

  const byName = [...visibleProjects].sort((a, b) => a.name.localeCompare(b.name, lang));
  const pinnedProjects = visibleProjects
    .filter(project => project.isPinned)
    .sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0));
  const recentProjects = recentIds
    .map(id => visibleProjects.find(project => project.projectId === id))
    .filter((project): project is Project => !!project)
    .slice(0, RECENT_LIMIT);

  const sectionProjects =
    section === 'pinned' ? pinnedProjects : section === 'recent' ? recentProjects : byName;

  if (!dict) return null;
  const { sidebar: t } = dict.project;

  const isProjectsActive = pathname === `/${lang}` || pathname.startsWith(`/${lang}/projects`);
  const isOwnersActive = pathname.startsWith(`/${lang}/owners`);
  const isCrossActive = pathname.startsWith(`/${lang}/cross-project`);
  const isMyAccountActive = pathname.startsWith(`/${lang}/my-account`);

  /** プロジェクト 1 行（サムネイル・名前・星） */
  const renderProjectRow = (project: Project, keyPrefix = '') => {
    const isCurrent = project.projectId === currentProjectId;
    return (
      <div
        key={`${keyPrefix}${project.id}`}
        ref={isCurrent ? currentRowRef : undefined}
        className={`group flex h-9 cursor-pointer items-center gap-2 border-l-2 px-4 transition-colors ${
          isCurrent
            ? 'border-foreground/40 bg-muted font-semibold text-foreground'
            : 'border-transparent font-medium text-gray-600 hover:bg-[#F5F5F4] dark:text-gray-300 dark:hover:bg-gray-700'
        }`}
        onClick={() => handleProjectClick(project)}
      >
        <CollectionFace
          issuer={project.issuer}
          taxon={project.taxon}
          alt={project.name}
          className="h-[26px] w-[26px] shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
        <button
          type="button"
          onClick={(e) => handlePinClick(e, project)}
          className={`shrink-0 rounded p-0.5 transition-opacity hover:bg-black/10 dark:hover:bg-white/10 ${
            project.isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          title={project.isPinned ? t.unpin : t.pin}
          aria-label={project.isPinned ? t.unpin : t.pin}
        >
          <Star className={`h-[18px] w-[18px] ${project.isPinned ? 'fill-current text-amber-400' : 'text-gray-400'}`} />
        </button>
        <button
          type="button"
          onClick={(e) => onDeleteClick(e, project)}
          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
          title={t.delete}
          aria-label={t.delete}
        >
          <Trash2 className="h-[18px] w-[18px] text-gray-400 transition-colors hover:text-red-500" />
        </button>
      </div>
    );
  };

  const settingsContent = (
    <>
      <div className="pb-2">
        <Button
          variant="outline"
          className="w-full justify-start dark:border-gray-600 dark:text-gray-200"
          onClick={() => {
            window.open(lang === 'en' ? 'https://shirome.gitbook.io/owner-note/en' : 'https://shirome.gitbook.io/owner-note', '_blank');
            setIsOpen(false);
          }}
        >
          <Book className="h-4 w-4 mr-2" />
          {t.manual}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <select
          onChange={(e) => {
            const currentPath = pathname.split('/').slice(2).join('/');
            // ?tab= などのクエリも引き継ぐ
            router.push(`/${e.target.value}/${currentPath}${window.location.search}`);
          }}
          value={pathname.split('/')[1]}
          className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="en">English</option>
          <option value="ja">日本語</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
          className="relative w-10 h-10"
        >
          <Sun className="absolute h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>

      <div className="relative">
        <div className="flex items-center justify-between pt-2 pb-1">
          <span className="text-sm text-gray-500 dark:text-gray-400">Developed by shirome</span>
          <a
            href="https://x.com/shirome_x"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Image
              src="/images/x-logo-black.png"
              alt="X (Twitter)"
              width={20}
              height={20}
              className="opacity-75 hover:opacity-100 transition-opacity dark:invert"
            />
          </a>
        </div>

        <div>
          <button
            onClick={() => setIsMobileCreditsOpen(!isMobileCreditsOpen)}
            className={`
              px-2 py-1 text-xs font-medium
              bg-gray-100 dark:bg-gray-700
              text-gray-600 dark:text-gray-300
              rounded-t-lg shadow-sm
              transition-all
              hover:bg-gray-200 dark:hover:bg-gray-600
              ${isMobileCreditsOpen ? 'bg-gray-200 dark:bg-gray-600' : ''}
              inline-flex items-center gap-1
            `}
          >
            XRPL Community Contributors
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${
                isMobileCreditsOpen ? 'transform rotate-180' : ''
              }`}
            />
          </button>
        </div>

        <div className={`
          overflow-hidden transition-all duration-500 ease-in-out
          ${isMobileCreditsOpen ? 'max-h-32 mt-2 opacity-100' : 'max-h-0 opacity-0 mb-0'}
        `}>
          <div className="pb-5 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex flex-wrap gap-1">
              {CONTRIBUTORS.map((contributor, index) => (
                <span key={index} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  {contributor}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ハンバーガーメニューボタン */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 rounded-md bg-white dark:bg-gray-800 shadow-md"
        aria-label="Menu"
      >
        {isOpen ? (
          <X className="h-6 w-6 dark:text-white" />
        ) : (
          <MenuIcon className="h-6 w-6 dark:text-white" />
        )}
      </button>

      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* サイドバー */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col h-[100dvh] lg:h-screen
        pb-16 lg:pb-0
        overflow-hidden
      `}>
        {/* スクロール可能なコンテナ */}
        <div className="flex flex-col h-full overflow-hidden">
          {/* 上部固定部分 */}
          <div className="p-4 flex-shrink-0">
            <h1
              className="mb-4 flex cursor-pointer items-center gap-2 text-2xl font-bold text-gray-500 transition-colors hover:text-gray-400 dark:text-gray-400 dark:hover:text-gray-200 lg:mb-3"
              onClick={handleOwnerNoteClick}
            >
              <Image
                src="/images/favicon/android-chrome-512x512.png"
                alt=""
                width={28}
                height={28}
                className="shrink-0 rounded-md dark:invert"
              />
              {t.title}
            </h1>

            {/* モバイル: 設定を上寄せで表示 */}
            <div className="lg:hidden">
              {settingsContent}
            </div>

            <div className="hidden lg:block">
              <div className="space-y-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start px-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                onClick={() => {
                  router.push(`/${lang}/owners`);
                  setIsOpen(false);
                }}
              >
                <Users className="h-4 w-4 mr-2" />
                {t.ownersList}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start px-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                onClick={() => {
                  router.push(`/${lang}/cross-project`);
                  setIsOpen(false);
                }}
              >
                <Network className="h-4 w-4 mr-2" />
                {t.integration}
              </Button>

              {/* My Account ボタンは一旦非表示にする */}
              {/*
              <Button
                variant="outline"
                className="w-full justify-start dark:border-gray-600 dark:text-gray-200"
                onClick={() => {
                  router.push(`/${lang}/my-account`);
                  setIsOpen(false);
                }}
              >
                <Wallet className="h-4 w-4 mr-2" />
                {t.myAccount}
              </Button>
              */}
              </div>

              {/* プロジェクト見出しと追加メニュー */}
              <div className="mt-7 mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400">{t.projectsTitle}</h2>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 dark:border-gray-600 dark:text-gray-200"
                      title={t.add.label}
                      aria-label={t.add.label}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setTimeout(() => setIsAddOpen(true), 0)}>
                      {t.add.manual}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* 検索（「/」で移動できる） */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Input
                  ref={searchRef}
                  placeholder={t.search.placeholder}
                  className="h-8 w-full pl-8 pr-8 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
                <kbd className="pointer-events-none absolute right-2 top-1.5 rounded border px-1 text-[10px] leading-5 text-gray-400 dark:border-gray-600">
                  /
                </kbd>
              </div>

              {/* ピン留め・最近見た・すべての切り替え */}
              <SegmentedControl
                value={section}
                onChange={changeSection}
                className="mt-4 w-full"
                options={([
                  ['all', List, t.sections.all],
                  ['recent', Clock, t.sections.recent],
                  ['pinned', Star, t.sections.pinned],
                ] as const).map(([key, Icon, label]) => ({
                  value: key,
                  title: label,
                  label: <Icon className="h-4 w-4 shrink-0" />,
                }))}
              />
            </div>
          </div>

          {/* スクロール可能なプロジェクトリスト（PC のみ） */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 hidden lg:block">
            {term ? (
              // 検索中はタブに関係なく、一致したものを並べる
              searchResults.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{t.noProjects}</div>
              ) : (
                searchResults.map(project => renderProjectRow(project))
              )
            ) : sectionProjects.length === 0 ? (
              <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
                {section === 'pinned' ? t.sections.pinHint : t.noProjects}
              </div>
            ) : (
              sectionProjects.map(project => renderProjectRow(project, `${section}-`))
            )}
          </div>

          {/* フッター（PC のみ）。ヘルプ・設定・クレジットを 1 行に収める */}
          <div className="hidden h-12 shrink-0 items-center justify-between border-t px-3 dark:border-gray-700 lg:flex">
            <button
              type="button"
              onClick={() => window.open(lang === 'en' ? 'https://shirome.gitbook.io/owner-note/en' : 'https://shirome.gitbook.io/owner-note', '_blank')}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-gray-600 transition-colors hover:bg-[#F5F5F4] dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Book className="h-4 w-4" />
              {t.footer.help}
            </button>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t.footer.settings}
                  aria-label={t.footer.settings}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {lang === 'en' ? 'Language' : '言語'}
                </DropdownMenuLabel>
                {([['ja', '日本語'], ['en', 'English']] as const).map(([locale, label]) => (
                  <DropdownMenuItem
                    key={locale}
                    onSelect={() => {
                      const currentPath = pathname.split('/').slice(2).join('/');
                      // ?tab= などのクエリも引き継ぐ
                      router.push(`/${locale}/${currentPath}${window.location.search}`);
                    }}
                    className="justify-between"
                  >
                    <span>{label}</span>
                    {pathname.split('/')[1] === locale && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={e => {
                    e.preventDefault();
                    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
                  }}
                >
                  {resolvedTheme === 'light'
                    ? <Moon className="mr-2 h-4 w-4" />
                    : <Sun className="mr-2 h-4 w-4" />}
                  {lang === 'en'
                    ? (resolvedTheme === 'light' ? 'Dark mode' : 'Light mode')
                    : (resolvedTheme === 'light' ? 'ダークモード' : 'ライトモード')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ProjectCSVImportExport onProjectsUpdated={onProjectsUpdated} lang={lang} asMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>

            <a
              href="https://x.com/shirome_x"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-gray-500 transition-colors hover:bg-[#F5F5F4] dark:text-gray-400 dark:hover:bg-gray-700"
              title={t.footer.followOnX}
            >
              by shirome
              <Image
                src="/images/x-logo-black.png"
                alt="X"
                width={12}
                height={12}
                className="opacity-75 dark:invert"
              />
            </a>
          </div>

          {/* XRPL Community Contributors（PC のみ） */}
          <div className="hidden shrink-0 px-4 lg:block">
            <div>
              <button
                onClick={() => setIsCreditsOpen(!isCreditsOpen)}
                className={`
                  px-2 py-1 text-xs font-medium
                  bg-gray-100 dark:bg-gray-700
                  text-gray-600 dark:text-gray-300
                  rounded-t-lg shadow-sm
                  transition-all
                  hover:bg-gray-200 dark:hover:bg-gray-600
                  ${isCreditsOpen ? 'bg-gray-200 dark:bg-gray-600' : ''}
                  inline-flex items-center gap-1
                `}
              >
                XRPL Community Contributors
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${
                    isCreditsOpen ? 'transform rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            <div className={`
              overflow-hidden transition-all duration-500 ease-in-out
              ${isCreditsOpen ? 'max-h-32 mt-2 opacity-100' : 'max-h-0 opacity-0 mb-0'}
            `}>
              <div className="pb-5 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex flex-wrap gap-1">
                  {CONTRIBUTORS.map((contributor, index) => (
                    <span key={index} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                      {contributor}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <AddProjectDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        lang={lang}
        dict={t.add}
        onAdded={onProjectsUpdated}
      />

      {/* モバイル用ボトムナビゲーション */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t dark:border-gray-700 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] dark:shadow-[0_-2px_8px_rgba(0,0,0,0.3)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4 h-16">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              router.push(`/${lang}/`);
            }}
            className={`flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
              isProjectsActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            aria-label={t.bottomNav.projects}
          >
            <LayoutGrid className="h-5 w-5" />
            <span className="truncate max-w-full px-1">{t.bottomNav.projects}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              router.push(`/${lang}/owners`);
            }}
            className={`flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
              isOwnersActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            aria-label={t.bottomNav.owners}
          >
            <Users className="h-5 w-5" />
            <span className="truncate max-w-full px-1">{t.bottomNav.owners}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              router.push(`/${lang}/cross-project`);
            }}
            className={`flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
              isCrossActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            aria-label={t.bottomNav.crossProject}
          >
            <Network className="h-5 w-5" />
            <span className="truncate max-w-full px-1">{t.bottomNav.crossProject}</span>
          </button>
          
          {/* My Account ボタンは一旦無効にする */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              router.push(`/${lang}/my-account`);
            }}
            className={`flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
              isMyAccountActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            aria-label={t.bottomNav.myAccount}
            disabled={true}
          >
            <Wallet className="h-5 w-5" />
            <span className="truncate max-w-full px-1">{t.bottomNav.myAccount}</span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default ProjectSidebar;