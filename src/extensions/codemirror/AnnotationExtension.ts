// src/extensions/codemirror/AnnotationExtension.ts
import { annotationMaskingExtension } from './annotations/annotationMasking';
import { createTagProtection } from './annotations/tagProtection';

/** Shared syntax handling installed once for comments and reviews. */
export const annotationSystemExtension = [
	annotationMaskingExtension,
	createTagProtection(),
];
