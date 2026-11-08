// src/types/acp.ts
import type { ExternalServiceConfig } from '../services/ExternalServiceBase';

// Subset of the Agent Client Protocol v1 schema that TeXlyre speaks.
// Field names follow @agentclientprotocol/sdk (schema/types.gen.d.ts).
export const ACP_PROTOCOL_VERSION = 1;

export interface ACPServerConfig extends ExternalServiceConfig {
	transportId?: string;
	cwd?: string;
	mcpServers?: string;
	// JSON object sent as _meta on session/new, for agent-specific options.
	sessionMeta?: string;
}

export type ACPSessionId = string;

export interface ACPImplementation {
	name: string;
	title?: string | null;
	version: string;
}

export interface ACPClientCapabilities {
	fs?: { readTextFile?: boolean; writeTextFile?: boolean };
	terminal?: boolean;
}

export interface ACPInitializeResponse {
	protocolVersion: number;
	agentCapabilities?: {
		loadSession?: boolean;
		promptCapabilities?: {
			image?: boolean;
			audio?: boolean;
			embeddedContext?: boolean;
		};
		[key: string]: unknown;
	};
	authMethods?: Array<{
		id: string;
		name: string;
		description?: string | null;
	}>;
	agentInfo?: ACPImplementation | null;
}

export type ACPContentBlock =
	| { type: 'text'; text: string }
	| {
			type: 'resource_link';
			uri: string;
			name: string;
			mimeType?: string | null;
	  }
	| {
			type: 'resource';
			resource: { uri: string; text: string; mimeType?: string | null };
	  };

export type ACPStopReason =
	| 'end_turn'
	| 'max_tokens'
	| 'max_turn_requests'
	| 'refusal'
	| 'cancelled';

export interface ACPPromptResponse {
	stopReason: ACPStopReason;
}

// texlyre-acp-bridge reports the working directory it gave the agent here.
export interface ACPLoadSessionResponse {
	_meta?: { texlyre?: { cwd?: unknown }; [key: string]: unknown } | null;
}

export interface ACPNewSessionResponse extends ACPLoadSessionResponse {
	sessionId: ACPSessionId;
}

// session/update payloads are forwarded to the UI largely untouched; only the
// discriminator is typed so listeners can switch on it.
export interface ACPSessionUpdate {
	sessionUpdate:
		| 'user_message_chunk'
		| 'agent_message_chunk'
		| 'agent_thought_chunk'
		| 'tool_call'
		| 'tool_call_update'
		| 'plan'
		| 'available_commands_update'
		| 'current_mode_update'
		| (string & {});
	[key: string]: unknown;
}

export interface ACPSessionNotification {
	sessionId: ACPSessionId;
	update: ACPSessionUpdate;
}

export type ACPPermissionOptionKind =
	| 'allow_once'
	| 'allow_always'
	| 'reject_once'
	| 'reject_always';

export interface ACPPermissionOption {
	optionId: string;
	name: string;
	kind: ACPPermissionOptionKind;
}

export interface ACPRequestPermissionRequest {
	sessionId: ACPSessionId;
	toolCall: {
		toolCallId: string;
		title?: string | null;
		kind?: string | null;
		[key: string]: unknown;
	};
	options: ACPPermissionOption[];
}

export type ACPPermissionOutcome =
	| { outcome: 'cancelled' }
	| { outcome: 'selected'; optionId: string };

export interface ACPReadTextFileRequest {
	sessionId: ACPSessionId;
	path: string;
	line?: number | null;
	limit?: number | null;
}

export interface ACPWriteTextFileRequest {
	sessionId: ACPSessionId;
	path: string;
	content: string;
}

export type ACPMcpServer =
	| {
			name: string;
			command: string;
			args: string[];
			env: Array<{ name: string; value: string }>;
	  }
	| {
			type: 'http' | 'sse';
			name: string;
			url: string;
			headers: Array<{ name: string; value: string }>;
	  };
