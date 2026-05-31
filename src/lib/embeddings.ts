import { pipeline } from '@xenova/transformers';

class EmbeddingPipeline {
    static task: any = 'feature-extraction';
    static model = 'Xenova/bge-small-en-v1.5';
    static instance: Promise<any> | null = null;

    static async getInstance(progress_callback?: Function) {
        if (this.instance === null) {
            // Instantiate the feature-extraction pipeline precisely once
            this.instance = pipeline(this.task, this.model, { progress_callback }) as Promise<any>;
        }
        return this.instance;
    }
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const extractor = await EmbeddingPipeline.getInstance();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}
