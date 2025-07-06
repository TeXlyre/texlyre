// src/types/chat.ts
export interface ChatMessage {
	id: string;
	user: string;
	content: string;
	timestamp: number;
}

export interface ChatContextType {
	messages: ChatMessage[];
	isConnected: boolean;
	sendMessage: (content: string) => void;
}
