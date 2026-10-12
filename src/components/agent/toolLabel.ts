// src/components/agent/toolLabel.ts
const TEXLYRE_TOOL_PREFIX = /^mcp__texlyre__/;

// Agents report MCP tools by their qualified name; show TeXlyre's own tools by
// their short name and leave anything else as the agent titled it.
export const toolLabel = (title: string): string =>
	title.replace(TEXLYRE_TOOL_PREFIX, '');
