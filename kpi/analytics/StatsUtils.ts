/**
 * Utilitaires statistiques pour l'analyse des données KPI
 */

export interface AnomalyResult {
  value: number;
  index: number;
  zScore: number;
  isAnomaly: boolean;
  severity: 'low' | 'medium' | 'high';
}

export interface TrendResult {
  direction: 'increasing' | 'decreasing' | 'stable';
  strength: number; // 0-1, force de la tendance
  slope: number;
  rSquared: number; // coefficient de détermination
  seasonality?: {
    detected: boolean;
    period?: number;
    amplitude?: number;
  };
}

export interface CorrelationResult {
  correlation: number; // coefficient de Pearson
  pValue: number;
  significance: 'none' | 'weak' | 'moderate' | 'strong';
  sampleSize: number;
}

export interface StatsSummary {
  count: number;
  mean: number;
  median: number;
  mode: number[];
  standardDeviation: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  quartiles: {
    q1: number;
    q2: number; // median
    q3: number;
    iqr: number;
  };
  skewness: number;
  kurtosis: number;
}

/**
 * Détecte les anomalies dans une série de valeurs en utilisant plusieurs méthodes.
 */
export function detectAnomalies(
  series: number[], 
  method: 'zscore' | 'iqr' | 'modified_zscore' = 'zscore',
  threshold: number = 3
): AnomalyResult[] {
  if (series.length < 3) {
    return [];
  }

  switch (method) {
    case 'zscore':
      return detectAnomaliesZScore(series, threshold);
    case 'iqr':
      return detectAnomaliesIQR(series);
    case 'modified_zscore':
      return detectAnomaliesModifiedZScore(series, threshold);
    default:
      return detectAnomaliesZScore(series, threshold);
  }
}

/**
 * Détection d'anomalies par Z-score classique.
 */
function detectAnomaliesZScore(series: number[], threshold: number = 3): AnomalyResult[] {
  const stats = calculateBasicStats(series);
  
  return series.map((value, index) => {
    const zScore = Math.abs((value - stats.mean) / stats.standardDeviation);
    const isAnomaly = zScore > threshold;
    
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (zScore > threshold * 2) severity = 'high';
    else if (zScore > threshold * 1.5) severity = 'medium';
    
    return {
      value,
      index,
      zScore,
      isAnomaly,
      severity
    };
  });
}

/**
 * Détection d'anomalies par méthode IQR (Interquartile Range).
 */
function detectAnomaliesIQR(series: number[]): AnomalyResult[] {
  const sorted = [...series].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  return series.map((value, index) => {
    const isAnomaly = value < lowerBound || value > upperBound;
    
    // Calculer la "distance" de l'anomalie
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (isAnomaly) {
      const distanceFromBound = Math.min(
        Math.abs(value - lowerBound),
        Math.abs(value - upperBound)
      );
      if (distanceFromBound > iqr * 2) severity = 'high';
      else if (distanceFromBound > iqr) severity = 'medium';
    }
    
    return {
      value,
      index,
      zScore: 0, // Non applicable pour IQR
      isAnomaly,
      severity
    };
  });
}

/**
 * Détection d'anomalies par Z-score modifié (utilise la médiane).
 */
function detectAnomaliesModifiedZScore(series: number[], threshold: number = 3.5): AnomalyResult[] {
  const median = percentile([...series].sort((a, b) => a - b), 0.5);
  const deviations = series.map(x => Math.abs(x - median));
  const mad = percentile([...deviations].sort((a, b) => a - b), 0.5); // Median Absolute Deviation
  
  return series.map((value, index) => {
    const modifiedZScore = 0.6745 * (value - median) / mad;
    const isAnomaly = Math.abs(modifiedZScore) > threshold;
    
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (Math.abs(modifiedZScore) > threshold * 2) severity = 'high';
    else if (Math.abs(modifiedZScore) > threshold * 1.5) severity = 'medium';
    
    return {
      value,
      index,
      zScore: Math.abs(modifiedZScore),
      isAnomaly,
      severity
    };
  });
}

/**
 * Analyse les tendances dans une série temporelle.
 */
export function analyzeTrends(series: number[], options: {
  detectSeasonality?: boolean;
  seasonalityPeriods?: number[];
} = {}): TrendResult {
  if (series.length < 3) {
    return {
      direction: 'stable',
      strength: 0,
      slope: 0,
      rSquared: 0
    };
  }

  // Régression linéaire simple
  const regression = linearRegression(series);
  
  // Déterminer la direction
  let direction: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (Math.abs(regression.slope) > 0.01) {
    direction = regression.slope > 0 ? 'increasing' : 'decreasing';
  }
  
  // Force de la tendance basée sur R²
  const strength = Math.max(0, Math.min(1, regression.rSquared));
  
  const result: TrendResult = {
    direction,
    strength,
    slope: regression.slope,
    rSquared: regression.rSquared
  };

  // Détection de saisonnalité si demandée
  if (options.detectSeasonality && series.length >= 12) {
    result.seasonality = detectSeasonality(series, options.seasonalityPeriods);
  }

  return result;
}

/**
 * Calcule la régression linéaire simple.
 */
function linearRegression(series: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  const n = series.length;
  const x = Array.from({ length: n }, (_, i) => i);
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = series.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * series[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumYY = series.reduce((sum, yi) => sum + yi * yi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calcul R²
  const meanY = sumY / n;
  const totalSumSquares = series.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
  const residualSumSquares = series.reduce((sum, yi, i) => {
    const predicted = slope * i + intercept;
    return sum + Math.pow(yi - predicted, 2);
  }, 0);
  
  const rSquared = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
  
  return { slope, intercept, rSquared: Math.max(0, rSquared) };
}

/**
 * Détecte la saisonnalité dans une série.
 */
function detectSeasonality(series: number[], periods: number[] = [7, 24, 30]): {
  detected: boolean;
  period?: number;
  amplitude?: number;
} {
  let bestPeriod = 0;
  let bestStrength = 0;
  
  for (const period of periods) {
    if (period >= series.length / 2) continue;
    
    const strength = calculateSeasonalStrength(series, period);
    if (strength > bestStrength) {
      bestStrength = strength;
      bestPeriod = period;
    }
  }
  
  const detected = bestStrength > 0.3; // Seuil arbitraire
  
  if (detected) {
    const amplitude = calculateSeasonalAmplitude(series, bestPeriod);
    return {
      detected: true,
      period: bestPeriod,
      amplitude
    };
  }
  
  return { detected: false };
}

/**
 * Calcule la force saisonnière pour une période donnée.
 */
function calculateSeasonalStrength(series: number[], period: number): number {
  const cycles = Math.floor(series.length / period);
  if (cycles < 2) return 0;
  
  const seasonalAverages = new Array(period).fill(0);
  const counts = new Array(period).fill(0);
  
  // Calculer les moyennes pour chaque position dans le cycle
  for (let i = 0; i < series.length; i++) {
    const position = i % period;
    seasonalAverages[position] += series[i];
    counts[position]++;
  }
  
  for (let i = 0; i < period; i++) {
    if (counts[i] > 0) {
      seasonalAverages[i] /= counts[i];
    }
  }
  
  // Calculer la variance saisonnière vs variance totale
  const overallMean = series.reduce((a, b) => a + b, 0) / series.length;
  const totalVariance = series.reduce((sum, val) => sum + Math.pow(val - overallMean, 2), 0);
  
  const seasonalMean = seasonalAverages.reduce((a, b) => a + b, 0) / period;
  const seasonalVariance = seasonalAverages.reduce((sum, val) => sum + Math.pow(val - seasonalMean, 2), 0);
  
  return totalVariance > 0 ? seasonalVariance / totalVariance : 0;
}

/**
 * Calcule l'amplitude saisonnière.
 */
function calculateSeasonalAmplitude(series: number[], period: number): number {
  const seasonalAverages = new Array(period).fill(0);
  const counts = new Array(period).fill(0);
  
  for (let i = 0; i < series.length; i++) {
    const position = i % period;
    seasonalAverages[position] += series[i];
    counts[position]++;
  }
  
  for (let i = 0; i < period; i++) {
    if (counts[i] > 0) {
      seasonalAverages[i] /= counts[i];
    }
  }
  
  return Math.max(...seasonalAverages) - Math.min(...seasonalAverages);
}

/**
 * Calcule la corrélation de Pearson entre deux séries.
 */
export function computeCorrelations(seriesA: number[], seriesB: number[]): CorrelationResult {
  const minLength = Math.min(seriesA.length, seriesB.length);
  
  if (minLength < 3) {
    return {
      correlation: 0,
      pValue: 1,
      significance: 'none',
      sampleSize: minLength
    };
  }
  
  // Prendre les n premiers éléments
  const a = seriesA.slice(0, minLength);
  const b = seriesB.slice(0, minLength);
  
  const meanA = a.reduce((sum, val) => sum + val, 0) / minLength;
  const meanB = b.reduce((sum, val) => sum + val, 0) / minLength;
  
  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;
  
  for (let i = 0; i < minLength; i++) {
    const devA = a[i] - meanA;
    const devB = b[i] - meanB;
    
    numerator += devA * devB;
    denominatorA += devA * devA;
    denominatorB += devB * devB;
  }
  
  const correlation = denominatorA === 0 || denominatorB === 0 
    ? 0 
    : numerator / Math.sqrt(denominatorA * denominatorB);
  
  // Calcul approximatif du p-value
  const pValue = calculatePValue(correlation, minLength);
  
  // Déterminer la significance
  let significance: 'none' | 'weak' | 'moderate' | 'strong' = 'none';
  const absCorr = Math.abs(correlation);
  if (pValue < 0.05) {
    if (absCorr >= 0.7) significance = 'strong';
    else if (absCorr >= 0.5) significance = 'moderate';
    else if (absCorr >= 0.3) significance = 'weak';
  }
  
  return {
    correlation,
    pValue,
    significance,
    sampleSize: minLength
  };
}

/**
 * Calcule un p-value approximatif pour la corrélation.
 */
function calculatePValue(correlation: number, sampleSize: number): number {
  if (sampleSize < 3) return 1;
  
  const t = correlation * Math.sqrt((sampleSize - 2) / (1 - correlation * correlation));
  
  // Approximation simple du p-value basée sur la distribution t
  const absT = Math.abs(t);
  if (absT > 3.5) return 0.001;
  if (absT > 2.5) return 0.01;
  if (absT > 2.0) return 0.05;
  if (absT > 1.5) return 0.1;
  return 0.2;
}

/**
 * Calcule des statistiques descriptives complètes.
 */
export function calculateBasicStats(series: number[]): StatsSummary {
  if (series.length === 0) {
    throw new Error('Cannot calculate stats for empty series');
  }
  
  const sorted = [...series].sort((a, b) => a - b);
  const n = series.length;
  
  // Statistiques de base
  const sum = series.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  
  // Médiane
  const median = percentile(sorted, 0.5);
  
  // Mode (valeur la plus fréquente)
  const mode = calculateMode(series);
  
  // Variance et écart-type
  const variance = series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const standardDeviation = Math.sqrt(variance);
  
  // Quartiles
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  
  // Skewness (asymétrie)
  const skewness = calculateSkewness(series, mean, standardDeviation);
  
  // Kurtosis (aplatissement)
  const kurtosis = calculateKurtosis(series, mean, standardDeviation);
  
  return {
    count: n,
    mean,
    median,
    mode,
    standardDeviation,
    variance,
    min,
    max,
    range,
    quartiles: {
      q1,
      q2: median,
      q3,
      iqr
    },
    skewness,
    kurtosis
  };
}

/**
 * Calcule le percentile d'une série triée.
 */
function percentile(sortedSeries: number[], p: number): number {
  const index = (sortedSeries.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (lower === upper) {
    return sortedSeries[lower];
  }
  
  return sortedSeries[lower] * (1 - weight) + sortedSeries[upper] * weight;
}

/**
 * Calcule le mode (valeur(s) la plus fréquente).
 */
function calculateMode(series: number[]): number[] {
  const frequency = new Map<number, number>();
  
  for (const value of series) {
    frequency.set(value, (frequency.get(value) || 0) + 1);
  }
  
  const maxFreq = Math.max(...frequency.values());
  
  return Array.from(frequency.entries())
    .filter(([_, freq]) => freq === maxFreq)
    .map(([value, _]) => value);
}

/**
 * Calcule l'asymétrie (skewness).
 */
function calculateSkewness(series: number[], mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  
  const n = series.length;
  const sum = series.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 3), 0);
  
  return (n / ((n - 1) * (n - 2))) * sum;
}

/**
 * Calcule l'aplatissement (kurtosis).
 */
function calculateKurtosis(series: number[], mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  
  const n = series.length;
  const sum = series.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 4), 0);
  
  const kurtosis = (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * sum;
  const correction = 3 * Math.pow(n - 1, 2) / ((n - 2) * (n - 3));
  
  return kurtosis - correction; // Excess kurtosis
}