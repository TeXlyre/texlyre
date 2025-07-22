export interface BibtexEntry {
	id: string;
	type: string;
	fields: Record<string, string>;
	originalIndex: number;
}

export class BibtexParser {
	static parse(content: string): BibtexEntry[] {
		const entries: BibtexEntry[] = [];
		let index = 0;
		let pos = 0;

		while (pos < content.length) {
			pos = this.skipWhitespaceAndComments(content, pos);
			if (pos >= content.length) break;

			if (content[pos] === '@') {
				const entry = this.parseEntry(content, pos);
				if (entry) {
					entries.push({
						...entry,
						originalIndex: index++
					});
					pos = entry.endPos;
				} else {
					pos++;
				}
			} else {
				pos++;
			}
		}

		return entries;
	}

	private static skipWhitespaceAndComments(content: string, pos: number): number {
		while (pos < content.length) {
			const char = content[pos];

			if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
				pos++;
			} else if (char === '%') {
				while (pos < content.length && content[pos] !== '\n') {
					pos++;
				}
			} else {
				break;
			}
		}
		return pos;
	}

	private static parseEntry(content: string, startPos: number): (BibtexEntry & { endPos: number }) | null {
		let pos = startPos + 1; // Skip @

		const typeMatch = content.substring(pos).match(/^([a-zA-Z]+)/);
		if (!typeMatch) return null;

		const type = typeMatch[1].toLowerCase();
		pos += type.length;

		pos = this.skipWhitespaceAndComments(content, pos);
		if (pos >= content.length || content[pos] !== '{') return null;

		pos++; // Skip opening brace
		pos = this.skipWhitespaceAndComments(content, pos);

		const idMatch = content.substring(pos).match(/^([^,}\s]+)/);
		if (!idMatch) return null;

		const id = idMatch[1].trim();
		pos += id.length;

		pos = this.skipWhitespaceAndComments(content, pos);

		if (pos < content.length && content[pos] === ',') {
			pos++; // Skip comma after ID
		}

		const fields: Record<string, string> = {};
		let braceCount = 1;

		while (pos < content.length && braceCount > 0) {
			pos = this.skipWhitespaceAndComments(content, pos);
			if (pos >= content.length) break;

			if (content[pos] === '}') {
				braceCount--;
				if (braceCount === 0) {
					pos++; // Skip closing brace
					break;
				}
			} else {
				const fieldResult = this.parseField(content, pos);
				if (fieldResult) {
					fields[fieldResult.key.toLowerCase()] = fieldResult.value;
					pos = fieldResult.endPos;
				} else {
					pos++;
				}
			}
		}

		return {
			id,
			type,
			fields,
			originalIndex: 0, // Will be set by caller
			endPos: pos
		};
	}

	private static parseField(content: string, startPos: number): { key: string; value: string; endPos: number } | null {
		let pos = startPos;

		pos = this.skipWhitespaceAndComments(content, pos);
		if (pos >= content.length) return null;

		const keyMatch = content.substring(pos).match(/^([a-zA-Z][a-zA-Z0-9_-]*)/);
		if (!keyMatch) return null;

		const key = keyMatch[1];
		pos += key.length;

		pos = this.skipWhitespaceAndComments(content, pos);
		if (pos >= content.length || content[pos] !== '=') return null;

		pos++; // Skip =
		pos = this.skipWhitespaceAndComments(content, pos);

		const valueResult = this.parseValue(content, pos);
		if (!valueResult) return null;

		let endPos = valueResult.endPos;
		endPos = this.skipWhitespaceAndComments(content, endPos);

		if (endPos < content.length && content[endPos] === ',') {
			endPos++; // Skip comma
		}

		return {
			key,
			value: valueResult.value,
			endPos
		};
	}

	private static parseValue(content: string, startPos: number): { value: string; endPos: number } | null {
		let pos = startPos;
		pos = this.skipWhitespaceAndComments(content, pos);

		if (pos >= content.length) return null;

		const char = content[pos];

		if (char === '"') {
			return this.parseQuotedString(content, pos);
		} else if (char === '{') {
			return this.parseBracedString(content, pos);
		} else {
			return this.parseUnquotedValue(content, pos);
		}
	}

	private static parseQuotedString(content: string, startPos: number): { value: string; endPos: number } | null {
		let pos = startPos + 1; // Skip opening quote
		let value = '';
		let braceCount = 0;

		while (pos < content.length) {
			const char = content[pos];

			if (char === '"' && braceCount === 0) {
				return { value, endPos: pos + 1 };
			} else if (char === '{') {
				braceCount++;
				value += char;
			} else if (char === '}') {
				braceCount--;
				value += char;
			} else if (char === '\\' && pos + 1 < content.length) {
				value += char + content[pos + 1];
				pos++;
			} else {
				value += char;
			}
			pos++;
		}

		return null; // Unclosed string
	}

	private static parseBracedString(content: string, startPos: number): { value: string; endPos: number } | null {
		let pos = startPos + 1; // Skip opening brace
		let value = '';
		let braceCount = 1;

		while (pos < content.length && braceCount > 0) {
			const char = content[pos];

			if (char === '{') {
				braceCount++;
				value += char;
			} else if (char === '}') {
				braceCount--;
				if (braceCount > 0) {
					value += char;
				}
			} else if (char === '\\' && pos + 1 < content.length) {
				value += char + content[pos + 1];
				pos++;
			} else {
				value += char;
			}
			pos++;
		}

		return braceCount === 0 ? { value, endPos: pos } : null;
	}

	private static parseUnquotedValue(content: string, startPos: number): { value: string; endPos: number } | null {
		let pos = startPos;
		let value = '';

		while (pos < content.length) {
			const char = content[pos];

			if (char === ',' || char === '}' || char === '\n' || char === '\r') {
				break;
			} else if (char === ' ' || char === '\t') {
				if (value.trim()) {
					const nextNonSpace = this.skipWhitespaceAndComments(content, pos);
					if (nextNonSpace < content.length &&
						content[nextNonSpace] !== ',' &&
						content[nextNonSpace] !== '}') {
						value += char;
					} else {
						break;
					}
				}
			} else {
				value += char;
			}
			pos++;
		}

		return { value: value.trim(), endPos: pos };
	}

	static findEntryPosition(content: string, targetEntry: BibtexEntry): { start: number; end: number } | null {
		const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,?\s*([\s\S]*?)\n\s*\}/g;
		let match;
		let currentIndex = 0;

		while ((match = entryRegex.exec(content)) !== null) {
			const [fullMatch, type, id] = match;

			if (type.toLowerCase() === targetEntry.type &&
				id.trim() === targetEntry.id &&
				currentIndex === targetEntry.originalIndex) {
				return {
					start: match.index,
					end: match.index + fullMatch.length
				};
			}
			currentIndex++;
		}

		return null;
	}

	static serializeEntry(entry: BibtexEntry): string {
		const fieldsString = Object.entries(entry.fields)
			.map(([key, value]) => {
				const needsBraces = this.needsBraces(value);
				const formattedValue = needsBraces ? `{${value}}` : `"${value}"`;
				return `  ${key} = ${formattedValue}`;
			})
			.join(',\n');

		return `@${entry.type}{${entry.id},\n${fieldsString}\n}`;
	}

	static updateEntryInContent(content: string, updatedEntry: BibtexEntry): string {
		const position = this.findEntryPosition(content, updatedEntry);
		if (!position) {
			console.warn('Could not find entry position for:', updatedEntry.id);
			return content;
		}

		const newEntryContent = this.serializeEntry(updatedEntry);

		return content.substring(0, position.start) +
			   newEntryContent +
			   content.substring(position.end);
	}

	static serialize(entries: BibtexEntry[]): string {
		return entries
			.sort((a, b) => a.originalIndex - b.originalIndex)
			.map(entry => this.serializeEntry(entry))
			.join('\n\n');
	}

	private static needsBraces(value: string): boolean {
		return value.includes('{') ||
			   value.includes('}') ||
			   value.includes('"') ||
			   /[A-Z].*[A-Z]/.test(value) || // Multiple capitals (likely needs protection)
			   /\\[a-zA-Z]/.test(value); // LaTeX commands
	}
}