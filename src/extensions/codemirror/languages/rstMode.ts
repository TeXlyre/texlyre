// src/extensions/codemirror/languages/rstMode.ts
// Port of the CodeMirror 5 reStructuredText mode (MIT licensed, copyright by
// Marijn Haverbeke and others) to a CodeMirror 6 stream parser.
// @codemirror/legacy-modes does not ship an rst mode because the original
// relies on the overlay addon and on nested python/stex modes.
import type { StreamParser } from '@codemirror/language';
import { python } from '@codemirror/legacy-modes/mode/python';
import { stex } from '@codemirror/legacy-modes/mode/stex';

type AnyParser = StreamParser<any>;

let currentIndentUnit = 2;

const startInner = (mode: AnyParser) =>
	mode.startState ? mode.startState(currentIndentUnit) : {};

const copyInner = (mode: AnyParser, state: any) =>
	mode.copyState ? mode.copyState(state) : state;

function createRstBase(): AnyParser {
	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	function format(string: string, ...args: any[]): string {
		return string.replace(/{(\d+)}/g, (match, n) =>
			typeof args[n] !== 'undefined' ? args[n] : match,
		);
	}

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	const modePython = python;
	const modeStex = stex;

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	const SEPA = '\\s+';
	const TAIL = '(?:\\s*|\\W|$)',
		rxTail = new RegExp(format('^{0}', TAIL));

	const NAME =
			'(?:[^\\W\\d_](?:[\\w!"#$%&\'()\\*\\+,\\-\\./:;<=>\\?]*[^\\W_])?)',
		rxName = new RegExp(format('^{0}', NAME));
	const NAME_WWS =
		'(?:[^\\W\\d_](?:[\\w\\s!"#$%&\'()\\*\\+,\\-\\./:;<=>\\?]*[^\\W_])?)';
	const REF_NAME = format('(?:{0}|`{1}`)', NAME, NAME_WWS);

	const TEXT1 = '(?:[^\\s\\|](?:[^\\|]*[^\\s\\|])?)';
	const TEXT2 = '(?:[^\\`]+)',
		rxText2 = new RegExp(format('^{0}', TEXT2));

	const rxSection = /^([!'#$%&"()*+,-./:;<=>?@[\\\]^_`{|}~])\1{3,}\s*$/;
	const rxExplicit = new RegExp(format('^\\.\\.{0}', SEPA));
	const rxLink = new RegExp(format('^_{0}:{1}|^__:{1}', REF_NAME, TAIL));
	const rxDirective = new RegExp(format('^{0}::{1}', REF_NAME, TAIL));
	const rxSubstitution = new RegExp(
		format('^\\|{0}\\|{1}{2}::{3}', TEXT1, SEPA, REF_NAME, TAIL),
	);
	const rxFootnote = new RegExp(
		format('^\\[(?:\\d+|#{0}?|\\*)]{1}', REF_NAME, TAIL),
	);
	const rxCitation = new RegExp(format('^\\[{0}\\]{1}', REF_NAME, TAIL));

	const rxSubstitutionRef = new RegExp(format('^\\|{0}\\|', TEXT1));
	const rxFootnoteRef = new RegExp(
		format('^\\[(?:\\d+|#{0}?|\\*)]_', REF_NAME),
	);
	const rxCitationRef = new RegExp(format('^\\[{0}\\]_', REF_NAME));
	const rxLinkRef1 = new RegExp(format('^{0}__?', REF_NAME));
	const rxLinkRef2 = new RegExp(format('^`{0}`_', TEXT2));

	const rxRolePre = new RegExp(format('^:{0}:`{1}`{2}', NAME, TEXT2, TAIL));
	const rxRoleSuf = new RegExp(format('^`{1}`:{0}:{2}', NAME, TEXT2, TAIL));
	const rxRole = new RegExp(format('^:{0}:{1}', NAME, TAIL));

	const rxDirectiveName = new RegExp(format('^{0}', REF_NAME));
	const rxDirectiveTail = new RegExp(format('^::{0}', TAIL));
	const rxSubstitutionText = new RegExp(format('^\\|{0}\\|', TEXT1));
	const rxSubstitutionSepa = new RegExp(format('^{0}', SEPA));
	const rxSubstitutionName = new RegExp(format('^{0}', REF_NAME));
	const rxSubstitutionTail = new RegExp(format('^::{0}', TAIL));
	const rxLinkHead = /^_/;
	const rxLinkName = new RegExp(format('^{0}|_', REF_NAME));
	const rxLinkTail = new RegExp(format('^:{0}', TAIL));

	const rxVerbatim = /^::\s*$/;
	const rxExamples = /^\s+(?:>>>|In \[\d+\]:)\s/;

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	function toNormal(stream, state) {
		let token = null;

		if (stream.sol() && stream.match(rxExamples, false)) {
			change(state, toMode, {
				mode: modePython,
				local: startInner(modePython),
			});
		} else if (stream.sol() && stream.match(rxExplicit)) {
			change(state, toExplicit);
			token = 'meta';
		} else if (stream.sol() && stream.match(rxSection)) {
			change(state, toNormal);
			token = 'header';
		} else if (phase(state) === rxRolePre || stream.match(rxRolePre, false)) {
			switch (stage(state)) {
				case 0:
					change(state, toNormal, context(rxRolePre, 1));
					stream.match(/^:/);
					token = 'meta';
					break;
				case 1:
					change(state, toNormal, context(rxRolePre, 2));
					stream.match(rxName);
					token = 'keyword';

					if (stream.current().match(/^(?:math|latex)/)) {
						state.tmp_stex = true;
					}
					break;
				case 2:
					change(state, toNormal, context(rxRolePre, 3));
					stream.match(/^:`/);
					token = 'meta';
					break;
				case 3:
					if (state.tmp_stex) {
						state.tmp_stex = undefined;
						state.tmp = {
							mode: modeStex,
							local: startInner(modeStex),
						};
					}

					if (state.tmp) {
						if (stream.peek() === '`') {
							change(state, toNormal, context(rxRolePre, 4));
							state.tmp = undefined;
							break;
						}

						token = state.tmp.mode.token(stream, state.tmp.local);
						break;
					}

					change(state, toNormal, context(rxRolePre, 4));
					stream.match(rxText2);
					token = 'string';
					break;
				case 4:
					change(state, toNormal, context(rxRolePre, 5));
					stream.match(/^`/);
					token = 'meta';
					break;
				case 5:
					change(state, toNormal, context(rxRolePre, 6));
					stream.match(rxTail);
					break;
				default:
					change(state, toNormal);
			}
		} else if (phase(state) === rxRoleSuf || stream.match(rxRoleSuf, false)) {
			switch (stage(state)) {
				case 0:
					change(state, toNormal, context(rxRoleSuf, 1));
					stream.match(/^`/);
					token = 'meta';
					break;
				case 1:
					change(state, toNormal, context(rxRoleSuf, 2));
					stream.match(rxText2);
					token = 'string';
					break;
				case 2:
					change(state, toNormal, context(rxRoleSuf, 3));
					stream.match(/^`:/);
					token = 'meta';
					break;
				case 3:
					change(state, toNormal, context(rxRoleSuf, 4));
					stream.match(rxName);
					token = 'keyword';
					break;
				case 4:
					change(state, toNormal, context(rxRoleSuf, 5));
					stream.match(/^:/);
					token = 'meta';
					break;
				case 5:
					change(state, toNormal, context(rxRoleSuf, 6));
					stream.match(rxTail);
					break;
				default:
					change(state, toNormal);
			}
		} else if (phase(state) === rxRole || stream.match(rxRole, false)) {
			switch (stage(state)) {
				case 0:
					change(state, toNormal, context(rxRole, 1));
					stream.match(/^:/);
					token = 'meta';
					break;
				case 1:
					change(state, toNormal, context(rxRole, 2));
					stream.match(rxName);
					token = 'keyword';
					break;
				case 2:
					change(state, toNormal, context(rxRole, 3));
					stream.match(/^:/);
					token = 'meta';
					break;
				case 3:
					change(state, toNormal, context(rxRole, 4));
					stream.match(rxTail);
					break;
				default:
					change(state, toNormal);
			}
		} else if (
			phase(state) === rxSubstitutionRef ||
			stream.match(rxSubstitutionRef, false)
		) {
			switch (stage(state)) {
				case 0:
					change(state, toNormal, context(rxSubstitutionRef, 1));
					stream.match(rxSubstitutionText);
					token = 'variable-2';
					break;
				case 1:
					change(state, toNormal, context(rxSubstitutionRef, 2));
					if (stream.match(/^_?_?/)) token = 'link';
					break;
				default:
					change(state, toNormal);
			}
		} else if (stream.match(rxFootnoteRef)) {
			change(state, toNormal);
			token = 'quote';
		} else if (stream.match(rxCitationRef)) {
			change(state, toNormal);
			token = 'quote';
		} else if (stream.match(rxLinkRef1)) {
			change(state, toNormal);
			if (!stream.peek() || stream.peek().match(/^\W$/)) {
				token = 'link';
			}
		} else if (phase(state) === rxLinkRef2 || stream.match(rxLinkRef2, false)) {
			switch (stage(state)) {
				case 0:
					if (!stream.peek() || stream.peek().match(/^\W$/)) {
						change(state, toNormal, context(rxLinkRef2, 1));
					} else {
						stream.match(rxLinkRef2);
					}
					break;
				case 1:
					change(state, toNormal, context(rxLinkRef2, 2));
					stream.match(/^`/);
					token = 'link';
					break;
				case 2:
					change(state, toNormal, context(rxLinkRef2, 3));
					stream.match(rxText2);
					break;
				case 3:
					change(state, toNormal, context(rxLinkRef2, 4));
					stream.match(/^`_/);
					token = 'link';
					break;
				default:
					change(state, toNormal);
			}
		} else if (stream.match(rxVerbatim)) {
			change(state, toVerbatim);
		} else {
			if (stream.next()) change(state, toNormal);
		}

		return token;
	}

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	function toExplicit(stream, state) {
		let token = null;

		if (
			phase(state) === rxSubstitution ||
			stream.match(rxSubstitution, false)
		) {
			switch (stage(state)) {
				case 0:
					change(state, toExplicit, context(rxSubstitution, 1));
					stream.match(rxSubstitutionText);
					token = 'variable-2';
					break;
				case 1:
					change(state, toExplicit, context(rxSubstitution, 2));
					stream.match(rxSubstitutionSepa);
					break;
				case 2:
					change(state, toExplicit, context(rxSubstitution, 3));
					stream.match(rxSubstitutionName);
					token = 'keyword';
					break;
				case 3:
					change(state, toExplicit, context(rxSubstitution, 4));
					stream.match(rxSubstitutionTail);
					token = 'meta';
					break;
				default:
					change(state, toNormal);
			}
		} else if (
			phase(state) === rxDirective ||
			stream.match(rxDirective, false)
		) {
			switch (stage(state)) {
				case 0:
					change(state, toExplicit, context(rxDirective, 1));
					stream.match(rxDirectiveName);
					token = 'keyword';

					if (stream.current().match(/^(?:math|latex)/)) state.tmp_stex = true;
					else if (stream.current().match(/^python/)) state.tmp_py = true;
					break;
				case 1:
					change(state, toExplicit, context(rxDirective, 2));
					stream.match(rxDirectiveTail);
					token = 'meta';

					if (stream.match(/^latex\s*$/) || state.tmp_stex) {
						state.tmp_stex = undefined;
						change(state, toMode, {
							mode: modeStex,
							local: startInner(modeStex),
						});
					}
					break;
				case 2:
					change(state, toExplicit, context(rxDirective, 3));
					if (stream.match(/^python\s*$/) || state.tmp_py) {
						state.tmp_py = undefined;
						change(state, toMode, {
							mode: modePython,
							local: startInner(modePython),
						});
					}
					break;
				default:
					change(state, toNormal);
			}
		} else if (phase(state) === rxLink || stream.match(rxLink, false)) {
			switch (stage(state)) {
				case 0:
					change(state, toExplicit, context(rxLink, 1));
					stream.match(rxLinkHead);
					stream.match(rxLinkName);
					token = 'link';
					break;
				case 1:
					change(state, toExplicit, context(rxLink, 2));
					stream.match(rxLinkTail);
					token = 'meta';
					break;
				default:
					change(state, toNormal);
			}
		} else if (stream.match(rxFootnote)) {
			change(state, toNormal);
			token = 'quote';
		} else if (stream.match(rxCitation)) {
			change(state, toNormal);
			token = 'quote';
		} else {
			stream.eatSpace();
			if (stream.eol()) {
				change(state, toNormal);
			} else {
				stream.skipToEnd();
				change(state, toComment);
				token = 'comment';
			}
		}

		return token;
	}

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	function toComment(stream, state) {
		return asBlock(stream, state, 'comment');
	}

	function toVerbatim(stream, state) {
		return asBlock(stream, state, 'meta');
	}

	function asBlock(stream, state, token) {
		if (stream.eol() || stream.eatSpace()) {
			stream.skipToEnd();
			return token;
		} else {
			change(state, toNormal);
			return null;
		}
	}

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	function toMode(stream, state) {
		if (state.ctx.mode && state.ctx.local) {
			if (stream.sol()) {
				if (!stream.eatSpace()) change(state, toNormal);
				return null;
			}

			return state.ctx.mode.token(stream, state.ctx.local);
		}

		change(state, toNormal);
		return null;
	}

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	function context(phase?: any, stage?: any, mode?: any, local?: any) {
		return { phase: phase, stage: stage, mode: mode, local: local };
	}

	function change(state: any, tok: any, ctx?: any) {
		state.tok = tok;
		state.ctx = ctx || {};
	}

	function stage(state) {
		return state.ctx.stage || 0;
	}

	function phase(state) {
		return state.ctx.phase;
	}

	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	return {
		startState: (indentUnit) => {
			currentIndentUnit = indentUnit;
			return { tok: toNormal, ctx: context(undefined, 0) };
		},

		copyState: (state) => {
			let ctx = state.ctx,
				tmp = state.tmp;
			if (ctx.local)
				ctx = { mode: ctx.mode, local: copyInner(ctx.mode, ctx.local) };
			if (tmp) tmp = { mode: tmp.mode, local: copyInner(tmp.mode, tmp.local) };
			return { tok: state.tok, ctx: ctx, tmp: tmp };
		},

		token: (stream, state) => state.tok(stream, state),
	};
}

function createRstOverlay(): AnyParser {
	const rxStrong = /^\*\*[^*\s](?:[^*]*[^*\s])?\*\*/;
	const rxEmphasis = /^\*[^*\s](?:[^*]*[^*\s])?\*/;
	const rxLiteral = /^``[^`\s](?:[^`]*[^`\s])``/;

	const rxNumber = /^(?:[\d]+(?:[.,]\d+)*)/;
	const rxPositive = /^(?:\s\+[\d]+(?:[.,]\d+)*)/;
	const rxNegative = /^(?:\s-[\d]+(?:[.,]\d+)*)/;

	const rxUriProtocol = '[Hh][Tt][Tt][Pp][Ss]?://';
	const rxUriDomain = '(?:[\\d\\w.-]+)\\.(?:\\w{2,6})';
	const rxUriPath = '(?:/[\\d\\w\\#\\%\\&\\-\\.\\,\\/\\:\\=\\?\\~]+)*';
	const rxUri = new RegExp(`^${rxUriProtocol}${rxUriDomain}${rxUriPath}`);

	const overlay = {
		token: (stream) => {
			if (stream.match(rxStrong) && stream.match(/\W+|$/, false))
				return 'strong';
			if (stream.match(rxEmphasis) && stream.match(/\W+|$/, false))
				return 'emphasis';
			if (stream.match(rxLiteral) && stream.match(/\W+|$/, false))
				return 'string-2';
			if (stream.match(rxNumber)) return 'number';
			if (stream.match(rxPositive)) return 'inserted';
			if (stream.match(rxNegative)) return 'deleted';
			if (stream.match(rxUri)) return 'link';

			while (stream.next() != null) {
				if (stream.match(rxStrong, false)) break;
				if (stream.match(rxEmphasis, false)) break;
				if (stream.match(rxLiteral, false)) break;
				if (stream.match(rxNumber, false)) break;
				if (stream.match(rxPositive, false)) break;
				if (stream.match(rxNegative, false)) break;
				if (stream.match(rxUri, false)) break;
			}

			return null;
		},
	};

	return overlay;
}

function withOverlay(base: AnyParser, over: AnyParser): AnyParser {
	return {
		name: 'rst',
		startState(indentUnit: number) {
			return {
				base: base.startState(indentUnit),
				overlay: startInner(over),
				basePos: 0,
				baseCur: null,
				overlayPos: 0,
				overlayCur: null,
				streamSeen: null,
			};
		},
		copyState(state: any) {
			return {
				base: copyInner(base, state.base),
				overlay: copyInner(over, state.overlay),
				basePos: state.basePos,
				baseCur: null,
				overlayPos: state.overlayPos,
				overlayCur: null,
				streamSeen: null,
			};
		},
		token(stream: any, state: any) {
			if (
				stream !== state.streamSeen ||
				Math.min(state.basePos, state.overlayPos) < stream.start
			) {
				state.streamSeen = stream;
				state.basePos = stream.start;
				state.overlayPos = stream.start;
			}

			if (stream.start === state.basePos) {
				state.baseCur = base.token(stream, state.base);
				state.basePos = stream.pos;
			}

			if (stream.start === state.overlayPos) {
				stream.pos = stream.start;
				state.overlayCur = over.token(stream, state.overlay);
				state.overlayPos = stream.pos;
			}

			stream.pos = Math.min(state.basePos, state.overlayPos);

			if (state.overlayCur == null) return state.baseCur;
			if (state.baseCur != null) return `${state.baseCur} ${state.overlayCur}`;
			return state.overlayCur;
		},
		languageData: {
			name: 'rst',
			commentTokens: { line: '..' },
		},
	};
}

export const rst: AnyParser = withOverlay(createRstBase(), createRstOverlay());
