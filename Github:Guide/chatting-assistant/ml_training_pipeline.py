#!/usr/bin/env python3
"""
Machine Learning Training Pipeline for Custom OnlyFans Chatting Models
"""

import logging
import json
import os
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from pathlib import Path
import pickle

# ML libraries
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline

# Optional transformers (install if available)
try:
    from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
    from transformers import pipeline as transformers_pipeline
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

from database import db
from config_manager import config

logger = logging.getLogger(__name__)

class MLTrainingPipeline:
    """Comprehensive ML training pipeline for personality and engagement classification"""
    
    def __init__(self):
        self.models_dir = Path("models")
        self.models_dir.mkdir(exist_ok=True)
        
        self.personality_model = None
        self.engagement_model = None
        self.vectorizer = None
        
        self.training_history = []
        self.performance_metrics = {}
    
    def collect_training_data(self, min_samples: int = 100) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Collect training data from database for both personality and engagement classification
        """
        logger.info("Collecting training data from database...")
        
        # Get fan profiles with conversation history
        fan_profiles = db.get_all_fan_profiles()
        conversations = []
        
        personality_data = []
        engagement_data = []
        
        for profile in fan_profiles:
            fan_id = profile['fan_id']
            fan_conversations = db.get_conversation_history(fan_id, limit=50)
            
            if not fan_conversations or len(fan_conversations) < 3:
                continue
            
            # Combine messages for analysis
            messages = []
            for conv in fan_conversations:
                if conv.get('message_received'):
                    messages.append(conv['message_received'])
            
            if len(messages) < 2:
                continue
            
            combined_text = " ".join(messages)
            
            # Personality classification data
            if profile.get('personality_type'):
                personality_data.append({
                    'text': combined_text,
                    'personality': profile['personality_type'],
                    'fan_id': fan_id,
                    'message_count': len(messages)
                })
            
            # Engagement classification data
            if profile.get('engagement_level'):
                engagement_data.append({
                    'text': combined_text,
                    'engagement': profile['engagement_level'],
                    'fan_id': fan_id,
                    'message_count': len(messages)
                })
        
        personality_df = pd.DataFrame(personality_data)
        engagement_df = pd.DataFrame(engagement_data)
        
        logger.info(f"Collected {len(personality_df)} personality samples and {len(engagement_df)} engagement samples")
        
        # Check minimum sample requirements
        if len(personality_df) < min_samples:
            logger.warning(f"Insufficient personality data: {len(personality_df)} < {min_samples}")
        
        if len(engagement_df) < min_samples:
            logger.warning(f"Insufficient engagement data: {len(engagement_df)} < {min_samples}")
        
        return personality_df, engagement_df
    
    def train_sklearn_models(self, personality_df: pd.DataFrame, engagement_df: pd.DataFrame) -> Dict:
        """
        Train scikit-learn models for personality and engagement classification
        """
        logger.info("Training scikit-learn models...")
        results = {}
        
        # Train personality classifier
        if len(personality_df) >= 50:
            logger.info("Training personality classifier...")
            
            X = personality_df['text']
            y = personality_df['personality']
            
            # Create pipeline with TF-IDF vectorization
            personality_pipeline = Pipeline([
                ('tfidf', TfidfVectorizer(max_features=1000, stop_words='english')),
                ('classifier', RandomForestClassifier(n_estimators=100, random_state=42))
            ])
            
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )
            
            # Train model
            personality_pipeline.fit(X_train, y_train)
            
            # Evaluate
            y_pred = personality_pipeline.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)
            
            results['personality'] = {
                'model': personality_pipeline,
                'accuracy': accuracy,
                'classification_report': classification_report(y_test, y_pred, output_dict=True),
                'test_size': len(X_test),
                'training_time': datetime.now().isoformat()
            }
            
            # Save model
            model_path = self.models_dir / "personality_sklearn_model.pkl"
            with open(model_path, 'wb') as f:
                pickle.dump(personality_pipeline, f)
            
            logger.info(f"Personality model trained with {accuracy:.2%} accuracy")
        
        # Train engagement classifier
        if len(engagement_df) >= 50:
            logger.info("Training engagement classifier...")
            
            X = engagement_df['text']
            y = engagement_df['engagement']
            
            # Create pipeline
            engagement_pipeline = Pipeline([
                ('tfidf', TfidfVectorizer(max_features=1000, stop_words='english')),
                ('classifier', RandomForestClassifier(n_estimators=100, random_state=42))
            ])
            
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )
            
            # Train model
            engagement_pipeline.fit(X_train, y_train)
            
            # Evaluate
            y_pred = engagement_pipeline.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)
            
            results['engagement'] = {
                'model': engagement_pipeline,
                'accuracy': accuracy,
                'classification_report': classification_report(y_test, y_pred, output_dict=True),
                'test_size': len(X_test),
                'training_time': datetime.now().isoformat()
            }
            
            # Save model
            model_path = self.models_dir / "engagement_sklearn_model.pkl"
            with open(model_path, 'wb') as f:
                pickle.dump(engagement_pipeline, f)
            
            logger.info(f"Engagement model trained with {accuracy:.2%} accuracy")
        
        return results
    
    def train_transformer_models(self, personality_df: pd.DataFrame, engagement_df: pd.DataFrame) -> Dict:
        """
        Train transformer models if transformers library is available
        """
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Transformers library not available, skipping transformer training")
            return {}
        
        logger.info("Training transformer models...")
        results = {}
        
        # Train personality transformer
        if len(personality_df) >= 100:
            try:
                results['personality_transformer'] = self._train_transformer_classifier(
                    personality_df, 'personality', 'personality_transformer'
                )
            except Exception as e:
                logger.error(f"Failed to train personality transformer: {e}")
        
        # Train engagement transformer
        if len(engagement_df) >= 100:
            try:
                results['engagement_transformer'] = self._train_transformer_classifier(
                    engagement_df, 'engagement', 'engagement_transformer'
                )
            except Exception as e:
                logger.error(f"Failed to train engagement transformer: {e}")
        
        return results
    
    def _train_transformer_classifier(self, df: pd.DataFrame, target_column: str, model_name: str) -> Dict:
        """
        Train a transformer-based classifier
        """
        logger.info(f"Training {model_name}...")
        
        # Prepare data
        texts = df['text'].tolist()
        labels = df[target_column].tolist()
        
        # Create label mapping
        unique_labels = list(set(labels))
        label_to_id = {label: idx for idx, label in enumerate(unique_labels)}
        id_to_label = {idx: label for label, idx in label_to_id.items()}
        
        # Convert labels to IDs
        label_ids = [label_to_id[label] for label in labels]
        
        # Split data
        train_texts, test_texts, train_labels, test_labels = train_test_split(
            texts, label_ids, test_size=0.2, random_state=42
        )
        
        # Use a lightweight model for training
        model_checkpoint = "distilbert-base-uncased"
        
        # Tokenize data
        tokenizer = AutoTokenizer.from_pretrained(model_checkpoint)
        
        def tokenize_function(examples):
            return tokenizer(examples, truncation=True, padding=True, max_length=128)
        
        train_encodings = tokenize_function(train_texts)
        test_encodings = tokenize_function(test_texts)
        
        # Create dataset class
        class CustomDataset:
            def __init__(self, encodings, labels):
                self.encodings = encodings
                self.labels = labels
            
            def __getitem__(self, idx):
                item = {key: torch.tensor(val[idx]) for key, val in self.encodings.items()}
                item['labels'] = torch.tensor(self.labels[idx])
                return item
            
            def __len__(self):
                return len(self.labels)
        
        train_dataset = CustomDataset(train_encodings, train_labels)
        test_dataset = CustomDataset(test_encodings, test_labels)
        
        # Load model
        model = AutoModelForSequenceClassification.from_pretrained(
            model_checkpoint, 
            num_labels=len(unique_labels)
        )
        
        # Training arguments
        training_args = TrainingArguments(
            output_dir=f'./models/{model_name}',
            num_train_epochs=3,
            per_device_train_batch_size=8,
            per_device_eval_batch_size=8,
            warmup_steps=500,
            weight_decay=0.01,
            logging_dir=f'./logs/{model_name}',
            save_strategy="epoch",
            evaluation_strategy="epoch",
            load_best_model_at_end=True,
        )
        
        # Create trainer
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=test_dataset,
        )
        
        # Train model
        trainer.train()
        
        # Evaluate
        eval_results = trainer.evaluate()
        
        # Save model and tokenizer
        model_dir = self.models_dir / model_name
        model_dir.mkdir(exist_ok=True)
        model.save_pretrained(model_dir)
        tokenizer.save_pretrained(model_dir)
        
        # Save label mapping
        with open(model_dir / "label_mapping.json", 'w') as f:
            json.dump({
                'label_to_id': label_to_id,
                'id_to_label': id_to_label
            }, f)
        
        return {
            'model_path': str(model_dir),
            'eval_loss': eval_results.get('eval_loss', 0),
            'accuracy': eval_results.get('eval_accuracy', 0),
            'training_time': datetime.now().isoformat(),
            'num_labels': len(unique_labels),
            'test_size': len(test_labels)
        }
    
    def run_full_training_pipeline(self, force_retrain: bool = False) -> Dict:
        """
        Run the complete training pipeline
        """
        logger.info("Starting full ML training pipeline...")
        
        # Check if we should retrain
        if not force_retrain and self._models_exist_and_recent():
            logger.info("Recent models found, skipping training. Use force_retrain=True to override.")
            return self._load_existing_model_info()
        
        # Collect training data
        personality_df, engagement_df = self.collect_training_data()
        
        if personality_df.empty and engagement_df.empty:
            logger.error("No training data available")
            return {"error": "No training data available"}
        
        results = {
            'training_started': datetime.now().isoformat(),
            'data_summary': {
                'personality_samples': len(personality_df),
                'engagement_samples': len(engagement_df)
            },
            'models_trained': {}
        }
        
        # Train scikit-learn models
        sklearn_results = self.train_sklearn_models(personality_df, engagement_df)
        results['models_trained'].update(sklearn_results)
        
        # Train transformer models if available
        if TRANSFORMERS_AVAILABLE:
            transformer_results = self.train_transformer_models(personality_df, engagement_df)
            results['models_trained'].update(transformer_results)
        
        # Save training metadata
        self._save_training_metadata(results)
        
        # Update performance metrics
        self.performance_metrics = results
        
        logger.info("Training pipeline completed successfully")
        return results
    
    def _models_exist_and_recent(self, max_age_days: int = 7) -> bool:
        """
        Check if trained models exist and are recent
        """
        model_files = [
            self.models_dir / "personality_sklearn_model.pkl",
            self.models_dir / "engagement_sklearn_model.pkl"
        ]
        
        for model_file in model_files:
            if not model_file.exists():
                return False
            
            # Check age
            file_age = datetime.now() - datetime.fromtimestamp(model_file.stat().st_mtime)
            if file_age > timedelta(days=max_age_days):
                return False
        
        return True
    
    def _load_existing_model_info(self) -> Dict:
        """
        Load information about existing models
        """
        metadata_file = self.models_dir / "training_metadata.json"
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                return json.load(f)
        
        return {"info": "Existing models found but no metadata available"}
    
    def _save_training_metadata(self, results: Dict):
        """
        Save training metadata to file
        """
        metadata_file = self.models_dir / "training_metadata.json"
        with open(metadata_file, 'w') as f:
            # Remove non-serializable objects
            serializable_results = self._make_serializable(results)
            json.dump(serializable_results, f, indent=2)
    
    def _make_serializable(self, obj):
        """
        Make object JSON serializable by removing non-serializable items
        """
        if isinstance(obj, dict):
            result = {}
            for key, value in obj.items():
                if key == 'model':  # Skip model objects
                    result[key] = f"<Model object at {id(value)}>"
                else:
                    result[key] = self._make_serializable(value)
            return result
        elif isinstance(obj, list):
            return [self._make_serializable(item) for item in obj]
        elif hasattr(obj, '__dict__'):
            return f"<{obj.__class__.__name__} object>"
        else:
            return obj
    
    def evaluate_model_performance(self, model_type: str = "all") -> Dict:
        """
        Evaluate performance of trained models on validation data
        """
        logger.info(f"Evaluating model performance for: {model_type}")
        
        # Collect fresh validation data
        personality_df, engagement_df = self.collect_training_data()
        
        results = {}
        
        if model_type in ["all", "personality"] and not personality_df.empty:
            results['personality'] = self._evaluate_personality_models(personality_df)
        
        if model_type in ["all", "engagement"] and not engagement_df.empty:
            results['engagement'] = self._evaluate_engagement_models(engagement_df)
        
        return results
    
    def _evaluate_personality_models(self, df: pd.DataFrame) -> Dict:
        """
        Evaluate personality classification models
        """
        results = {}
        
        # Evaluate scikit-learn model
        sklearn_model_path = self.models_dir / "personality_sklearn_model.pkl"
        if sklearn_model_path.exists():
            try:
                with open(sklearn_model_path, 'rb') as f:
                    model = pickle.load(f)
                
                X_test = df['text']
                y_test = df['personality']
                
                predictions = model.predict(X_test)
                accuracy = accuracy_score(y_test, predictions)
                
                results['sklearn'] = {
                    'accuracy': accuracy,
                    'classification_report': classification_report(y_test, predictions, output_dict=True),
                    'evaluation_time': datetime.now().isoformat()
                }
            except Exception as e:
                logger.error(f"Failed to evaluate sklearn personality model: {e}")
        
        return results
    
    def _evaluate_engagement_models(self, df: pd.DataFrame) -> Dict:
        """
        Evaluate engagement classification models
        """
        results = {}
        
        # Evaluate scikit-learn model
        sklearn_model_path = self.models_dir / "engagement_sklearn_model.pkl"
        if sklearn_model_path.exists():
            try:
                with open(sklearn_model_path, 'rb') as f:
                    model = pickle.load(f)
                
                X_test = df['text']
                y_test = df['engagement']
                
                predictions = model.predict(X_test)
                accuracy = accuracy_score(y_test, predictions)
                
                results['sklearn'] = {
                    'accuracy': accuracy,
                    'classification_report': classification_report(y_test, predictions, output_dict=True),
                    'evaluation_time': datetime.now().isoformat()
                }
            except Exception as e:
                logger.error(f"Failed to evaluate sklearn engagement model: {e}")
        
        return results
    
    def update_model_with_feedback(self, feedback_data: List[Dict]):
        """
        Update models with user feedback for continuous learning
        """
        logger.info(f"Updating models with {len(feedback_data)} feedback samples")
        
        # Store feedback for future retraining
        feedback_file = self.models_dir / "feedback_data.jsonl"
        
        with open(feedback_file, 'a') as f:
            for feedback in feedback_data:
                f.write(json.dumps(feedback) + '\n')
        
        # Check if we have enough feedback to trigger retraining
        feedback_count = self._count_feedback_samples()
        
        if feedback_count >= 50:  # Retrain after 50 new feedback samples
            logger.info(f"Triggering retraining with {feedback_count} feedback samples")
            return self.run_full_training_pipeline(force_retrain=True)
        
        return {"feedback_stored": len(feedback_data), "total_feedback": feedback_count}
    
    def _count_feedback_samples(self) -> int:
        """
        Count total feedback samples
        """
        feedback_file = self.models_dir / "feedback_data.jsonl"
        if not feedback_file.exists():
            return 0
        
        with open(feedback_file, 'r') as f:
            return sum(1 for line in f)
    
    def get_training_status(self) -> Dict:
        """
        Get current training status and model information
        """
        status = {
            'models_directory': str(self.models_dir),
            'models_available': {},
            'last_training': None,
            'feedback_samples': self._count_feedback_samples(),
            'transformers_available': TRANSFORMERS_AVAILABLE
        }
        
        # Check available models
        model_files = {
            'personality_sklearn': self.models_dir / "personality_sklearn_model.pkl",
            'engagement_sklearn': self.models_dir / "engagement_sklearn_model.pkl",
            'personality_transformer': self.models_dir / "personality_transformer",
            'engagement_transformer': self.models_dir / "engagement_transformer"
        }
        
        for model_name, model_path in model_files.items():
            if model_path.exists():
                if model_path.is_file():
                    mod_time = datetime.fromtimestamp(model_path.stat().st_mtime)
                else:
                    mod_time = datetime.fromtimestamp(model_path.stat().st_mtime)
                
                status['models_available'][model_name] = {
                    'path': str(model_path),
                    'last_modified': mod_time.isoformat(),
                    'size': model_path.stat().st_size if model_path.is_file() else 'directory'
                }
        
        # Load training metadata
        metadata_file = self.models_dir / "training_metadata.json"
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
                status['last_training'] = metadata.get('training_started')
                status['training_metadata'] = metadata
        
        return status

# Global training pipeline instance
training_pipeline = MLTrainingPipeline()