// src/types/statistics.ts
export interface DocumentStatistics {
    words: number;
    headers: number;
    captions: number;
    mathInline: number;
    mathDisplay: number;
    files?: number;
}

export interface StatisticsService {
    getStatistics(mainFilePath: string): Promise<DocumentStatistics>;
}