// src/utils/gitRemoteCommitUtils.ts
import type {
	GitRemoteCommitChange,
	GitRemoteCommitObject,
	GitRemoteSignature,
} from '../types/gitRemote';

export type GitTreeMode = '100644' | '100755' | '040000' | '160000' | '120000';

export { getGit } from './gitUtils';

export interface LocalCommitFile {
	path: string;
	mode: string;
	oid: string;
}

export interface LocalCommitObject {
	oid: string;
	tree: string;
	parents: string[];
	message: string;
	author: GitRemoteSignature;
	committer: GitRemoteSignature;
	files: LocalCommitFile[];
	changes: GitRemoteCommitChange[];
}

export interface LocalPushCommit {
	oid: string;
	flattenBaseOid?: string;
}

export interface TreeNode {
	files: Array<{
		path: string;
		mode: GitTreeMode;
		type: 'blob' | 'commit';
		oid: string;
	}>;
	directories: Map<string, TreeNode>;
}

export const safeRefPart = (value: string): string =>
	value
		.replace(/[^A-Za-z0-9._/-]+/g, '-')
		.replace(/\.{2,}/g, '.')
		.replace(/^[-/.]+|[-/.]+$/g, '') || 'remote';

const gitPathEncoder = new TextEncoder();
export const compareGitTreeEntries = (
	left: { path: string; type: 'blob' | 'tree' | 'commit' },
	right: { path: string; type: 'blob' | 'tree' | 'commit' },
): number => {
	const leftBytes = gitPathEncoder.encode(
		left.type === 'tree' ? `${left.path}/` : left.path,
	);
	const rightBytes = gitPathEncoder.encode(
		right.type === 'tree' ? `${right.path}/` : right.path,
	);
	const length = Math.min(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		if (leftBytes[index] !== rightBytes[index]) {
			return leftBytes[index] - rightBytes[index];
		}
	}
	return leftBytes.length - rightBytes.length;
};

export const normalizeMode = (mode: string): GitTreeMode => {
	if (
		mode === '100644' ||
		mode === '100755' ||
		mode === '040000' ||
		mode === '160000' ||
		mode === '120000'
	)
		return mode;
	throw new Error(`Unsupported Git tree mode: ${mode}`);
};

export const signatureToRemote = (signature: {
	name: string;
	email: string;
	timestamp: number;
	timezoneOffset: number;
}): GitRemoteSignature => {
	const offsetMinutes = signature.timezoneOffset;
	const local = new Date((signature.timestamp - offsetMinutes * 60) * 1000);
	const pad = (value: number) => String(value).padStart(2, '0');
	const sign = offsetMinutes <= 0 ? '+' : '-';
	const absoluteOffset = Math.abs(offsetMinutes);
	const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(
		local.getUTCDate(),
	)}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(
		local.getUTCSeconds(),
	)}${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
	return { name: signature.name, email: signature.email, date };
};

export const signatureFromRemote = (
	signature: GitRemoteSignature,
	timezoneOffsetOverride?: number,
) => {
	const timestampMs = Date.parse(signature.date);
	if (!Number.isFinite(timestampMs)) {
		throw new Error(`Invalid Git commit date: ${signature.date}`);
	}
	let timezoneOffset = 0;
	const match = signature.date.match(/([+-])(\d{2}):?(\d{2})$/);
	if (match) {
		const minutes = Number(match[2]) * 60 + Number(match[3]);
		timezoneOffset = match[1] === '+' ? -minutes : minutes;
	}
	return {
		name: signature.name,
		email: signature.email,
		timestamp: Math.floor(timestampMs / 1000),
		timezoneOffset: timezoneOffsetOverride ?? timezoneOffset,
	};
};

const gitTimezone = (timezoneOffset: number): string => {
	const minutesEast = -timezoneOffset;
	const sign = minutesEast >= 0 ? '+' : '-';
	const absolute = Math.abs(minutesEast);
	return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(
		absolute % 60,
	).padStart(2, '0')}`;
};

const signatureHeader = (
	name: string,
	email: string,
	timestamp: number,
	timezoneOffset: number,
): string => `${name} <${email}> ${timestamp} ${gitTimezone(timezoneOffset)}`;

const signatureHeaderValue = (
	signature: string,
	preserveTerminalNewline: boolean,
): string => {
	let normalized = signature.replace(/\r\n/g, '\n');
	if (!preserveTerminalNewline) normalized = normalized.trim();
	return `gpgsig ${normalized.replace(/\n/g, '\n ')}`;
};

const serializeStructuredCommit = (commit: {
	tree: string;
	parents: string[];
	author: ReturnType<typeof signatureFromRemote>;
	committer: ReturnType<typeof signatureFromRemote>;
	message: string;
	gpgsig?: string;
	preserveSignatureTerminalNewline?: boolean;
}): Uint8Array => {
	const lines = [`tree ${commit.tree}`];
	for (const parent of commit.parents) lines.push(`parent ${parent}`);
	lines.push(
		`author ${signatureHeader(
			commit.author.name,
			commit.author.email,
			commit.author.timestamp,
			commit.author.timezoneOffset,
		)}`,
	);
	lines.push(
		`committer ${signatureHeader(
			commit.committer.name,
			commit.committer.email,
			commit.committer.timestamp,
			commit.committer.timezoneOffset,
		)}`,
	);
	if (commit.gpgsig) {
		lines.push(
			signatureHeaderValue(
				commit.gpgsig,
				Boolean(commit.preserveSignatureTerminalNewline),
			),
		);
	}
	return new TextEncoder().encode(`${lines.join('\n')}\n\n${commit.message}`);
};

const serializeSignedPayload = (
	payload: string,
	signature: string,
	preserveSignatureTerminalNewline: boolean,
): Uint8Array | null => {
	const normalizedPayload = payload.replace(/\r\n/g, '\n');
	const separator = normalizedPayload.indexOf('\n\n');
	if (separator < 0) return null;
	const headers = normalizedPayload.slice(0, separator);
	const message = normalizedPayload.slice(separator + 2);
	const gpgsig = signatureHeaderValue(
		signature,
		preserveSignatureTerminalNewline,
	);
	return new TextEncoder().encode(`${headers}\n${gpgsig}\n\n${message}`);
};

const sha1GitObject = async (
	type: string,
	content: Uint8Array,
): Promise<string> => {
	const header = new TextEncoder().encode(`${type} ${content.byteLength}\0`);
	const wrapped = new Uint8Array(header.byteLength + content.byteLength);
	wrapped.set(header);
	wrapped.set(content, header.byteLength);
	const digest = await crypto.subtle.digest('SHA-1', wrapped);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
};

const normalizedApiDate = (date: string): boolean => /Z$/i.test(date);
const REAL_WORLD_TIMEZONE_OFFSETS = Array.from(
	{ length: 113 },
	(_, index) => -14 * 60 + index * 15,
);

const uniqueMessages = (message: string): string[] => {
	const candidates = [message];
	if (message.endsWith('\n')) candidates.push(message.slice(0, -1));
	else candidates.push(`${message}\n`);
	return [...new Set(candidates)];
};

export const findExactRemoteCommitContent = async (
	remote: GitRemoteCommitObject,
	tree: string,
): Promise<Uint8Array | null> => {
	const matches = async (
		content: Uint8Array | null,
	): Promise<Uint8Array | null> => {
		if (!content) return null;
		return (await sha1GitObject('commit', content)) === remote.oid
			? content
			: null;
	};

	if (remote.gpgsig && remote.unsignedPayload) {
		for (const preserveTerminalNewline of [true, false]) {
			const exact = await matches(
				serializeSignedPayload(
					remote.unsignedPayload,
					remote.gpgsig,
					preserveTerminalNewline,
				),
			);
			if (exact) return exact;
		}
	}

	const baseAuthor = signatureFromRemote(remote.author);
	const baseCommitter = signatureFromRemote(remote.committer);
	const authorOffsets = normalizedApiDate(remote.author.date)
		? REAL_WORLD_TIMEZONE_OFFSETS
		: [baseAuthor.timezoneOffset];
	const committerOffsets = normalizedApiDate(remote.committer.date)
		? REAL_WORLD_TIMEZONE_OFFSETS
		: [baseCommitter.timezoneOffset];
	const messages = uniqueMessages(remote.message);
	const signatureTerminalNewlines = remote.gpgsig ? [true, false] : [false];

	const candidate = async (
		authorOffset: number,
		committerOffset: number,
	): Promise<Uint8Array | null> => {
		const author = signatureFromRemote(remote.author, authorOffset);
		const committer = signatureFromRemote(remote.committer, committerOffset);
		for (const message of messages) {
			for (const preserveSignatureTerminalNewline of signatureTerminalNewlines) {
				const exact = await matches(
					serializeStructuredCommit({
						tree,
						parents: remote.parents,
						author,
						committer,
						message,
						gpgsig: remote.gpgsig,
						preserveSignatureTerminalNewline,
					}),
				);
				if (exact) return exact;
			}
		}
		return null;
	};

	if (
		normalizedApiDate(remote.author.date) &&
		normalizedApiDate(remote.committer.date)
	) {
		for (const offset of REAL_WORLD_TIMEZONE_OFFSETS) {
			const exact = await candidate(offset, offset);
			if (exact) return exact;
		}
	}

	const candidates: Array<[number, number]> = [];
	for (const authorOffset of authorOffsets) {
		for (const committerOffset of committerOffsets) {
			if (authorOffset !== committerOffset)
				candidates.push([authorOffset, committerOffset]);
		}
	}
	for (let index = 0; index < candidates.length; index += 32) {
		const results = await Promise.all(
			candidates
				.slice(index, index + 32)
				.map(([authorOffset, committerOffset]) =>
					candidate(authorOffset, committerOffset),
				),
		);
		const exact = results.find((content) => content !== null);
		if (exact) return exact;
	}
	return null;
};
