import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import { TooltipAnchor, NewChatIcon, MobileSidebar, Sidebar, Button } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

export default function NewChat({
  index = 0,
  toggleNav,
  subHeaders,
  isSmallScreen,
  headerButtons,
}: {
  index?: number;
  toggleNav: () => void;
  isSmallScreen?: boolean;
  subHeaders?: React.ReactNode;
  headerButtons?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  /** Note: this component needs an explicit index passed if using more than one */
  const { newConversation: newConvo } = useNewConvo(index);
  const navigate = useNavigate();
  const localize = useLocalize();
  const { conversation } = store.useCreateConversationAtom(index);

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        window.open('/c/new', '_blank');
        return;
      }
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      newConvo();
      navigate('/c/new', { state: { focusChat: true } });
      if (isSmallScreen) {
        toggleNav();
      }
    },
    [queryClient, conversation, newConvo, navigate, toggleNav, isSmallScreen],
  );

  return (
    <>
      {/* Enterprise AI Style Header with Logo */}
      <div className="py-6 flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-enterprise-primary to-enterprise-accent flex items-center justify-center shrink-0 shadow-glow-sm ring-1 ring-white/30">
          <span className="material-symbols-outlined text-white text-[24px]">smart_toy</span>
        </div>
        <div className="flex flex-col">
          <h1 className="text-base font-bold leading-tight font-tech tracking-wide text-gray-900 dark:text-gray-100 drop-shadow-[0_0_5px_rgba(0,0,0,0.1)]">
            Scentier<span className="text-enterprise-primary">.AI</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-[10px] font-mono uppercase tracking-widest">
            Sys.Ver {Constants.VERSION}
          </p>
        </div>
        {/* Sidebar Toggle Button */}
        <TooltipAnchor
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              size="icon"
              variant="ghost"
              data-testid="close-sidebar-button"
              aria-label={localize('com_nav_close_sidebar')}
              className="ml-auto rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={toggleNav}
            >
              <Sidebar className="h-4 w-4 text-gray-500" />
            </Button>
          }
        />
      </div>
      
      {/* Enterprise AI Style New Session Button */}
      <div className="px-0 mb-6">
        <button
          data-testid="nav-new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-white dark:bg-gray-800 border border-enterprise-primary/20 text-enterprise-primary hover:bg-enterprise-primary/10 hover:border-enterprise-primary/40 transition-all active:scale-95 group shadow-sm relative overflow-hidden"
          onClick={clickHandler}
        >
          <div className="absolute inset-0 bg-enterprise-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <span className="material-symbols-outlined text-[20px] transition-transform group-hover:rotate-90 text-enterprise-primary relative z-10">
            add
          </span>
          <span className="text-sm font-bold text-enterprise-primary relative z-10 tracking-wide">
            New Session
          </span>
        </button>
      </div>
      
      {/* Additional header buttons */}
      {headerButtons && (
        <div className="mb-4 flex gap-2">
          {headerButtons}
        </div>
      )}
      
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
