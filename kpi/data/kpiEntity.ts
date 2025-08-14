import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('kpi_metrics')
@Index(['modelName', 'createdAt'])
@Index(['metricName', 'createdAt'])
export class KpiMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', name: 'model_name' })
  @Index()
  modelName: string;

  @Column({ type: 'text', name: 'metric_name' })
  @Index()
  metricName: string;

  @Column({ type: 'numeric' })
  value: number;

  @Column({ type: 'text', nullable: true })
  @Index()
  platform: string;

  @Column({ type: 'text', nullable: true, name: 'campaign_id' })
  campaignId: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('kpi_insights')
@Index(['modelName', 'createdAt'])
export class KpiInsight {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', name: 'model_name' })
  @Index()
  modelName: string;

  @Column({ type: 'text' })
  insight: string;

  @Column({ 
    type: 'enum', 
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  })
  severity: 'info' | 'warning' | 'critical';

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('kpi_recommendations')
export class KpiRecommendation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', name: 'model_name' })
  modelName: string;

  @Column({ type: 'text' })
  recommendation: string;

  @Column({ 
    type: 'enum', 
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  })
  priority: 'low' | 'medium' | 'high';

  @Column({ 
    type: 'enum', 
    enum: ['pending', 'applied', 'rejected'],
    default: 'pending'
  })
  status: 'pending' | 'applied' | 'rejected';

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('kpi_model_learnings')
export class KpiModelLearning {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', name: 'source_model' })
  sourceModel: string;

  @Column({ type: 'text', name: 'target_model' })
  targetModel: string;

  @Column({ type: 'text' })
  learning: string;

  @Column({ type: 'numeric' })
  confidence: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}