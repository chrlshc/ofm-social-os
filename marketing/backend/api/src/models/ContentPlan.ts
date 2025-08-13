import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../database';

export enum ContentPlanStatus {
  PENDING = 'PENDING',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  SCHEDULED = 'SCHEDULED',
  POSTED = 'POSTED',
  FAILED = 'FAILED'
}

export enum Platform {
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  TWITTER = 'twitter',
  REDDIT = 'reddit'
}

export interface ContentPlanAttributes {
  id: string;
  userId: string;
  contentId?: string;
  contentRef?: string;
  platform: Platform;
  scheduledTime: Date;
  caption?: string;
  hashtags?: string[];
  status: ContentPlanStatus;
  metadata?: Record<string, any>;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ContentPlan extends Model<ContentPlanAttributes> implements ContentPlanAttributes {
  public id!: string;
  public userId!: string;
  public contentId?: string;
  public contentRef?: string;
  public platform!: Platform;
  public scheduledTime!: Date;
  public caption?: string;
  public hashtags?: string[];
  public status!: ContentPlanStatus;
  public metadata?: Record<string, any>;
  public error?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ContentPlan.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      index: true,
    },
    contentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    contentRef: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    platform: {
      type: DataTypes.ENUM(...Object.values(Platform)),
      allowNull: false,
      index: true,
    },
    scheduledTime: {
      type: DataTypes.DATE,
      allowNull: false,
      index: true,
    },
    caption: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    hashtags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM(...Object.values(ContentPlanStatus)),
      allowNull: false,
      defaultValue: ContentPlanStatus.PENDING,
      index: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'content_plans',
    indexes: [
      {
        fields: ['userId', 'scheduledTime'],
      },
      {
        fields: ['platform', 'status'],
      },
    ],
  }
);