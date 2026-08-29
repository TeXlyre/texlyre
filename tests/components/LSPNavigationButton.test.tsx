import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';

import LSPNavigationButton from '@src/components/editor/LSPNavigationButton';
import {
	goToLSPLocation,
	hasLSPNavigationTarget,
} from '@src/extensions/codemirror/NavigationLSPExtension';
import { genericLSPService } from '@src/services/GenericLSPService';

jest.mock('@src/components/common/PositionedDropdown', () => ({
	__esModule: true,
	default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
		isOpen ? <div>{children}</div> : null,
}));

jest.mock('@src/extensions/codemirror/NavigationLSPExtension', () => {
	const actual = jest.requireActual(
		'@src/extensions/codemirror/NavigationLSPExtension',
	);
	return {
		...actual,
		hasLSPNavigationTarget: jest.fn(),
		goToLSPLocation: jest.fn(),
	};
});

describe('LSPNavigationButton', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
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

	const renderInEditor = () =>
		render(
			<div className='editor-container'>
				<LSPNavigationButton fileName='test.tex' />
				<div className='cm-editor'>
					<textarea aria-label='editor' />
				</div>
			</div>,
		);

	const flushAvailability = async () => {
		await act(async () => {
			jest.advanceTimersByTime(120);
			await Promise.resolve();
		});
	};

	it('shows only navigation actions supported by the connected LSP', async () => {
		mockCapabilities({
			definitionProvider: true,
			implementationProvider: true,
		});
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);
		jest.mocked(hasLSPNavigationTarget).mockResolvedValue(true);

		renderInEditor();
		await flushAvailability();
		fireEvent.click(screen.getByTitle('Go to...'));

		expect(screen.getByText('Go to Definition')).toBeInTheDocument();
		expect(screen.getByText('Go to Implementation')).toBeInTheDocument();
		expect(screen.queryByText('Go to Declaration')).not.toBeInTheDocument();
		expect(screen.queryByText('Go to Type Definition')).not.toBeInTheDocument();
	});

	it('binds when CodeMirror becomes ready after the header mounts', async () => {
		mockCapabilities({ definitionProvider: true });
		const view = {} as EditorView;
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue(view);
		jest.mocked(hasLSPNavigationTarget).mockResolvedValue(true);

		const { container } = render(
			<div className='editor-container'>
				<LSPNavigationButton fileName='test.tex' />
			</div>,
		);

		const controls = screen.getAllByTitle('No navigation target at cursor');
		expect(controls).toHaveLength(2);
		controls.forEach((control) => expect(control).toBeDisabled());

		const editor = document.createElement('div');
		editor.className = 'cm-editor';
		container.querySelector('.editor-container')?.appendChild(editor);

		act(() => {
			document.dispatchEvent(new CustomEvent('editor-ready'));
		});
		await flushAvailability();

		expect(screen.getByTitle('Go to Definition')).toBeEnabled();
	});

	it('disables navigation when the provider has no target at the cursor', async () => {
		mockCapabilities({ definitionProvider: true });
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);
		jest.mocked(hasLSPNavigationTarget).mockResolvedValue(false);

		renderInEditor();
		await flushAvailability();

		const controls = screen.getAllByTitle('No navigation target at cursor');
		expect(controls).toHaveLength(2);
		controls.forEach((control) => expect(control).toBeDisabled());
	});

	it('enables and invokes navigation when the cursor has a target', async () => {
		mockCapabilities({ definitionProvider: true });
		const view = {} as EditorView;
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue(view);
		jest.mocked(hasLSPNavigationTarget).mockResolvedValue(true);
		jest.mocked(goToLSPLocation).mockResolvedValue(true);

		renderInEditor();
		await flushAvailability();

		const button = screen.getByTitle('Go to Definition');
		expect(button).toBeEnabled();
		fireEvent.click(button);

		expect(goToLSPLocation).toHaveBeenCalledWith(view, 'test.tex', 'definition');
	});

	it('keeps the dropdown usable when a non-primary action resolves', async () => {
		mockCapabilities({
			definitionProvider: true,
			implementationProvider: true,
		});
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);
		jest
			.mocked(hasLSPNavigationTarget)
			.mockImplementation(async (_view, _fileName, kind) => kind === 'implementation');

		renderInEditor();
		await flushAvailability();

		expect(screen.getByTitle('No navigation target at cursor')).toBeDisabled();
		expect(screen.getByTitle('Go to...')).toBeEnabled();
	});

	it('does not intercept F12', () => {
		mockCapabilities({ definitionProvider: true });
		jest.spyOn(EditorView, 'findFromDOM').mockReturnValue({} as EditorView);
		jest.mocked(hasLSPNavigationTarget).mockResolvedValue(true);
		renderInEditor();

		const event = new KeyboardEvent('keydown', { key: 'F12', cancelable: true });
		screen.getByLabelText('editor').dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
		expect(goToLSPLocation).not.toHaveBeenCalled();
	});

	it('does not render without a supported navigation provider', () => {
		mockCapabilities({});
		const { container } = render(<LSPNavigationButton fileName='test.tex' />);
		expect(container).toBeEmptyDOMElement();
	});
});
