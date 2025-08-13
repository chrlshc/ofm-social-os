import { logger } from '../utils/logger';

/**
 * Simple TF-IDF vectorizer implementation for bio text
 */
export class TfIdfVectorizer {
  private vocabulary: Map<string, number> = new Map();
  private idfValues: Map<string, number> = new Map();
  private documents: string[][] = [];

  /**
   * Fit the vectorizer on a corpus of documents
   */
  fit(documents: string[]): void {
    logger.info(`Fitting TF-IDF vectorizer on ${documents.length} documents`);
    
    // Tokenize documents and build vocabulary
    this.documents = documents.map(doc => this.tokenize(doc));
    
    let vocabIndex = 0;
    const documentFrequency = new Map<string, number>();
    
    for (const tokens of this.documents) {
      const uniqueTokens = new Set(tokens);
      
      for (const token of uniqueTokens) {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, vocabIndex++);
        }
        documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      }
    }
    
    // Calculate IDF values
    const numDocs = documents.length;
    for (const [token, df] of documentFrequency) {
      this.idfValues.set(token, Math.log(numDocs / df));
    }
    
    logger.info(`Vocabulary size: ${this.vocabulary.size}`);
  }

  /**
   * Transform documents into TF-IDF vectors
   */
  transform(documents: string[]): number[][] {
    const vectors: number[][] = [];
    
    for (const doc of documents) {
      const tokens = this.tokenize(doc);
      const vector = this.calculateTfIdf(tokens);
      vectors.push(vector);
    }
    
    return vectors;
  }

  /**
   * Fit and transform in one step
   */
  fitTransform(documents: string[]): number[][] {
    this.fit(documents);
    return this.transform(documents);
  }

  /**
   * Get the vocabulary size
   */
  getVocabularySize(): number {
    return this.vocabulary.size;
  }

  /**
   * Get top features (words) for a cluster centroid
   */
  getTopFeatures(centroid: number[], n: number = 10): string[] {
    const features: Array<[string, number]> = [];
    
    for (const [word, index] of this.vocabulary) {
      if (centroid[index] > 0) {
        features.push([word, centroid[index]]);
      }
    }
    
    // Sort by weight and return top n
    return features
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([word]) => word);
  }

  /**
   * Tokenize a document
   */
  private tokenize(text: string): string[] {
    // Simple word tokenization
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  /**
   * Calculate TF-IDF vector for a document
   */
  private calculateTfIdf(tokens: string[]): number[] {
    const vector = new Array(this.vocabulary.size).fill(0);
    const tokenCounts = new Map<string, number>();
    
    // Count token frequencies
    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
    
    // Calculate TF-IDF
    const totalTokens = tokens.length;
    for (const [token, count] of tokenCounts) {
      const index = this.vocabulary.get(token);
      if (index !== undefined) {
        const tf = count / totalTokens;
        const idf = this.idfValues.get(token) || 0;
        vector[index] = tf * idf;
      }
    }
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return vector.map(val => val / magnitude);
    }
    
    return vector;
  }
}

/**
 * Simple K-Means clustering implementation
 */
export class KMeansClustering {
  private k: number;
  private maxIterations: number;
  private centroids: number[][] = [];
  private labels: number[] = [];

  constructor(k: number, maxIterations: number = 100) {
    this.k = k;
    this.maxIterations = maxIterations;
  }

  /**
   * Fit the K-Means model
   */
  fit(data: number[][]): void {
    logger.info(`Fitting K-Means with k=${this.k}`);
    
    const n = data.length;
    const d = data[0].length;
    
    // Initialize centroids using K-Means++
    this.centroids = this.initializeCentroids(data);
    
    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Assign points to clusters
      const newLabels = data.map(point => this.getNearestCentroid(point));
      
      // Check for convergence
      if (this.labels.length > 0 && this.labels.every((label, i) => label === newLabels[i])) {
        logger.info(`K-Means converged after ${iter} iterations`);
        break;
      }
      
      this.labels = newLabels;
      
      // Update centroids
      for (let i = 0; i < this.k; i++) {
        const clusterPoints = data.filter((_, j) => this.labels[j] === i);
        if (clusterPoints.length > 0) {
          this.centroids[i] = this.calculateCentroid(clusterPoints);
        }
      }
    }
    
    logger.info('K-Means clustering completed');
  }

  /**
   * Predict cluster labels for new data
   */
  predict(data: number[][]): number[] {
    return data.map(point => this.getNearestCentroid(point));
  }

  /**
   * Get the cluster centroids
   */
  getCentroids(): number[][] {
    return this.centroids;
  }

  /**
   * Get the cluster labels
   */
  getLabels(): number[] {
    return this.labels;
  }

  /**
   * Initialize centroids using K-Means++
   */
  private initializeCentroids(data: number[][]): number[][] {
    const centroids: number[][] = [];
    const n = data.length;
    
    // Choose first centroid randomly
    const firstIndex = Math.floor(Math.random() * n);
    centroids.push([...data[firstIndex]]);
    
    // Choose remaining centroids
    for (let i = 1; i < this.k; i++) {
      const distances = data.map(point => {
        const minDist = Math.min(...centroids.map(c => this.euclideanDistance(point, c)));
        return minDist * minDist;
      });
      
      // Choose next centroid with probability proportional to squared distance
      const totalDist = distances.reduce((sum, d) => sum + d, 0);
      let random = Math.random() * totalDist;
      
      for (let j = 0; j < n; j++) {
        random -= distances[j];
        if (random <= 0) {
          centroids.push([...data[j]]);
          break;
        }
      }
    }
    
    return centroids;
  }

  /**
   * Find nearest centroid for a point
   */
  private getNearestCentroid(point: number[]): number {
    let minDist = Infinity;
    let nearest = 0;
    
    for (let i = 0; i < this.centroids.length; i++) {
      const dist = this.euclideanDistance(point, this.centroids[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }
    
    return nearest;
  }

  /**
   * Calculate centroid of a set of points
   */
  private calculateCentroid(points: number[][]): number[] {
    const d = points[0].length;
    const centroid = new Array(d).fill(0);
    
    for (const point of points) {
      for (let i = 0; i < d; i++) {
        centroid[i] += point[i];
      }
    }
    
    return centroid.map(val => val / points.length);
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }
}