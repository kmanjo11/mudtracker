import * as tf from '@tensorflow/tfjs-node';

export const ML_CONFIG = {
  // Model Architecture
  layers: [
    {
      units: 128,
      activation: 'relu',
      inputShape: [8]  // 8 features
    },
    {
      units: 64,
      activation: 'relu'
    },
    {
      units: 32,
      activation: 'relu'
    },
    {
      units: 1,
      activation: 'sigmoid'  // For probability output
    }
  ],

  // Training Configuration
  training: {
    epochs: 100,
    batchSize: 32,
    validationSplit: 0.2,
    shuffle: true,
    callbacks: [
      tf.callbacks.earlyStopping({
        monitor: 'val_loss',
        patience: 10
      })
    ]
  },

  // Feature Configuration
  features: {
    liquidity: {
      weight: 0.25,
      normalization: {
        min: 0,
        max: 1000000  // $1M USD
      }
    },
    holders: {
      weight: 0.15,
      normalization: {
        min: 0,
        max: 10000
      }
    },
    volume: {
      weight: 0.2,
      normalization: {
        min: 0,
        max: 5000000  // $5M USD
      }
    },
    socialScore: {
      weight: 0.1,
      normalization: {
        min: 0,
        max: 100
      }
    },
    rugScore: {
      weight: 0.1,
      normalization: {
        min: 0,
        max: 100
      }
    },
    whaleCount: {
      weight: 0.05,
      normalization: {
        min: 0,
        max: 100
      }
    },
    communityScore: {
      weight: 0.1,
      normalization: {
        min: 0,
        max: 100
      }
    },
    timeScore: {
      weight: 0.05,
      normalization: {
        min: 0,
        max: 100
      }
    }
  },

  // Model Performance Thresholds
  thresholds: {
    minAccuracy: 0.7,
    minPrecision: 0.65,
    minRecall: 0.65,
    maxFalsePositiveRate: 0.3
  },

  // Retraining Configuration
  retraining: {
    frequency: 24 * 60 * 60 * 1000,  // 24 hours
    minSamples: 1000,
    maxSamples: 100000,
    performanceThreshold: 0.75
  }
};
