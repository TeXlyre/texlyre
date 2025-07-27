// src/hooks/useBibliography.ts
import { useContext } from "react";

import { BibliographyContext } from "../contexts/BibliographyContext";

export const useBibliography = () => {
	const context = useContext(BibliographyContext);
	if (!context) {
		throw new Error("useBibliography must be used within a BibliographyProvider");
	}
	return context;
};