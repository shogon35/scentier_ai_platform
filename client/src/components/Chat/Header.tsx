import { useMemo } from 'react';
import { useMediaQuery } from '@librechat/client';
import { useOutletContext } from 'react-router-dom';
import { getConfigDefaults, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { PresetsMenu, HeaderNewChat, OpenSidebar } from './Menus';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import BookmarkMenu from './Menus/BookmarkMenu';
import { TemporaryChat } from './TemporaryChat';
import AddMultiConvo from './AddMultiConvo';
import { useHasAccess } from '~/hooks';
import { AnimatePresence, motion } from 'framer-motion';

const defaultInterface = getConfigDefaults().interface;

export default function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="sticky z-10 h-16 shrink-0 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between px-6 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-[0_2px_15px_rgba(0,0,0,0.05)]">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-4">
          <AnimatePresence initial={false}>
            {!navVisible && (
              <motion.div
                className="flex items-center gap-2"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                key="header-buttons"
              >
                <OpenSidebar setNavVisible={setNavVisible} />
                <HeaderNewChat />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Model Status Section */}
          <div className="flex items-center gap-3">
            {/* Active Status Indicator */}
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-enterprise-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-enterprise-primary shadow-glow"></span>
            </div>
            
            {/* Model Selector with Enterprise Style */}
            <div className="flex items-center gap-2">
              <ModelSelector startupConfig={startupConfig} />
            </div>

            {/* Encrypted Badge */}
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-enterprise-primary/10 text-enterprise-primary border border-enterprise-primary/20 uppercase tracking-widest font-mono hidden sm:inline-block shadow-glow-sm">
              Encrypted
            </span>
          </div>
          
          {/* Additional Menu Items */}
          <div className={navVisible ? 'flex items-center gap-2' : 'ml-4 flex items-center gap-2'}>
            {interfaceConfig.presets === true && interfaceConfig.modelSelect && <PresetsMenu />}
            {hasAccessToBookmarks === true && <BookmarkMenu />}
            {hasAccessToMultiConvo === true && <AddMultiConvo />}
          </div>
        </div>
        {/* Right Section Actions */}
        <div className="flex items-center gap-3">
          <button className="h-9 px-4 rounded-full bg-gray-100 dark:bg-gray-800 border border-enterprise-primary/20 flex items-center gap-2 hover:bg-enterprise-primary/10 hover:border-enterprise-primary/40 transition-all group">
            <span className="material-symbols-outlined text-[18px] text-enterprise-primary/80 group-hover:text-enterprise-primary">
              share
            </span>
            <span className="text-sm font-bold hidden sm:inline text-enterprise-primary/80 group-hover:text-enterprise-primary">
              Share
            </span>
          </button>
          
          {/* Notification Button */}
          <button className="h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-800 border border-enterprise-primary/20 flex items-center justify-center hover:bg-enterprise-primary/10 hover:border-enterprise-primary/40 transition-all relative group">
            <span className="material-symbols-outlined text-[20px] text-enterprise-primary/80 group-hover:text-enterprise-primary">
              notifications
            </span>
            <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-enterprise-accent shadow-[0_0_8px_rgba(0,188,212,0.8)]"></span>
          </button>
          
          {/* Original Export and Share Menu (hidden but functional) */}
          <div className="hidden">
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            />
          </div>
          
          {!isSmallScreen && <TemporaryChat />}
          
          {isSmallScreen && (
            <>
              <ExportAndShareMenu
                isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
              />
              <TemporaryChat />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
