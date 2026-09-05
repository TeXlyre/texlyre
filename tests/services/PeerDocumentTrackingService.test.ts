import * as Y from 'yjs';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockWatch = jest.fn();
const mockUnwatch = jest.fn();

jest.mock('@src/services/CollabService', () => ({
	collabService: {
		connect: (...args: unknown[]) => mockConnect(...args),
		disconnect: (...args: unknown[]) => mockDisconnect(...args),
	},
}));

jest.mock('@src/services/DocumentFileSyncService', () => ({
	documentFileSyncService: {
		watch: (...args: unknown[]) => mockWatch(...args),
		unwatch: (...args: unknown[]) => mockUnwatch(...args),
	},
}));

type TrackingModule = typeof import('@src/services/PeerDocumentTrackingService');

describe('PeerDocumentTrackingService background document sync', () => {
	const PROJECT_ID = 'project-1';

	let module: TrackingModule;
	let doc: Y.Doc;
	let states: Map<number, { openDocs?: string[] }>;
	let handlers: Array<() => void>;
	let awareness: any;

	const setRemoteOpenDocs = (openDocs: string[]) => {
		states.set(2, { openDocs });
		for (const handler of handlers) handler();
	};

	beforeEach(async () => {
		mockConnect.mockReset();
		mockDisconnect.mockReset();
		mockWatch.mockReset();
		mockUnwatch.mockReset();

		doc = new Y.Doc();
		mockConnect.mockReturnValue({ doc });

		states = new Map();
		handlers = [];
		awareness = {
			clientID: 1,
			getStates: () => states,
			setLocalStateField: jest.fn(),
			on: (_event: string, handler: () => void) => handlers.push(handler),
			off: jest.fn(),
		};

		jest.resetModules();
		module = await import('@src/services/PeerDocumentTrackingService');
	});

	it('watches a document a peer opens while it has no local editor', () => {
		module.peerDocumentTrackingService.registerProject(
			PROJECT_ID,
			awareness,
			null,
		);
		setRemoteOpenDocs(['doc-1']);

		expect(mockConnect).toHaveBeenCalledWith(PROJECT_ID, 'yjs_doc-1', {});
		expect(mockWatch).toHaveBeenCalledWith(PROJECT_ID, 'doc-1', doc);
	});

	it('hands the document back to the editor when it is opened locally', () => {
		module.peerDocumentTrackingService.registerProject(
			PROJECT_ID,
			awareness,
			null,
		);
		setRemoteOpenDocs(['doc-1']);
		module.peerDocumentTrackingService.setLocalOpenDocument(
			PROJECT_ID,
			'doc-1',
		);

		expect(mockUnwatch).toHaveBeenCalledWith(PROJECT_ID, 'doc-1');
		expect(mockWatch).toHaveBeenCalledTimes(1);
	});

	it('never watches a document that is already open locally', () => {
		module.peerDocumentTrackingService.registerProject(
			PROJECT_ID,
			awareness,
			null,
		);
		module.peerDocumentTrackingService.setLocalOpenDocument(
			PROJECT_ID,
			'doc-1',
		);
		setRemoteOpenDocs(['doc-1']);

		expect(mockConnect).not.toHaveBeenCalled();
		expect(mockWatch).not.toHaveBeenCalled();
	});

	it('unwatches before disconnecting when the peer closes the document', () => {
		const calls: string[] = [];
		mockUnwatch.mockImplementation(() => calls.push('unwatch'));
		mockDisconnect.mockImplementation(() => calls.push('disconnect'));

		module.peerDocumentTrackingService.registerProject(
			PROJECT_ID,
			awareness,
			null,
		);
		setRemoteOpenDocs(['doc-1']);
		setRemoteOpenDocs([]);

		expect(calls).toEqual(['unwatch', 'disconnect']);
	});

	it('unwatches every background document when the project is left', () => {
		const teardown = module.peerDocumentTrackingService.registerProject(
			PROJECT_ID,
			awareness,
			null,
		);
		setRemoteOpenDocs(['doc-1', 'doc-2']);
		teardown();

		expect(mockUnwatch).toHaveBeenCalledWith(PROJECT_ID, 'doc-1');
		expect(mockUnwatch).toHaveBeenCalledWith(PROJECT_ID, 'doc-2');
	});
});
