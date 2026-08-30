import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';

import LSPNavigationButton from '@src/components/editor/LSPNavigationButton';
import {
	goToLSPLocation,
	resolveLSPNavigationTarget,
} from '@src/extensions/codemirror/lsp/lspNavigation';
import { defaultEditorSettings } from '@src/contexts/EditorContext';
import { genericLSPService } from '@src/services/GenericLSPService';
import { useEditor } from '@src/hooks/useEditor';

jest.mock('@src/components/common/PositionedDropdown', () => ({
	__esModule: true,
	default: ({
		isOpen,
		children,
	}: { isOpen: boolean; children: React.ReactNode }) =>
		isOpen ? <div>{children}</div> : null,
}));

jest.mock('@src/hooks/useEditor', () => ({ useEditor: jest.fn() }));

jest.mock('@src/extensions/codemirror/lsp/lspNavigation', () => {
	const actual = jest.requireActual(
		'@src/extensions/codemirror/lsp/lspNavigation',
	);
	return {
		...actual,
		goToLSPLocation: jest.fn(),
		resolveLSPNavigationTarget: jest.fn(),
	};
});

describe('LSPNavigationButton', () => {
	const mockEditorSettings = (lspNavigation: boolean) => {
		jest.mocked(useEditor).mockReturnValue({
			editorSettings: {
				...defaultEditorSettings,
				languageFeatures: {
					...defaultEditorSettings.languageFeatures,
					lspNavigation,
				},
			},
		} as unknown as ReturnType<typeof useEditor>);
	};

	const mockCapabilities = (serverCapabilities: Record<string, unknown>) => {
		jest
			.spyOn(genericLSPService, 'getAllClientsForFile')
			.mockReturnValue([{ serverCapabilities } as never]);
		jest
			.spyOn(genericLSPService, 'onCapabilitiesChange')
			.mockReturnValue(() => {});
		jest.spyOn(genericLSPService, 'onStatusChange').mockReturnValue(() => {});
	};

	const renderInEditor = () =>
		render(
			<div className='editor-container'>
				<LSPNavigationButton fileName='test.tex' />
				<div className='cm-editor' />
			</div>,
		);

	const flushProbe = async () => {
		await act(async () => {
			await Promise.resolve();
		});
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockEditorSettings(true);
		jest.mocked(resolveLSPNavigationTarget).mockResolvedValue({
			uri: 'file:///test.tex',
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 1 },
			},
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('offers only the navigation actions the server advertises', async () => {
		mockCapabilities({
			definitionProvider: true,
			implementationProvider: true,
		});
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);

		renderInEditor();
		await flushProbe();
		fireEvent.click(screen.getByTitle('Go to...'));

		expect(screen.getByText('Go to Definition')).toBeInTheDocument();
		expect(screen.getByText('Go to Implementation')).toBeInTheDocument();
		expect(screen.queryByText('Go to Declaration')).not.toBeInTheDocument();
		expect(screen.queryByText('Go to Type Definition')).not.toBeInTheDocument();
	});

	it('hides the dropdown toggle for a single supported action', async () => {
		mockCapabilities({ definitionProvider: true });
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);

		renderInEditor();
		await flushProbe();

		expect(screen.getByTitle('Go to Definition')).toBeInTheDocument();
		expect(screen.queryByTitle('Go to...')).not.toBeInTheDocument();
	});

	it('disables navigation when the cursor has no target', async () => {
		mockCapabilities({ definitionProvider: true });
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);
		jest.mocked(resolveLSPNavigationTarget).mockResolvedValue(null);

		renderInEditor();
		await flushProbe();

		expect(screen.getByTitle('No target at cursor')).toBeDisabled();
	});

	it('re-probes when the cursor moves', async () => {
		mockCapabilities({ definitionProvider: true });
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);
		jest.mocked(resolveLSPNavigationTarget).mockResolvedValue(null);

		renderInEditor();
		await flushProbe();
		expect(screen.getByTitle('No target at cursor')).toBeDisabled();

		jest.mocked(resolveLSPNavigationTarget).mockResolvedValue({
			uri: 'file:///test.tex',
			range: {
				start: { line: 2, character: 0 },
				end: { line: 2, character: 4 },
			},
		});
		await act(async () => {
			document.dispatchEvent(new CustomEvent('editor-cursor-update'));
			await Promise.resolve();
		});

		expect(screen.getByTitle('Go to Definition')).toBeEnabled();
	});

	it('navigates using the editor view resolved from the container', async () => {
		mockCapabilities({ definitionProvider: true });
		const view = {} as EditorView;
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue(view);
		jest.mocked(goToLSPLocation).mockResolvedValue(true);

		renderInEditor();
		await flushProbe();
		fireEvent.click(screen.getByTitle('Go to Definition'));

		expect(goToLSPLocation).toHaveBeenCalledWith(view, 'test.tex', 'definition');
	});

	it('does not render without a supported navigation provider', () => {
		mockCapabilities({});

		const { container } = render(<LSPNavigationButton fileName='test.tex' />);

		expect(container).toBeEmptyDOMElement();
	});

	it('does not render when language server navigation is disabled', () => {
		mockEditorSettings(false);
		mockCapabilities({ definitionProvider: true });

		const { container } = render(<LSPNavigationButton fileName='test.tex' />);

		expect(container).toBeEmptyDOMElement();
	});
});
