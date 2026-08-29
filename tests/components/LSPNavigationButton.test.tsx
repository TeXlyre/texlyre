import { fireEvent, render, screen } from '@testing-library/react';

import LSPNavigationButton from '@src/components/editor/LSPNavigationButton';
import { genericLSPService } from '@src/services/GenericLSPService';

jest.mock('@src/components/common/PositionedDropdown', () => ({
	__esModule: true,
	default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
		isOpen ? <div>{children}</div> : null,
}));

describe('LSPNavigationButton', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	const mockCapabilities = (serverCapabilities: Record<string, unknown>) => {
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([
			{ serverCapabilities } as any,
		]);
		jest
			.spyOn(genericLSPService, 'onCapabilitiesChange')
			.mockReturnValue(() => {});
		jest.spyOn(genericLSPService, 'onStatusChange').mockReturnValue(() => {});
	};

	it('shows only navigation actions supported by the connected LSP', () => {
		mockCapabilities({
			definitionProvider: true,
			implementationProvider: true,
		});

		render(<LSPNavigationButton fileName='test.tex' />);
		fireEvent.click(screen.getByTitle('Go to...'));

		expect(screen.getByText('Go to Definition')).toBeInTheDocument();
		expect(screen.getByText('Go to Implementation')).toBeInTheDocument();
		expect(screen.queryByText('Go to Declaration')).not.toBeInTheDocument();
		expect(screen.queryByText('Go to Type Definition')).not.toBeInTheDocument();
	});

	it('dispatches definition navigation from F12 only within its editor', () => {
		mockCapabilities({ definitionProvider: true });
		render(
			<div className='editor-container'>
				<LSPNavigationButton fileName='test.tex' />
				<div className='cm-editor'>
					<textarea aria-label='editor' />
				</div>
			</div>,
		);

		const editor = screen.getByLabelText('editor').closest('.cm-editor')!;
		const handler = jest.fn();
		editor.addEventListener('lsp-navigate', handler);
		fireEvent.keyDown(screen.getByLabelText('editor'), { key: 'F12' });

		expect(handler).toHaveBeenCalledTimes(1);
		const event = handler.mock.calls[0][0] as CustomEvent;
		expect(event.detail).toEqual({ fileName: 'test.tex', kind: 'definition' });

		editor.removeEventListener('lsp-navigate', handler);
	});

	it('does not render without a supported navigation provider', () => {
		mockCapabilities({});
		const { container } = render(<LSPNavigationButton fileName='test.tex' />);
		expect(container).toBeEmptyDOMElement();
	});
});
