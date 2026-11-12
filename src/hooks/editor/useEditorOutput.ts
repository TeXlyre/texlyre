// src/hooks/editor/useEditorOutput.ts
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../useAuth';
import { useCollab } from '../useCollab';
import type { DocumentList } from '../../types/documents';
import { useSettings } from '../useSettings';
import { typesetterRegistryService } from '../../services/TypesetterRegistryService';
import type { TypesetterProvider } from '../../types/compilation';
import type { ProjectType } from '../../types/projects';

export const useEditorOutput = () => {
	const { getProjectById } = useAuth();
	const { data: doc } = useCollab<DocumentList>();
	const { getSetting } = useSettings();
	const [storedProject, setStoredProject] = useState<{
		type: ProjectType;
		compilerId?: string;
	} | null>(null);
	const projectType =
		doc?.projectMetadata?.type ?? storedProject?.type ?? 'latex';
	const projectTypeKnown =
		doc?.projectMetadata?.type !== undefined ||
		(doc !== undefined && storedProject !== null);
	const compilerId =
		doc?.projectMetadata?.compilerId ?? storedProject?.compilerId;
	const [showLatexOutput, setShowLatexOutput] = useState(false);
	const [showTypstOutput, setShowTypstOutput] = useState(false);
	const [activeExternalProvider, setActiveExternalProvider] =
		useState<TypesetterProvider | null>(null);
	const [temporaryLatexExpand, setTemporaryLatexExpand] = useState(false);
	const [temporaryTypstExpand, setTemporaryTypstExpand] = useState(false);
	const [temporaryExternalExpand, setTemporaryExternalExpand] = useState(false);
	const autoExpandOutput =
		(getSetting('compilation-auto-expand-output')?.value as boolean) ?? true;

	const setOutputForFileName = useCallback(
		(name?: string) => {
			const extension = name?.split('.').pop() ?? '';
			const byExtension = name
				? typesetterRegistryService.getForExtension(extension, projectType)
				: undefined;
			const effectiveType =
				byExtension?.projectType ??
				typesetterRegistryService.getForProjectType(projectType)?.projectType ??
				projectType;
			const provider = typesetterRegistryService.resolve(
				effectiveType,
				compilerId,
			);

			setShowLatexOutput(provider?.id === 'internal:latex');
			setShowTypstOutput(provider?.id === 'internal:typst');
			setActiveExternalProvider(
				provider && provider.source !== 'builtin' ? provider : null,
			);
		},
		[projectType, compilerId],
	);

	const handleLatexOutputExpand = useCallback(() => {
		if (!autoExpandOutput) return;
		setShowLatexOutput(true);
		setTemporaryLatexExpand(true);
	}, [autoExpandOutput]);

	const handleTypstOutputExpand = useCallback(() => {
		if (!autoExpandOutput) return;
		setShowTypstOutput(true);
		setTemporaryTypstExpand(true);
	}, [autoExpandOutput]);

	const handleExternalOutputExpand = useCallback(() => {
		if (!autoExpandOutput) return;
		setTemporaryExternalExpand(true);
	}, [autoExpandOutput]);

	const clearTemporaryLatexExpand = useCallback(() => {
		setTemporaryLatexExpand(false);
	}, []);

	const clearTemporaryTypstExpand = useCallback(() => {
		setTemporaryTypstExpand(false);
	}, []);

	const clearTemporaryExternalExpand = useCallback(() => {
		setTemporaryExternalExpand(false);
	}, []);

	useEffect(() => {
		const loadProjectType = async () => {
			const projectId = sessionStorage.getItem('currentProjectId');
			if (!projectId) return;

			const project = await getProjectById(projectId);
			if (project) {
				setStoredProject({
					type: project.type || 'latex',
					compilerId: project.compilerId,
				});
			}
		};

		void loadProjectType();
		document.addEventListener('project-metadata-updated', loadProjectType);
		return () =>
			document.removeEventListener('project-metadata-updated', loadProjectType);
	}, [getProjectById]);

	useEffect(() => {
		document.addEventListener('expand-latex-output', handleLatexOutputExpand);
		document.addEventListener('expand-typst-output', handleTypstOutputExpand);
		document.addEventListener(
			'expand-external-output',
			handleExternalOutputExpand,
		);

		return () => {
			document.removeEventListener(
				'expand-latex-output',
				handleLatexOutputExpand,
			);
			document.removeEventListener(
				'expand-typst-output',
				handleTypstOutputExpand,
			);
			document.removeEventListener(
				'expand-external-output',
				handleExternalOutputExpand,
			);
		};
	}, [
		handleLatexOutputExpand,
		handleTypstOutputExpand,
		handleExternalOutputExpand,
	]);

	return {
		projectType,
		projectTypeKnown,
		showLatexOutput,
		showTypstOutput,
		activeExternalProvider,
		temporaryLatexExpand,
		temporaryTypstExpand,
		temporaryExternalExpand,
		setOutputForFileName,
		handleLatexOutputExpand,
		handleTypstOutputExpand,
		handleExternalOutputExpand,
		clearTemporaryLatexExpand,
		clearTemporaryTypstExpand,
		clearTemporaryExternalExpand,
	};
};
