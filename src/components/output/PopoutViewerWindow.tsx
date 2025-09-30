// src/components/output/PdfViewerWindow.tsx
import React, { useEffect, useRef, useState } from "react";

import { pluginRegistry } from "../../plugins/PluginRegistry";
import { useSettings } from "../../hooks/useSettings";

interface PdfMessage {
	type: 'pdf-update' | 'pdf-clear' | 'window-ready' | 'window-closed';
	data?: {
		pdf?: Uint8Array;
		fileName?: string;
		projectName?: string;
		compileLog?: string;
		status?: number;
	};
	timestamp: number;
}

interface PdfViewerWindowProps {
	projectId: string;
}

const PdfViewerWindow: React.FC<PdfViewerWindowProps> = ({ projectId }) => {
	const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
	const [fileName, setFileName] = useState<string>("output.pdf");
	const [projectName, setProjectName] = useState<string>("PDF Output");
	const [compileLog, setCompileLog] = useState<string>("");
	const [compileStatus, setCompileStatus] = useState<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const channelRef = useRef<BroadcastChannel | null>(null);
	const { getSetting } = useSettings();

	const useEnhancedRenderer = getSetting("pdf-renderer-enable")?.value ?? true;
	const pdfRendererPlugin = pluginRegistry.getRendererForOutput("pdf");

	useEffect(() => {
		const channel = new BroadcastChannel(`texlyre-pdf-${projectId}`);
		channelRef.current = channel;

		const handleMessage = (event: MessageEvent) => {
			const message = event.data as PdfMessage;

			switch (message.type) {
				case 'pdf-update':
					if (message.data?.pdf) {
						setPdfData(message.data.pdf);
						if (message.data.fileName) setFileName(message.data.fileName);
						if (message.data.projectName) setProjectName(message.data.projectName);
					}
					if (message.data?.compileLog !== undefined) {
						setCompileLog(message.data.compileLog);
					}
					if (message.data?.status !== undefined) {
						setCompileStatus(message.data.status);
					}
					setIsLoading(false);
					break;
				case 'pdf-clear':
					setPdfData(null);
					setCompileLog("");
					setCompileStatus(0);
					setIsLoading(false);
					break;
			}
		};

		channel.addEventListener('message', handleMessage);

		channel.postMessage({
			type: 'window-ready',
			timestamp: Date.now()
		});

		const handleBeforeUnload = () => {
			channel.postMessage({
				type: 'window-closed',
				timestamp: Date.now()
			});
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			channel.removeEventListener('message', handleMessage);
			channel.close();
		};
	}, [projectId]);

	const handleSavePdf = (fileName: string) => {
		if (!pdfData) return;

		const blob = new Blob([pdfData], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	return (
		<div style={{
			height: '100vh',
			width: '100%',
			display: 'flex',
			flexDirection: 'column',
			backgroundColor: 'var(--pico-background, #fff)',
			color: 'var(--pico-color, #000)'
		}}>
			<header style={{
				padding: '0.5rem 1rem',
				width: '100%',
				borderBottom: '1px solid var(--pico-border-color, #ddd)',
				backgroundColor: 'var(--pico-secondary-background, #f8f9fa)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between'
			}}>
				<div>
					<h1 style={{ margin: 0, fontSize: '1.2rem' }}>{projectName}</h1>
					<p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.7 }}>PDF Output</p>
				</div>
				{pdfData && (
					<button
						onClick={() => handleSavePdf(fileName)}
						style={{
							padding: '0.5rem 1rem',
							backgroundColor: 'var(--pico-primary, #007bff)',
							color: 'white',
							border: 'none',
							borderRadius: '4px',
							cursor: 'pointer'
						}}
					>
						Download PDF
					</button>
				)}
			</header>

			<div style={{ flex: 1, overflow: 'hidden' }}>
				{isLoading ? (
					<div style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						height: '100%',
						flexDirection: 'column',
						gap: '1rem'
					}}>
						<div>Loading PDF viewer...</div>
						<div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
							Waiting for compilation results from main window
						</div>
					</div>
				) : !pdfData ? (
					<div style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						height: '100%',
						flexDirection: 'column',
						gap: '1rem'
					}}>
						<div>No PDF available</div>
						{compileStatus !== 0 && (
							<div style={{ fontSize: '0.9rem', color: 'var(--pico-del-color, #dc3545)' }}>
								Compilation failed. Check the log in the main window.
							</div>
						)}
						<div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
							Compile a LaTeX document in the main window to see the PDF here
						</div>
					</div>
				) : (
					<div style={{ height: '100%', width: '100%' }}>
						{pdfRendererPlugin && useEnhancedRenderer ? (
							React.createElement(pdfRendererPlugin.renderOutput, {
								content: pdfData.buffer,
								mimeType: "application/pdf",
								fileName: fileName,
								onSave: handleSavePdf,
							})
						) : (
							<embed
								src={URL.createObjectURL(new Blob([pdfData], { type: "application/pdf" }))}
								type="application/pdf"
								style={{ width: "100%", height: "100%" }}
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default PdfViewerWindow;