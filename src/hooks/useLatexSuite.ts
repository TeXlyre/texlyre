// src/hooks/useLatexSuite.ts
import { useContext } from "react";

import { LatexSuiteContext } from "../contexts/EditorContext";

export const useLatexSuite = () => {
	const context = useContext(LatexSuiteContext);
	if (!context) {
		throw new Error("useLatexSuite must be used within a LatexSuiteProvider");
	}
	return context;
};