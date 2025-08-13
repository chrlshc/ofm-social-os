import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../database';

export interface TopProfileAttributes {
  id: string;
  platform: string;
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  likesCount?: number;
  category?: string;
  cluster?: number;
  metadata?: Record<string, any>;
  scrapedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TopProfile extends Model<TopProfileAttributes> implements TopProfileAttributes {
  public id!: string;
  public platform!: string;
  public username!: string;
  public fullName?: string;
  public bio?: string;
  public profilePicUrl?: string;
  public followersCount?: number;
  public followingCount?: number;
  public postsCount?: number;
  public likesCount?: number;
  public category?: string;
  public cluster?: number;
  public metadata?: Record<string, any>;
  public scrapedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

TopProfile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    platform: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    profilePicUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    followersCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    followingCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    postsCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    likesCount: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cluster: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    scrapedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'top_profiles',
    indexes: [
      {
        unique: true,
        fields: ['platform', 'username'],
      },
      {
        fields: ['category'],
      },
      {
        fields: ['cluster'],
      },
      {
        fields: ['followersCount'],
      },
    ],
  }
);