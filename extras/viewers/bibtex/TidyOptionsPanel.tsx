// extras/viewers/bibtex/TidyOptionsPanel.tsx
import type React from "react";

import { CleanIcon, ResetIcon } from "../../../src/components/common/Icons";
import type { TidyOptions } from "./tidyOptions";

interface TidyOptionsPanelProps {
	options: TidyOptions;
	onOptionsChange: (options: TidyOptions) => void;
	onResetToDefaults: () => void;
	onProcessBibtex: () => void;
	isProcessing: boolean;
}

export const TidyOptionsPanel: React.FC<TidyOptionsPanelProps> = ({
	options,
	onOptionsChange,
	onResetToDefaults,
	onProcessBibtex,
	isProcessing,
}) => {
	const updateOption = (key: keyof TidyOptions, value: unknown) => {
		onOptionsChange({ ...options, [key]: value });
	};

	return (
		<div className="bibtex-sidebar">
			<div className="sidebar-header">
				<h4>Tidy Options</h4>
				<div className="header-buttons">
					<button
						className="reset-button"
						onClick={onResetToDefaults}
						title="Reset to Standard Preset"
					>
						<ResetIcon />
					</button>
					<button
						onClick={onProcessBibtex}
						disabled={isProcessing}
						title="Process BibTeX with Current Settings"
						className="tidy-button"
					>
						<CleanIcon /> Tidy
					</button>
				</div>
			</div>

			<div className="options-container">
				<div className="option-group">
					<h5>Fields</h5>

					<label className="option-item">
						<span>Remove fields (comma-separated):</span>
						<input
							type="text"
							value={options.omit?.join(",") || ""}
							onChange={(e) =>
								updateOption(
									"omit",
									e.target.value
										.split(",")
										.map((s) => s.trim())
										.filter(Boolean),
								)
							}
							placeholder="e.g., id,name"
						/>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.removeEmptyFields)}
							onChange={(e) =>
								updateOption("removeEmptyFields", e.target.checked)
							}
						/>
						<span>Remove empty fields</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.removeDuplicateFields)}
							onChange={(e) =>
								updateOption("removeDuplicateFields", e.target.checked)
							}
						/>
						<span>Remove duplicate fields</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.sortFields)}
							onChange={(e) => updateOption("sortFields", !!e.target.checked)}
						/>
						<span>Sort fields within entries</span>
					</label>
				</div>

				<div className="option-group">
					<h5>Values</h5>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.curly)}
							onChange={(e) => updateOption("curly", e.target.checked)}
						/>
						<span>Enclose values in braces</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.numeric)}
							onChange={(e) => updateOption("numeric", e.target.checked)}
						/>
						<span>Use numeric values</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.months)}
							onChange={(e) => updateOption("months", e.target.checked)}
						/>
						<span>Abbreviate months</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.stripEnclosingBraces)}
							onChange={(e) =>
								updateOption("stripEnclosingBraces", e.target.checked)
							}
						/>
						<span>Strip double braces</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.dropAllCaps)}
							onChange={(e) => updateOption("dropAllCaps", e.target.checked)}
						/>
						<span>Convert ALL CAPS to Title Case</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.escape)}
							onChange={(e) => updateOption("escape", e.target.checked)}
						/>
						<span>Escape special characters</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.lowercase)}
							onChange={(e) => updateOption("lowercase", e.target.checked)}
						/>
						<span>Lowercase field names</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.trailingCommas)}
							onChange={(e) => updateOption("trailingCommas", e.target.checked)}
						/>
						<span>Trailing commas</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.encodeUrls)}
							onChange={(e) => updateOption("encodeUrls", e.target.checked)}
						/>
						<span>Encode URLs</span>
					</label>
				</div>

				<div className="option-group">
					<h5>Braces</h5>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.enclosingBraces)}
							onChange={(e) =>
								updateOption(
									"enclosingBraces",
									e.target.checked ? ["title"] : false,
								)
							}
						/>
						<span>Enclose in double braces</span>
					</label>

					{options.enclosingBraces && (
						<label className="option-item sub-option">
							<span>Fields to enclose:</span>
							<input
								type="text"
								value={
									Array.isArray(options.enclosingBraces)
										? options.enclosingBraces.join(",")
										: "title"
								}
								onChange={(e) =>
									updateOption(
										"enclosingBraces",
										e.target.value
											.split(",")
											.map((s) => s.trim())
											.filter(Boolean),
									)
								}
								placeholder="e.g., title,journal"
							/>
						</label>
					)}

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.removeBraces)}
							onChange={(e) =>
								updateOption(
									"removeBraces",
									e.target.checked ? ["title"] : false,
								)
							}
						/>
						<span>Remove braces</span>
					</label>

					{options.removeBraces && (
						<label className="option-item sub-option">
							<span>Fields to remove braces from:</span>
							<input
								type="text"
								value={
									Array.isArray(options.removeBraces)
										? options.removeBraces.join(",")
										: "title"
								}
								onChange={(e) =>
									updateOption(
										"removeBraces",
										e.target.value
											.split(",")
											.map((s) => s.trim())
											.filter(Boolean),
									)
								}
								placeholder="e.g., title,journal"
							/>
						</label>
					)}
				</div>

				<div className="option-group">
					<h5>Formatting</h5>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.tab)}
							onChange={(e) => updateOption("tab", e.target.checked)}
						/>
						<span>Use tabs for indentation</span>
					</label>

					{!options.tab && (
						<label className="option-item sub-option">
							<span>Space indentation:</span>
							<input
								type="number"
								min="1"
								max="8"
								value={typeof options.space === "number" ? options.space : 2}
								onChange={(e) =>
									updateOption("space", Number.parseInt(e.target.value))
								}
							/>
						</label>
					)}

					<label className="option-item">
						<span>Align values:</span>
						<input
							type="number"
							min="0"
							max="50"
							value={typeof options.align === "number" ? options.align : 14}
							onChange={(e) =>
								updateOption("align", Number.parseInt(e.target.value))
							}
						/>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.blankLines)}
							onChange={(e) => updateOption("blankLines", e.target.checked)}
						/>
						<span>Insert blank lines between entries</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.wrap)}
							onChange={(e) =>
								updateOption("wrap", e.target.checked ? 80 : false)
							}
						/>
						<span>Wrap long values</span>
					</label>

					{options.wrap && (
						<label className="option-item sub-option">
							<span>Wrap at column:</span>
							<input
								type="number"
								min="40"
								max="200"
								value={typeof options.wrap === "number" ? options.wrap : 80}
								onChange={(e) =>
									updateOption("wrap", Number.parseInt(e.target.value))
								}
							/>
						</label>
					)}
				</div>

				<div className="option-group">
					<h5>Sorting</h5>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.sort)}
							onChange={(e) =>
								updateOption("sort", e.target.checked ? ["key"] : false)
							}
						/>
						<span>Sort entries</span>
					</label>

					{options.sort && (
						<label className="option-item sub-option">
							<span>Sort by fields:</span>
							<input
								type="text"
								value={
									Array.isArray(options.sort) ? options.sort.join(",") : "key"
								}
								onChange={(e) =>
									updateOption(
										"sort",
										e.target.value
											.split(",")
											.map((s) => s.trim())
											.filter(Boolean),
									)
								}
								placeholder="e.g., key or -year,name"
							/>
						</label>
					)}
				</div>

				<div className="option-group">
					<h5>Duplicates</h5>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.duplicates)}
							onChange={(e) =>
								updateOption(
									"duplicates",
									e.target.checked ? ["doi", "citation", "abstract"] : false,
								)
							}
						/>
						<span>Check for duplicates</span>
					</label>

					{options.duplicates && (
						<>
							<label className="option-item sub-option">
								<span>Check by:</span>
								<select
									multiple
									value={
										Array.isArray(options.duplicates)
											? options.duplicates
											: ["doi", "citation", "abstract"]
									}
									onChange={(e) => {
										const values = Array.from(
											e.target.selectedOptions,
											(option) => option.value,
										) as ("doi" | "key" | "abstract" | "citation")[];
										updateOption("duplicates", values);
									}}
								>
									<option value="doi">DOI</option>
									<option value="key">Key</option>
									<option value="abstract">Abstract</option>
									<option value="citation">Citation</option>
								</select>
							</label>

							<label className="option-item sub-option">
								<span>Merge strategy:</span>
								<select
									value={
										typeof options.merge === "string" ? options.merge : "false"
									}
									onChange={(e) =>
										updateOption(
											"merge",
											e.target.value === "false" ? false : e.target.value,
										)
									}
								>
									<option value="false">Don't merge</option>
									<option value="first">Keep first</option>
									<option value="last">Keep last</option>
									<option value="combine">Combine fields</option>
									<option value="overwrite">Overwrite fields</option>
								</select>
							</label>
						</>
					)}
				</div>

				<div className="option-group">
					<h5>Comments</h5>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.stripComments)}
							onChange={(e) => updateOption("stripComments", e.target.checked)}
						/>
						<span>Remove comments</span>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.tidyComments)}
							onChange={(e) => updateOption("tidyComments", e.target.checked)}
						/>
						<span>Tidy comments</span>
					</label>
				</div>

				<div className="option-group">
					<h5>Advanced</h5>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.generateKeys)}
							onChange={(e) =>
								updateOption(
									"generateKeys",
									e.target.checked
										? "[auth:required:lower][year:required][veryshorttitle:lower][duplicateNumber]"
										: false,
								)
							}
						/>
						<span>Generate citation keys</span>
					</label>

					{options.generateKeys && (
						<label className="option-item sub-option">
							<span>Key template:</span>
							<input
								type="text"
								value={
									typeof options.generateKeys === "string"
										? options.generateKeys
										: "[auth:required:lower][year:required][veryshorttitle:lower][duplicateNumber]"
								}
								onChange={(e) => updateOption("generateKeys", e.target.value)}
								placeholder="JabRef pattern"
							/>
						</label>
					)}

					<label className="option-item">
						<span>Max authors:</span>
						<input
							type="number"
							min="1"
							max="20"
							value={options.maxAuthors || ""}
							onChange={(e) =>
								updateOption(
									"maxAuthors",
									e.target.value ? Number.parseInt(e.target.value) : undefined,
								)
							}
							placeholder="No limit"
						/>
					</label>

					<label className="option-item">
						<input
							type="checkbox"
							checked={Boolean(options.lookupDois)}
							onChange={(e) => updateOption("lookupDois", e.target.checked)}
						/>
						<span>Lookup missing DOIs</span>
					</label>
				</div>
			</div>
		</div>
	);
};