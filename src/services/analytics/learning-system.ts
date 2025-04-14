import { Redis } from 'ioredis';
import { Connection } from '@solana/web3.js';
import * as tf from '@tensorflow/tfjs-node';

interface TokenPrediction {
  successProbability: number;
  predictedROI: number;
  confidence: number;
  factors: string[];
}

interface TrainingData {
  features: number[];
  outcome: number;  // ROI achieved
}

interface TrainingOutcome {
  roi: number;
  peakPrice: number;
  timeToSuccess: number;
}

interface TrainingFeedback {
  accurate: boolean;
  comments: string;
  actualOutcome: number;
}

export class LearningSystem {
  private redis: Redis;
  private model!: tf.LayersModel;
  private readonly FEATURES = [
    'liquidity',
    'holders',
    'volume',
    'socialScore',
    'rugScore',
    'whaleCount',
    'communityScore',
    'timeScore'
  ];

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
    
    this.initializeModel();
  }

  private async initializeModel(): Promise<void> {
    try {
      this.model = await tf.loadLayersModel('file://./models/token_predictor.json');
    } catch {
      this.model = this.createModel();
      await this.trainModel();
    }
  }

  private createModel(): tf.LayersModel {
    const model = tf.sequential();
    
    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu',
      inputShape: [this.FEATURES.length]
    }));
    
    model.add(tf.layers.dense({
      units: 16,
      activation: 'relu'
    }));
    
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    model.add(tf.layers.dense({
      units: 1,
      activation: 'sigmoid'
    }));
    
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['accuracy']
    });
    
    return model;
  }

  async predictSuccess(tokenMetrics: any): Promise<TokenPrediction> {
    const features = this.FEATURES.map(f => tokenMetrics[f]);
    const tensorData = tf.tensor2d([features]);
    
    const prediction = await this.model.predict(tensorData) as tf.Tensor;
    const [successProb, roi] = Array.from(prediction.dataSync());
    
    const factors = await this.analyzeContributingFactors(features);
    
    return {
      successProbability: successProb,
      predictedROI: roi,
      confidence: this.calculateConfidence(features),
      factors
    };
  }

  async recordOutcome(
    tokenAddress: string,
    initialMetrics: any,
    outcome: TrainingOutcome
  ): Promise<void> {
    const features = this.FEATURES.map(f => initialMetrics[f]);
    await this.addTrainingData({
      features,
      outcome: outcome.roi
    });

    if (await this.shouldRetrain()) {
      await this.trainModel();
    }
  }

  private async addTrainingData(data: TrainingData): Promise<void> {
    const key = 'training_data';
    await this.redis.rpush(key, JSON.stringify(data));
  }

  private async shouldRetrain(): Promise<boolean> {
    const lastTraining = await this.redis.get('last_training');
    if (!lastTraining) return true;

    const timeSinceLastTraining = Date.now() - parseInt(lastTraining);
    return timeSinceLastTraining > 24 * 60 * 60 * 1000; // Retrain daily
  }

  private async trainModel(): Promise<void> {
    const data = await this.getTrainingData();
    if (data.length === 0) return;

    const features = tf.tensor2d(data.map(d => d.features));
    const outcomes = tf.tensor2d(data.map(d => [d.outcome]));

    await this.model.fit(features, outcomes, {
      epochs: 100,
      batchSize: 32,
      callbacks: {
        onEpochEnd: (epoch, logs) => this.onEpochEnd(epoch, logs)
      }
    });

    await this.redis.set('last_training', Date.now().toString());
  }

  private onEpochEnd(epoch: number, logs: tf.Logs | undefined): void {
    if (logs) {
      console.log(`Epoch ${epoch}: loss = ${logs.loss}`);
    }
  }

  private async getTrainingData(): Promise<TrainingData[]> {
    const key = 'training_data';
    const data = await this.redis.lrange(key, 0, -1);
    return data.map(d => JSON.parse(d));
  }

  private calculateConfidence(features: number[]): number {
    return this.getPatternConfidence(features);
  }

  private getPatternConfidence(features: number[]): number {
    // Placeholder implementation
    return 0.8;
  }

  private async analyzeContributingFactors(features: number[]): Promise<string[]> {
    const importances = await this.calculateFeatureImportance(features);
    return importances
      .filter(f => f.importance > 0.5)
      .map(f => f.name);
  }

  private async calculateFeatureImportance(features: number[]): Promise<Array<{name: string; importance: number}>> {
    return this.FEATURES.map((name, i) => ({
      name,
      importance: Math.abs(features[i])
    }));
  }

  async processFeedback(
    tokenAddress: string,
    feedback: TrainingFeedback
  ): Promise<void> {
    await this.updateAccuracyMetrics(feedback.accurate);
    
    if (!feedback.accurate) {
      await this.addTrainingData({
        features: await this.getStoredFeatures(tokenAddress),
        outcome: feedback.actualOutcome
      });
    }
  }

  private async updateAccuracyMetrics(accurate: boolean): Promise<void> {
    const key = 'accuracy_metrics';
    const metrics = JSON.parse(await this.redis.get(key) || '{"total":0,"correct":0}');
    
    metrics.total++;
    if (accurate) metrics.correct++;
    
    await this.redis.set(key, JSON.stringify(metrics));
  }

  private async getStoredFeatures(tokenAddress: string): Promise<number[]> {
    const key = `features:${tokenAddress}`;
    const stored = await this.redis.get(key);
    return stored ? JSON.parse(stored) : [];
  }
}
