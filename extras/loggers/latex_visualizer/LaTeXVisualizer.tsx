// extras/loggers/latex_visualizer/LaTeXVisualizer.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { PluginHeader } from "../../../src/components/common/PluginHeader";
import type { LoggerProps } from "../../../src/plugins/PluginInterface";
import "./styles.css";

interface ParsedError {
	type: "error" | "warning" | "info";
	message: string;
	line?: number;
	file?: string;
	lineContent?: string;
	fullMessage?: string;
}

const LaTeXVisualizer: React.FC<LoggerProps> = ({ log, onLineClick }) => {
	const [parsedErrors, setParsedErrors] = useState<ParsedError[]>([]);
	const [filter, setFilter] = useState<"all" | "error" | "warning">("all");

	useEffect(() => {
		if (!log) {
			setParsedErrors([]);
			return;
		}

		const errors = parseLatexLog(log);
		setParsedErrors(errors);
	}, [log]);

	const filteredErrors = parsedErrors.filter((error) => {
		if (filter === "all") return true;
		return error.type === filter;
	});

	const handleFilterClick = (type: "error" | "warning") => {
		setFilter((current) => (current === type ? "all" : type));
	};

	const preprocessLogLines = (log: string): string => {
		const lines = log.split('\n');
		const processedLines: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const currentLine = lines[i];
			const nextLine = lines[i + 1];

			if (nextLine && shouldJoinLines(currentLine, nextLine)) {
				const joinedLine = joinSplitLine(currentLine, nextLine);
				processedLines.push(joinedLine);
				i++;
			} else {
				processedLines.push(currentLine);
			}
		}

		return processedLines.join('\n');
	};

	const shouldJoinLines = (currentLine: string, nextLine: string): boolean => {
		if (!currentLine || !nextLine) return false;

		const trimmedNext = nextLine.trim();

		if (currentLine.includes('bef') && trimmedNext.startsWith('ore ')) {
			return true;
		}

		if (currentLine.match(/[a-zA-Z]-?\s*$/) &&
			trimmedNext.match(/^[a-zA-Z]/) &&
			trimmedNext.length < 60 &&
			!trimmedNext.includes(':') &&
			!trimmedNext.startsWith('!') &&
			!trimmedNext.startsWith('Package') &&
			!trimmedNext.startsWith('LaTeX')) {
			return true;
		}

		return false;
	};

	const joinSplitLine = (currentLine: string, nextLine: string): string => {
		const trimmedNext = nextLine.trim();

		if (currentLine.includes('bef') && trimmedNext.startsWith('ore ')) {
			return currentLine.replace(/bef\s*$/, 'before ') + trimmedNext.substring(4);
		}

		if (currentLine.endsWith('-')) {
			return currentLine.slice(0, -1) + trimmedNext;
		}

		return currentLine.replace(/\s*$/, '') + trimmedNext;
	};

	const parseLatexLog = (log: string): ParsedError[] => {
		const result: ParsedError[] = [];
		const preprocessedLog = preprocessLogLines(log);
		const lines = preprocessedLog.split("\n");
		const currentFile = "main.tex";

		const getFileFromContext = (lineIndex: number): string => {
			const fileStack: string[] = [];

			for (let i = 0; i <= lineIndex; i++) {
				const line = lines[i];
				if (!line) continue;

				for (let j = 0; j < line.length; j++) {
					const char = line[j];

					if (char === '(') {
						const remaining = line.substring(j + 1);
						const fileMatch = remaining.match(/^([^()]*\.(?:tex|sty|cls|def|fd|cfg))/);
						if (fileMatch) {
							const filePath = fileMatch[1];
							const fileName = filePath.split("/").pop() || filePath;
							fileStack.push(fileName);
						}
					} else if (char === ')') {
						if (fileStack.length > 0) {
							fileStack.pop();
						}
					}
				}
			}

			return fileStack.length > 0
				? fileStack[fileStack.length - 1]
				: currentFile;
		};

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const contextFile = getFileFromContext(i);

			if (line.startsWith("! LaTeX Error:") || line.startsWith("! Fatal Package")) {
				const errorMessage = line.startsWith("! LaTeX Error:")
					? line.substring(14).trim()
					: line.substring(2).trim();
				let lineNumber: number | undefined;
				let lineContent: string | undefined;
				let fullMessage = errorMessage;

				for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
					const nextLine = lines[j];

					const lineMatch = nextLine.match(/^l\.(\d+)\s*(.*)/);
					if (lineMatch) {
						lineNumber = Number.parseInt(lineMatch[1], 10);
						lineContent = lineMatch[2];
						break;
					}

					if (nextLine.startsWith("Type <return>") ||
						nextLine.startsWith("!  ==>") ||
						nextLine.trim() === "" ||
						nextLine.startsWith("See ")) {
						break;
					}

					if (nextLine.match(/^\([^)]+\)\s+/)) {
						const messageContent = nextLine.replace(/^\([^)]+\)\s+/, "").trim();
						if (messageContent) {
							fullMessage += ` ${messageContent}`;
						}
					} else if (nextLine.trim() && !nextLine.startsWith("Type ")) {
						fullMessage += ` ${nextLine.trim()}`;
					}
				}

				result.push({
					type: "error",
					message: errorMessage,
					line: lineNumber,
					file: contextFile,
					lineContent: lineContent,
					fullMessage: fullMessage.replace(/\s+/g, " ").trim(),
				});
			} else if (line.startsWith("! ") && !line.startsWith("! LaTeX Error:")) {
				const errorMessage = line.substring(2).trim();
				let lineNumber: number | undefined;
				let lineContent: string | undefined;

				for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
					const nextLine = lines[j];
					const lineMatch = nextLine.match(/^l\.(\d+)\s*(.*)/);
					if (lineMatch) {
						lineNumber = Number.parseInt(lineMatch[1], 10);
						lineContent = lineMatch[2];
						break;
					}
				}

				result.push({
					type: "error",
					message: errorMessage,
					line: lineNumber,
					file: contextFile,
					lineContent: lineContent,
				});
			} else if (line.includes("LaTeX Warning:")) {
				const warningMatch = line.match(/LaTeX Warning:\s*(.+)/);
				if (warningMatch) {
					let fullMessage = warningMatch[1];
					let lineNumber: number | undefined;
					const warningFile = contextFile;

					const fileLineMatch = fullMessage.match(
						/(.+?)\s+on input line (\d+)/,
					);
					if (fileLineMatch) {
						fullMessage = fileLineMatch[1];
						lineNumber = Number.parseInt(fileLineMatch[2], 10);
					}

					const explicitFileMatch = fullMessage.match(
						/(.+?)\s+on page \d+ undefined on input line (\d+)/,
					);
					if (explicitFileMatch) {
						fullMessage = explicitFileMatch[1];
						lineNumber = Number.parseInt(explicitFileMatch[2], 10);
					}

					for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
						const nextLine = lines[j].trim();
						if (
							nextLine &&
							!nextLine.match(/^[A-Z]/) &&
							!nextLine.includes("Warning:") &&
							!nextLine.includes("Error:")
						) {
							fullMessage += ` ${nextLine}`;
						} else {
							break;
						}
					}

					result.push({
						type: "warning",
						message: fullMessage.replace(/\s+/g, " ").trim(),
						line: lineNumber,
						file: warningFile,
					});
				}
			} else if (line.includes("Package") && line.includes("Warning:")) {
				const packageWarningMatch = line.match(
					/Package\s+(\w+)\s+Warning:\s*(.+)/,
				);
				if (packageWarningMatch) {
					let fullMessage = `${packageWarningMatch[1]}: ${packageWarningMatch[2]}`;
					let lineNumber: number | undefined;

					const lineMatch = fullMessage.match(/(.+?)\s+on input line (\d+)/);
					if (lineMatch) {
						fullMessage = lineMatch[1];
						lineNumber = Number.parseInt(lineMatch[2], 10);
					}

					for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
						const nextLine = lines[j].trim();
						if (
							nextLine &&
							!nextLine.match(/^[A-Z]/) &&
							!nextLine.includes("Warning:") &&
							!nextLine.includes("Error:") &&
							!nextLine.startsWith("(")
						) {
							fullMessage += ` ${nextLine}`;
						} else {
							break;
						}
					}

					result.push({
						type: "warning",
						message: fullMessage.replace(/\s+/g, " ").trim(),
						line: lineNumber,
						file: contextFile,
					});
				}
			} else if (line.match(/(Over|Under)full\s+\\(h|v)box/)) {
				const boxMatch = line.match(
					/(Over|Under)full\s+\\(h|v)box.*?(?:at lines?\s+(\d+)(?:--(\d+))?)/,
				);
				if (boxMatch) {
					const startLine = Number.parseInt(boxMatch[3], 10);
					const _endLine = boxMatch[4]
						? Number.parseInt(boxMatch[4], 10)
						: startLine;

					result.push({
						type: "warning",
						message: `${boxMatch[1]}full ${boxMatch[2]}box`,
						line: startLine,
						file: contextFile,
					});
				}
			} else if (
				line.includes("There were undefined references") ||
				(line.includes("Citation") && line.includes("undefined"))
			) {
				result.push({
					type: "warning",
					message: "Undefined references detected",
					line: undefined,
					file: contextFile,
				});
			} else if (line.includes("Missing character:")) {
				const charMatch = line.match(
					/Missing character:\s*(.+?)(?:\s+in font|\s+on input line (\d+))?/,
				);
				if (charMatch) {
					result.push({
						type: "warning",
						message: `Missing character: ${charMatch[1]}`,
						line: charMatch[2] ? Number.parseInt(charMatch[2], 10) : undefined,
						file: contextFile,
					});
				}
			} else if (
				line.includes("Fatal error occurred") ||
				line.includes("Emergency stop")
			) {
				result.push({
					type: "error",
					message: "Fatal compilation error - no output produced",
					line: undefined,
					file: contextFile,
				});
			} else if (line.includes("File") && line.includes("not found")) {
				const fileMatch = line.match(/File\s+['`"]([^'"]+)[''"]\s+not found/);
				if (fileMatch) {
					result.push({
						type: "error",
						message: `File not found: ${fileMatch[1]}`,
						line: undefined,
						file: contextFile,
					});
				}
			}
		}

		return result;
	};

	const handleErrorClick = (error: ParsedError) => {
		if (error.line && onLineClick) {
			onLineClick(error.line);
		}
	};

	const getErrorTypeIcon = (type: string) => {
		switch (type) {
			case "error":
				return "❌";
			case "warning":
				return "⚠️";
			case "info":
				return "ℹ️";
			default:
				return "•";
		}
	};

	const tooltipInfo = [
        `Total errors: ${parsedErrors.filter((e) => e.type === "error").length}`,
        `Total warnings: ${parsedErrors.filter((e) => e.type === "warning").length}`,
        `Log size: ${log ? Math.round(log.length / 1024) + " KB" : "0 KB"}`,
        `Click error items to navigate to line`
	];

	const headerControls = (
		<div className="error-stats">
			<span
				className={`error-count ${filter === "error" ? "active" : ""}`}
				onClick={() => handleFilterClick("error")}
				title="Click to filter errors"
			>
				{getErrorTypeIcon("error")}{" "}
				{parsedErrors.filter((e) => e.type === "error").length}
			</span>
			<span
				className={`warning-count ${filter === "warning" ? "active" : ""}`}
				onClick={() => handleFilterClick("warning")}
				title="Click to filter warnings"
			>
				{getErrorTypeIcon("warning")}{" "}
				{parsedErrors.filter((e) => e.type === "warning").length}
			</span>
		</div>
	);

	return (
		<div className="latex-visualizer">
			<PluginHeader
				fileName="LaTeX Log"
				filePath="LaTeX Compilation Output"
				pluginName="LaTeX Error Visualizer"
				pluginVersion="1.0.0"
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className="latex-visualizer-content">
				{filteredErrors.length === 0 ? (
					<div className="no-errors">
						<div className="success-icon">✅</div>
						<div>
							{parsedErrors.length === 0
								? "No errors or warnings found."
								: `No ${filter}s found.`}
						</div>
						<div className="success-subtitle">
							{parsedErrors.length === 0
								? "Compilation appears successful!"
								: `Showing ${filter} items only.`}
						</div>
					</div>
				) : (
					<ul className="error-list">
						{filteredErrors.map((error, index) => (
							<li
								key={index}
								className={`error-item ${error.type} ${error.line ? "clickable" : ""}`}
								onClick={() => handleErrorClick(error)}
								title={
									error.line ? `Click to go to line ${error.line}` : undefined
								}
							>
								<div className="error-header">
									<span className="error-type-badge">
										<span className="error-icon">
											{getErrorTypeIcon(error.type)}
										</span>
										<span className="error-type-text">{error.type}</span>
									</span>
									<div className="error-location">
										{error.file && (
											<span
												className="error-file"
												title={`File: ${error.file}`}
											>
												📄 {error.file}
											</span>
										)}
										{error.line && (
											<span className="error-line">Line {error.line}</span>
										)}
									</div>
								</div>
								<div className="latex-error-message">
									{error.fullMessage || error.message}
								</div>
								{error.lineContent && (
									<pre className="error-context">{error.lineContent}</pre>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

export default LaTeXVisualizer;