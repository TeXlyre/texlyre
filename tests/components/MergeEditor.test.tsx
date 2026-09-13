import { render } from '@testing-library/react';
import { MergeView } from '@codemirror/merge';
import MergeEditor from '@src/components/conflicts/MergeEditor';
import { useEditorViewExtensions } from '@src/hooks/editor/useEditorViewExtensions';

jest.mock('@src/hooks/editor/useEditorViewExtensions', () => ({
	useEditorViewExtensions: jest.fn(() => []),
}));

jest.mock('@src/extensions/codemirror/ConflictsGutterExtension', () => ({
	conflictsGutterExtension: jest.fn(() => []),
}));

jest.mock('@codemirror/merge', () => ({
	MergeView: jest.fn().mockImplementation((config) => {
		const makeView = (content: string) => ({
			state: {
				doc: {
					length: content.length,
					toString: () => content,
				},
			},
			dispatch: jest.fn(),
		});
		return {
			a: makeView(config.a.doc),
			b: makeView(config.b.doc),
			destroy: jest.fn(),
		};
	}),
}));

const mockedExtensions = useEditorViewExtensions as jest.MockedFunction<
	typeof useEditorViewExtensions
>;
const mockedMergeView = MergeView as jest.MockedClass<typeof MergeView>;

describe('MergeEditor', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('uses the TeXlyre editor extension pipeline for both sides', () => {
		render(
			<MergeEditor
				fileName='/chapters/main.tex'
				local='local text'
				remote='remote text'
			/>,
		);

		expect(mockedExtensions).toHaveBeenCalledWith({
			fileName: '/chapters/main.tex',
			content: 'local text',
			readOnly: false,
		});
		expect(mockedExtensions).toHaveBeenCalledWith({
			fileName: '/chapters/main.tex',
			content: 'remote text',
			readOnly: true,
		});
	});

	it('enables inline diff marks for ordinary file comparisons', () => {
		render(<MergeEditor fileName='main.tex' local='old' remote='new' readOnly />);

		expect(mockedMergeView).toHaveBeenCalled();
		const config = mockedMergeView.mock.calls[0][0];
		expect(config.highlightChanges).toBe(true);
		expect(config.gutter).toBe(true);
	});

	it('disables inline diff marks for whole-file add/remove comparisons', () => {
		render(
			<MergeEditor
				fileName='main.tex'
				local=''
				remote='new'
				readOnly
				emptySideNote={{ side: 'a', text: 'File does not exist in this version' }}
			/>,
		);

		expect(mockedMergeView).toHaveBeenCalled();
		const config = mockedMergeView.mock.calls[0][0];
		expect(config.highlightChanges).toBe(false);
		expect(config.gutter).toBe(false);
	});

	it('makes both panes read-only for Git/version comparisons', () => {
		render(<MergeEditor fileName='main.typ' local='old' remote='new' readOnly />);

		expect(mockedExtensions).toHaveBeenNthCalledWith(1, {
			fileName: 'main.typ',
			content: 'old',
			readOnly: true,
		});
		expect(mockedExtensions).toHaveBeenNthCalledWith(2, {
			fileName: 'main.typ',
			content: 'new',
			readOnly: true,
		});
	});
});
