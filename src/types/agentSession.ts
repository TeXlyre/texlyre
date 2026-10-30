// src/types/agentSession.ts
import type { ACPRequestPermissionRequest } from './acp';

export type AgentStatus =
	| 'disconnected'
	| 'connecting'
	| 'ready'
	| 'prompting'
	| 'error';

export interface AgentFileChange {
	path: string;
	before: string | null;
	after: string;
}

export type AgentEntry =
	| { id: string; kind: 'user'; text: string }
	| { id: string; kind: 'agent'; text: string }
	| { id: string; kind: 'thought'; text: string }
	| {
			id: string;
			kind: 'tool';
			toolCallId: string;
			title: string;
			status: string;
	  }
	| ({ id: string; kind: 'change' } & AgentFileChange)
	| {
			id: string;
			kind: 'plan';
			items: Array<{ content: string; status: string }>;
	  }
	| { id: string; kind: 'notice'; text: string; tone: 'info' | 'error' };

export interface PendingPermission {
	id: string;
	request: ACPRequestPermissionRequest;
}

// A saved agent chat, stored as JSON in the project (see AgentChatStore).
export interface AgentChat {
	version: 1;
	id: string;
	agentId: string;
	// The agent's session id, used to resume the conversation with
	// session/load; null until the first prompt reaches the agent.
	sessionId: string | null;
	title: string;
	createdAt: number;
	updatedAt: number;
	entries: AgentEntry[];
}

export type AgentChatSummary = Pick<
	AgentChat,
	'id' | 'agentId' | 'title' | 'updatedAt'
>;
