// src/extensions/codemirror/AnnotationExtension.ts
import { annotationMaskingExtension } from './annotations/annotationMasking';
import { createTagProtection } from './annotations/tagProtection';

// This is a shared handler both for comments and reviews
export const annotationSystemExtension = [
	annotationMaskingExtension,
	createTagProtection(),
];
