import { render, screen } from '@testing-library/react';

import ChatMessage from '@src/components/chat/ChatMessage';

it('renders project chat Markdown without changing the message metadata', () => {
	render(
		<ChatMessage
			message={{
				id: '1',
				user: 'Alice',
				content: '**Hello** `main.tex`\n\n[Docs](https://example.com)',
				timestamp: 0,
			}}
			isOwnMessage={false}
		/>,
	);

	expect(screen.getByText('Alice')).toBeInTheDocument();
	expect(screen.getByText('Hello', { selector: 'strong' })).toBeInTheDocument();
	expect(screen.getByText('main.tex', { selector: 'code' })).toBeInTheDocument();
	expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
		'href',
		'https://example.com',
	);
});
