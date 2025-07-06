// src/hooks/useChat.ts
import { useContext } from "react";

import { ChatContext } from "../contexts/ChatContext";

export const useChat = () => {
	const context = useContext(ChatContext);
	if (!context) {
		throw new Error("useChat must be used within a ChatProvider");
	}
	return context;
};
