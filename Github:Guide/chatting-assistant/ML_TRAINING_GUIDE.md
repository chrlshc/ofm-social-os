# ML Training Pipeline Guide

## 🧠 **Machine Learning Training System**

The OnlyFans Chatting Assistant includes a comprehensive ML training pipeline that learns from fan interactions to improve personality classification and engagement prediction accuracy.

## 🚀 **Quick Start**

### **Command Line Training**

```bash
# Check training status
python train_models.py status

# Train models with existing data
python train_models.py train

# Force retrain even with recent models
python train_models.py train --force

# Evaluate model performance
python train_models.py evaluate

# Process feedback data
python train_models.py feedback feedback_samples.json
```

### **API Training Endpoints**

```bash
# Get training status
GET /ml/training/status

# Start training
POST /ml/training/start
{
    "force_retrain": false
}

# Evaluate models
POST /ml/training/evaluate
{
    "model_type": "all"  # or "personality" or "engagement"
}

# Provide model feedback
POST /ml/feedback
{
    "fan_id": "fan123",
    "messages": ["Hey beautiful", "Love your content"],
    "true_personality": "Emotional",
    "true_engagement": "high"
}
```

## 📊 **Training Data Requirements**

### **Minimum Data Requirements**

- **Personality Classification**: 50+ fan profiles with labeled personality types
- **Engagement Classification**: 50+ fan profiles with engagement levels
- **Transformer Models**: 100+ samples for optimal performance

### **Data Collection**

The system automatically collects training data from:
- Fan profiles stored in the database
- Conversation history with personality labels
- Manual corrections and feedback
- Engagement level classifications

### **Data Quality**

Training data includes:
- Combined message text from fan conversations
- Verified personality type labels (Emotional/Conqueror)
- Engagement level labels (low/medium/high)
- Message count and interaction patterns

## 🤖 **Model Types**

### **1. Scikit-Learn Models**

**Personality Classifier:**
- Pipeline: TF-IDF Vectorization + Random Forest
- Features: 1000 TF-IDF features from message text
- Target: Binary classification (Emotional vs Conqueror)

**Engagement Classifier:**
- Pipeline: TF-IDF Vectorization + Random Forest  
- Features: 1000 TF-IDF features from message text
- Target: Multi-class classification (low/medium/high)

### **2. Transformer Models** (Optional)

**Requirements:**
```bash
pip install transformers torch sentencepiece
```

**Models:**
- Base: DistilBERT for lightweight training
- Custom fine-tuning for OnlyFans conversation patterns
- Automatic label mapping and tokenization

## 📈 **Training Process**

### **1. Data Collection Phase**

```python
# Collect training data from database
personality_df, engagement_df = training_pipeline.collect_training_data()

# Data includes:
# - fan_id: Unique identifier  
# - text: Combined message text
# - personality: Emotional/Conqueror
# - engagement: low/medium/high
# - message_count: Number of messages
```

### **2. Model Training Phase**

```python
# Train scikit-learn models
sklearn_results = training_pipeline.train_sklearn_models(personality_df, engagement_df)

# Train transformer models (if available)
transformer_results = training_pipeline.train_transformer_models(personality_df, engagement_df)
```

### **3. Evaluation Phase**

```python
# Evaluate on test data
results = training_pipeline.evaluate_model_performance()

# Metrics include:
# - Accuracy scores
# - Classification reports  
# - Confusion matrices
# - Training timestamps
```

## 🔄 **Continuous Learning**

### **Feedback Loop**

```python
# Collect feedback from user corrections
feedback_data = [
    {
        "fan_id": "fan123",
        "messages": ["Hey beautiful", "Love your content"],
        "predicted_personality": "Conqueror",
        "true_personality": "Emotional",
        "predicted_engagement": "medium", 
        "true_engagement": "high"
    }
]

# Update models with feedback
training_pipeline.update_model_with_feedback(feedback_data)
```

### **Automatic Retraining**

- Triggers after 50+ new feedback samples
- Incorporates all historical data + feedback
- Maintains model versioning and rollback capability

## 📁 **Model Storage Structure**

```
models/
├── personality_sklearn_model.pkl          # Scikit-learn personality model
├── engagement_sklearn_model.pkl           # Scikit-learn engagement model
├── personality_transformer/               # Transformer personality model
│   ├── config.json
│   ├── pytorch_model.bin
│   ├── tokenizer.json
│   └── label_mapping.json
├── engagement_transformer/                # Transformer engagement model
│   └── [similar structure]
├── training_metadata.json                 # Training history and metrics
└── feedback_data.jsonl                   # Feedback samples for retraining
```

## ⚙️ **Configuration**

### **Environment Variables**

```bash
# Enable ML classification
CHATTING_USE_ML=true

# Model paths
CHATTING_ML_MODEL_PATH=cardiffnlp/twitter-roberta-base-sentiment-latest

# Training settings
CHATTING_ML_MIN_CONFIDENCE=0.6
CHATTING_ML_RETRAIN_THRESHOLD=50
CHATTING_ML_MODEL_MAX_AGE_DAYS=7
```

### **Config.json Settings**

```json
{
  "ml": {
    "enabled": true,
    "use_transformers": true,
    "min_confidence": 0.6,
    "retrain_threshold": 50,
    "model_max_age_days": 7
  }
}
```

## 📊 **Performance Monitoring**

### **Training Metrics**

```python
# Get comprehensive training status
status = training_pipeline.get_training_status()

# Includes:
# - Available models and timestamps
# - Feedback sample counts
# - Last training results
# - Model file sizes and paths
```

### **Model Performance**

```python
# Evaluate current model performance
results = training_pipeline.evaluate_model_performance()

# Performance metrics:
# - Accuracy: Overall classification accuracy
# - Precision/Recall: Per-class performance
# - F1-Score: Balanced performance measure
# - Confusion Matrix: Detailed error analysis
```

## 🛠️ **Advanced Usage**

### **Custom Model Training**

```python
from ml_training_pipeline import MLTrainingPipeline

# Create custom pipeline
pipeline = MLTrainingPipeline()

# Train specific model types
sklearn_results = pipeline.train_sklearn_models(personality_df, engagement_df)
transformer_results = pipeline.train_transformer_models(personality_df, engagement_df)

# Custom evaluation
performance = pipeline.evaluate_model_performance(model_type="personality")
```

### **Batch Feedback Processing**

```python
# Process large feedback batches
feedback_file = "large_feedback_batch.json"
with open(feedback_file, 'r') as f:
    feedback_data = json.load(f)

results = training_pipeline.update_model_with_feedback(feedback_data)
```

## 🚨 **Troubleshooting**

### **Common Issues**

**1. Insufficient Training Data**
```bash
# Error: "Insufficient personality data: 25 < 50"
# Solution: Collect more fan interaction data before training
```

**2. Model Training Failures**
```bash
# Check logs for specific errors
tail -f training_YYYYMMDD_HHMMSS.log

# Common causes:
# - Memory limitations for transformer models
# - Corrupted training data
# - Missing dependencies
```

**3. Low Model Accuracy**
```bash
# Evaluate current performance
python train_models.py evaluate

# Solutions:
# - Collect more training data
# - Improve data quality and labeling
# - Adjust model hyperparameters
```

### **Performance Optimization**

**Memory Management:**
- Use smaller batch sizes for transformer training
- Enable gradient checkpointing for large models
- Monitor system memory during training

**Training Speed:**
- Use GPU acceleration if available
- Reduce max_features for TF-IDF vectorization
- Consider lighter transformer models

## 📋 **Best Practices**

### **Data Quality**

1. **Consistent Labeling**: Ensure personality types and engagement levels are consistently labeled
2. **Diverse Samples**: Include varied message patterns and interaction styles
3. **Regular Updates**: Retrain models regularly with new data
4. **Feedback Integration**: Actively collect and process user corrections

### **Model Management**

1. **Version Control**: Maintain model versioning for rollback capability
2. **Performance Monitoring**: Regularly evaluate model performance
3. **Automated Retraining**: Set up automatic retraining triggers
4. **Backup Strategy**: Backup trained models and training data

### **Production Deployment**

1. **Gradual Rollout**: Test new models with subset of users first
2. **Monitoring**: Monitor model predictions and accuracy in production
3. **Fallback Strategy**: Maintain fallback to previous model versions
4. **Performance Metrics**: Track key metrics like accuracy and response time

## 🎯 **Expected Performance**

### **Baseline Performance**

- **Scikit-Learn Models**: 75-85% accuracy with 100+ training samples
- **Transformer Models**: 85-95% accuracy with 500+ training samples
- **Training Time**: 1-5 minutes for sklearn, 10-30 minutes for transformers

### **Production Metrics**

- **Personality Classification**: Target 85%+ accuracy
- **Engagement Classification**: Target 80%+ accuracy
- **Inference Time**: <500ms for full analysis pipeline
- **Model Size**: <100MB for sklearn, <500MB for transformers

## 🔮 **Future Enhancements**

### **Planned Features**

1. **Multi-language Models**: Support for French and other languages
2. **Advanced Architectures**: BERT, RoBERTa, and custom OnlyFans models
3. **Real-time Learning**: Online learning with immediate feedback integration
4. **Ensemble Methods**: Combine multiple models for improved accuracy
5. **Federated Learning**: Distributed training across multiple creators