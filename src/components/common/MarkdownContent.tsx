// src/components/common/MarkdownContent.tsx
import { memo } from 'react';

import { renderMarkdownHtml } from '../../utils/markdownUtils';

interface MarkdownContentProps {
	content: string;
	className?: string;
}

const MarkdownContent = memo(function MarkdownContent({
	content,
	className = '',
}: MarkdownContentProps) {
	return (
		<div
			className={`markdown-content ${className}`.trim()}
			/* biome-ignore lint/security/noDangerouslySetInnerHtml: markdown HTML is sanitized by DOMPurify. */
			dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(content) }}
		/>
	);
});

export default MarkdownContent;
