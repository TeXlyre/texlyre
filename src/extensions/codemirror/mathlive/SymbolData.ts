/* biome-ignore-all lint/style/useNamingConvention: Unicode math symbol keys map to LaTeX commands. */
// src/extensions/codemirror/mathlive/SymbolData.ts
import { inferSyms, type SymbolInfo } from 'detypify-service';

import type { FileType } from './patterns';

const UNICODE_TO_LATEX: Record<string, string> = {
	α: '\\alpha',
	β: '\\beta',
	γ: '\\gamma',
	δ: '\\delta',
	ε: '\\epsilon',
	ζ: '\\zeta',
	η: '\\eta',
	θ: '\\theta',
	ι: '\\iota',
	κ: '\\kappa',
	λ: '\\lambda',
	μ: '\\mu',
	ν: '\\nu',
	ξ: '\\xi',
	π: '\\pi',
	ρ: '\\rho',
	σ: '\\sigma',
	τ: '\\tau',
	υ: '\\upsilon',
	φ: '\\phi',
	χ: '\\chi',
	ψ: '\\psi',
	ω: '\\omega',
	ϑ: '\\vartheta',
	ϕ: '\\varphi',
	ϖ: '\\varpi',
	ϰ: '\\varkappa',
	ϱ: '\\varrho',
	ϵ: '\\varepsilon',
	ς: '\\varsigma',
	Γ: '\\Gamma',
	Δ: '\\Delta',
	Θ: '\\Theta',
	Λ: '\\Lambda',
	Ξ: '\\Xi',
	Π: '\\Pi',
	Σ: '\\Sigma',
	Υ: '\\Upsilon',
	Φ: '\\Phi',
	Ψ: '\\Psi',
	Ω: '\\Omega',
	'±': '\\pm',
	'∓': '\\mp',
	'×': '\\times',
	'÷': '\\div',
	'·': '\\cdot',
	'∘': '\\circ',
	'⊕': '\\oplus',
	'⊗': '\\otimes',
	'⊖': '\\ominus',
	'⊙': '\\odot',
	'⊞': '\\boxplus',
	'⊠': '\\boxtimes',
	'⋆': '\\star',
	'⋄': '\\diamond',
	'∧': '\\land',
	'∨': '\\lor',
	'∩': '\\cap',
	'∪': '\\cup',
	'⊓': '\\sqcap',
	'⊔': '\\sqcup',
	'†': '\\dagger',
	'‡': '\\ddagger',
	'∗': '\\ast',
	'≀': '\\wr',
	'△': '\\triangle',
	'▽': '\\triangledown',
	'⊲': '\\triangleleft',
	'⊳': '\\triangleright',
	'∑': '\\sum',
	'∏': '\\prod',
	'∐': '\\coprod',
	'∫': '\\int',
	'∬': '\\iint',
	'∭': '\\iiint',
	'∮': '\\oint',
	'⋂': '\\bigcap',
	'⋃': '\\bigcup',
	'⨆': '\\bigsqcup',
	'⋀': '\\bigwedge',
	'⋁': '\\bigvee',
	'⨁': '\\bigoplus',
	'⨂': '\\bigotimes',
	'≤': '\\leq',
	'≥': '\\geq',
	'≠': '\\neq',
	'≈': '\\approx',
	'≡': '\\equiv',
	'∼': '\\sim',
	'≃': '\\simeq',
	'≅': '\\cong',
	'∝': '\\propto',
	'≺': '\\prec',
	'≻': '\\succ',
	'≼': '\\preceq',
	'≽': '\\succeq',
	'≪': '\\ll',
	'≫': '\\gg',
	'≍': '\\asymp',
	'⊂': '\\subset',
	'⊃': '\\supset',
	'⊆': '\\subseteq',
	'⊇': '\\supseteq',
	'⊊': '\\subsetneq',
	'⊋': '\\supsetneq',
	'⊏': '\\sqsubset',
	'⊐': '\\sqsupset',
	'⊑': '\\sqsubseteq',
	'⊒': '\\sqsupseteq',
	'∈': '\\in',
	'∉': '\\notin',
	'∋': '\\ni',
	'⊢': '\\vdash',
	'⊣': '\\dashv',
	'⊨': '\\models',
	'⊥': '\\perp',
	'∥': '\\parallel',
	'∦': '\\nparallel',
	'→': '\\rightarrow',
	'←': '\\leftarrow',
	'↔': '\\leftrightarrow',
	'⇒': '\\Rightarrow',
	'⇐': '\\Leftarrow',
	'⇔': '\\Leftrightarrow',
	'↑': '\\uparrow',
	'↓': '\\downarrow',
	'↕': '\\updownarrow',
	'⇑': '\\Uparrow',
	'⇓': '\\Downarrow',
	'⇕': '\\Updownarrow',
	'↦': '\\mapsto',
	'↪': '\\hookrightarrow',
	'↩': '\\hookleftarrow',
	'↗': '\\nearrow',
	'↘': '\\searrow',
	'↙': '\\swarrow',
	'↖': '\\nwarrow',
	'⟶': '\\longrightarrow',
	'⟵': '\\longleftarrow',
	'⟷': '\\longleftrightarrow',
	'⟹': '\\Longrightarrow',
	'⟸': '\\Longleftarrow',
	'⟺': '\\Longleftrightarrow',
	'⟼': '\\longmapsto',
	'↠': '\\twoheadrightarrow',
	'↣': '\\rightarrowtail',
	'⇝': '\\rightsquigarrow',
	'∞': '\\infty',
	'∂': '\\partial',
	'∇': '\\nabla',
	'∀': '\\forall',
	'∃': '\\exists',
	'∄': '\\nexists',
	'∅': '\\emptyset',
	'¬': '\\neg',
	'√': '\\surd',
	℘: '\\wp',
	ℓ: '\\ell',
	ℑ: '\\Im',
	ℜ: '\\Re',
	ℵ: '\\aleph',
	ℏ: '\\hbar',
	ℂ: '\\mathbb{C}',
	ℍ: '\\mathbb{H}',
	ℕ: '\\mathbb{N}',
	ℙ: '\\mathbb{P}',
	ℚ: '\\mathbb{Q}',
	ℝ: '\\mathbb{R}',
	ℤ: '\\mathbb{Z}',
	'…': '\\ldots',
	'⋯': '\\cdots',
	'⋮': '\\vdots',
	'⋱': '\\ddots',
	'⟨': '\\langle',
	'⟩': '\\rangle',
	'⌈': '\\lceil',
	'⌉': '\\rceil',
	'⌊': '\\lfloor',
	'⌋': '\\rfloor',
	'•': '\\bullet',
	'∠': '\\angle',
	'°': '\\degree',
	'′': '\\prime',
	'″': '\\prime\\prime',
	'♠': '\\spadesuit',
	'♣': '\\clubsuit',
	'♥': '\\heartsuit',
	'♦': '\\diamondsuit',
	'✓': '\\checkmark',
	'✗': '\\times',
};

export interface SymbolCandidate {
	latex: string;
	typstName: string;
	char: string;
}

export function symbolInfoToCandidate(
	info: SymbolInfo,
	fileType: FileType,
): SymbolCandidate | null {
	const latex = UNICODE_TO_LATEX[info.char];
	if (fileType === 'latex' && !latex) return null;

	return {
		latex: latex || info.char,
		typstName: info.names[0],
		char: info.char,
	};
}

export function getCommandForFileType(
	candidate: SymbolCandidate,
	fileType: FileType,
): string {
	return fileType === 'latex' ? candidate.latex : candidate.char;
}

export function searchSymbols(
	query: string,
	fileType: FileType,
): SymbolCandidate[] {
	if (!query.trim()) return [];

	const lower = query.toLowerCase();

	return inferSyms
		.map((info) => {
			const candidate = symbolInfoToCandidate(info, fileType);
			if (!candidate) return null;

			const searchable =
				`${candidate.latex} ${candidate.typstName} ${candidate.char}`.toLowerCase();
			if (!searchable.includes(lower)) return null;

			return candidate;
		})
		.filter((c): c is SymbolCandidate => c !== null)
		.slice(0, 30);
}
