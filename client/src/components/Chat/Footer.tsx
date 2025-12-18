import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import TagManager from 'react-gtm-module';
import { Constants } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function Footer({ className }: { className?: string }) {
  const { data: config } = useGetStartupConfig();
  const localize = useLocalize();

  const privacyPolicy = config?.interface?.privacyPolicy;
  const termsOfService = config?.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl != null && (
    <a
      className="text-text-secondary underline"
      href={privacyPolicy.externalUrl}
      target={privacyPolicy.openNewTab === true ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl != null && (
    <a
      className="text-text-secondary underline"
      href={termsOfService.externalUrl}
      target={termsOfService.openNewTab === true ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const mainContentParts = (
    typeof config?.customFooter === 'string'
      ? config.customFooter
      : '[Scentier ' +
        Constants.VERSION +
        '](https://scentier.com) - ' +
        localize('com_ui_latest_footer')
  ).split('|');

  useEffect(() => {
    if (config?.analyticsGtmId != null && typeof window.google_tag_manager === 'undefined') {
      const tagManagerArgs = {
        gtmId: config.analyticsGtmId,
      };
      TagManager.initialize(tagManagerArgs);
    }
  }, [config?.analyticsGtmId]);

  const mainContentRender = mainContentParts.map((text, index) => (
    <React.Fragment key={`main-content-part-${index}`}>
      <ReactMarkdown
        components={{
          a: ({ node: _n, href, children, ...otherProps }) => {
            return (
              <a
                className="text-text-secondary underline"
                href={href}
                target="_blank"
                rel="noreferrer"
                {...otherProps}
              >
                {children}
              </a>
            );
          },

          p: ({ node: _n, ...props }) => <span {...props} />,
        }}
      >
        {text.trim()}
      </ReactMarkdown>
    </React.Fragment>
  ));

  const footerElements = [...mainContentRender, privacyPolicyRender, termsOfServiceRender].filter(
    Boolean,
  );

  // 外部リンク（ダミー）
  const externalLinks = [
    { href: 'https://docs.scentier.com', label: 'ドキュメント' },
    { href: 'https://support.scentier.com', label: 'サポート' },
    { href: 'https://about.scentier.com', label: '会社情報' },
  ];

  return (
    <div className="relative w-full">
      <div
        className={
          className ??
          'absolute bottom-0 left-0 right-0 hidden items-center justify-between gap-4 px-4 py-2 text-center text-xs text-text-primary sm:flex md:px-8'
        }
        role="contentinfo"
      >
        {/* ロゴ部分 */}
        <div className="flex items-center gap-2">
          <img 
            src="/assets/favicon-32x32.png" 
            alt="Scentier Logo" 
            className="h-5 w-5 opacity-70"
          />
          <span className="text-text-secondary font-medium">Scentier</span>
        </div>

        {/* 中央のコンテンツ */}
        <div className="flex items-center justify-center gap-2">
          {footerElements.map((contentRender, index) => {
            const isLastElement = index === footerElements.length - 1;
            return (
              <React.Fragment key={`footer-element-${index}`}>
                {contentRender}
                {!isLastElement && (
                  <div
                    key={`separator-${index}`}
                    className="h-2 border-r-[1px] border-border-medium"
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 外部リンク */}
        <div className="flex items-center gap-4">
          {externalLinks.map((link, index) => (
            <a
              key={`external-link-${index}`}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-text-secondary hover:text-text-primary hover:underline transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
