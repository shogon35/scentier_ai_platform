import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { useToastContext, useMediaQuery } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import { useUpdateConversationMutation } from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import { useNavigateToConvo, useLocalize } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { ConvoOptions } from './ConvoOptions';
import RenameForm from './RenameForm';
import { cn, logger } from '~/utils';
import ConvoLink from './ConvoLink';
import store from '~/store';

interface ConversationProps {
  conversation: TConversation;
  retainView: () => void;
  toggleNav: () => void;
}

export default function Conversation({ conversation, retainView, toggleNav }: ConversationProps) {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const currentConvoId = useMemo(() => params.conversationId, [params.conversationId]);
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { conversationId, title = '' } = conversation;

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenaming] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const previousTitle = useRef(title);

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  const isActiveConvo = useMemo(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return currentConvoId === Constants.NEW_CONVO;
    }

    if (currentConvoId !== Constants.NEW_CONVO) {
      return currentConvoId === conversationId;
    } else {
      const latestConvo = activeConvos?.[0];
      return latestConvo === conversationId;
    }
  }, [currentConvoId, conversationId, activeConvos]);

  const handleRename = () => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      logger.error('Error renaming conversation', error);
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  const handleNavigation = (ctrlOrMetaKey: boolean) => {
    if (ctrlOrMetaKey) {
      toggleNav();
      const baseUrl = window.location.origin;
      const path = `/c/${conversationId}`;
      window.open(baseUrl + path, '_blank');
      return;
    }

    if (currentConvoId === conversationId || isPopoverActive) {
      return;
    }

    toggleNav();

    if (typeof title === 'string' && title.length > 0) {
      document.title = title;
    }

    navigateToConvo(conversation, {
      currentConvoId,
      resetLatestMessage: !(conversationId ?? '') || conversationId === Constants.NEW_CONVO,
    });
  };

  const convoOptionsProps = {
    title,
    retainView,
    renameHandler: handleRename,
    isActiveConvo,
    conversationId,
    isPopoverActive,
    setIsPopoverActive,
  };

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
        isActiveConvo 
          ? 'bg-enterprise-primary/10 border border-enterprise-primary/20 text-enterprise-primary shadow-glow-sm' 
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100',
      )}
      role="button"
      tabIndex={renaming ? -1 : 0}
      aria-label={`${title || localize('com_ui_untitled')} conversation`}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        if (e.button === 0) {
          handleNavigation(e.ctrlKey || e.metaKey);
        }
      }}
      onKeyDown={(e) => {
        if (renaming) {
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNavigation(false);
        }
      }}
      style={{ cursor: renaming ? 'default' : 'pointer' }}
      data-testid="convo-item"
    >
      {renaming ? (
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      ) : (
        <ConvoLink
          isActiveConvo={isActiveConvo}
          title={title}
          onRename={handleRename}
          isSmallScreen={isSmallScreen}
          localize={localize}
        >
          <span className={cn(
            "material-symbols-outlined text-[20px] transition-colors",
            isActiveConvo ? "text-enterprise-primary drop-shadow-[0_0_5px_rgba(0,123,255,0.3)]" : "group-hover:text-enterprise-primary"
          )}>
            {conversation.endpoint === 'gptPlugins' ? 'extension' :
             conversation.endpoint === 'azureOpenAI' ? 'cloud' :
             conversation.endpoint === 'google' ? 'language' :
             conversation.endpoint === 'anthropic' ? 'psychology' :
             conversation.agent_id ? 'support_agent' :
             'chat_bubble'}
          </span>
        </ConvoLink>
      )}
      <div
        className={cn(
          'ml-auto flex origin-right transition-all duration-200',
          isPopoverActive || isActiveConvo
            ? 'pointer-events-auto opacity-100 translate-x-0'
            : 'pointer-events-none opacity-0 translate-x-2 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-x-0 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-x-0',
        )}
        aria-hidden={!(isPopoverActive || isActiveConvo)}
      >
        {!renaming && <ConvoOptions {...convoOptionsProps} />}
      </div>
    </div>
  );
}
