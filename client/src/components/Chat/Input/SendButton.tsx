import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { SendIcon, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
};

const SubmitButton = React.memo(
  forwardRef((props: { disabled: boolean }, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    return (
      <button
        ref={ref}
        aria-label={localize('com_nav_send_message')}
        id="send-button"
        disabled={props.disabled}
        className={cn(
          'h-10 px-5 rounded-full bg-cyber-gradient hover:scale-105 disabled:opacity-50 disabled:hover:scale-100',
          'text-white font-bold text-sm tracking-wide transition-all',
          'shadow-glow hover:shadow-glow-strong',
          'flex items-center gap-2 shrink-0',
          'disabled:cursor-not-allowed disabled:shadow-none',
        )}
        data-testid="send-button"
        type="submit"
      >
        <span>Send</span>
        <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
      </button>
    );
  }),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    return <SubmitButton ref={ref} disabled={props.disabled || !data.text} />;
  }),
);

export default SendButton;
