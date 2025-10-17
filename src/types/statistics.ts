// src/types/statistics.ts
export interface FileStatistics {
    filename: string;
    words: number;
    headers: number;
    captions: number;
    mathInline: number;
    mathDisplay: number;
    numHeaders: number;
    numFloats: number;
}

export interface DocumentStatistics {
    words: number;
    headers: number;
    captions: number;
    mathInline: number;
    mathDisplay: number;
    numHeaders?: number;
    numFloats?: number;
    files?: number;
    fileStats?: FileStatistics[];
    rawOutput?: string;
}

export interface StatisticsOptions {
    includeFiles: boolean;
    merge: boolean;
    brief: boolean;
    total: boolean;
    sum: boolean;
    verbose: number;
}

export interface StatisticsService {
    getStatistics(mainFilePath: string, options: StatisticsOptions): Promise<DocumentStatistics>;
}