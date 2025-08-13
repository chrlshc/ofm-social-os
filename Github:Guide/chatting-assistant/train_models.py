#!/usr/bin/env python3
"""
Command-line interface for ML model training
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from colorama import init, Fore, Style

from ml_training_pipeline import training_pipeline
from config_manager import config

init(autoreset=True)

def setup_logging(verbose: bool = False):
    """Setup logging configuration"""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(f'training_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        ]
    )

def train_command(args):
    """Handle train command"""
    print(f"{Fore.CYAN}🚀 Starting ML Training Pipeline{Style.RESET_ALL}")
    print(f"Force retrain: {args.force}")
    print(f"Model types: {args.models}")
    
    try:
        results = training_pipeline.run_full_training_pipeline(force_retrain=args.force)
        
        if "error" in results:
            print(f"{Fore.RED}❌ Training failed: {results['error']}{Style.RESET_ALL}")
            return
        
        print(f"\n{Fore.GREEN}✅ Training completed successfully!{Style.RESET_ALL}")
        
        # Display results
        if args.output == "json":
            print(json.dumps(results, indent=2))
        else:
            print(f"\n{Fore.YELLOW}📊 Training Results:{Style.RESET_ALL}")
            print(f"Training started: {results['training_started']}")
            
            data_summary = results.get('data_summary', {})
            print(f"Personality samples: {data_summary.get('personality_samples', 0)}")
            print(f"Engagement samples: {data_summary.get('engagement_samples', 0)}")
            
            models_trained = results.get('models_trained', {})
            print(f"\n{Fore.CYAN}🤖 Models Trained:{Style.RESET_ALL}")
            for model_name, model_info in models_trained.items():
                if isinstance(model_info, dict) and 'accuracy' in model_info:
                    accuracy = model_info['accuracy']
                    print(f"  {model_name}: {accuracy:.2%} accuracy")
                else:
                    print(f"  {model_name}: Training completed")
    
    except Exception as e:
        print(f"{Fore.RED}❌ Training failed with error: {e}{Style.RESET_ALL}")
        if args.verbose:
            import traceback
            traceback.print_exc()

def status_command(args):
    """Handle status command"""
    print(f"{Fore.CYAN}📊 ML Training Status{Style.RESET_ALL}")
    
    try:
        status = training_pipeline.get_training_status()
        
        if args.output == "json":
            print(json.dumps(status, indent=2))
        else:
            print(f"\nModels directory: {status['models_directory']}")
            print(f"Transformers available: {status['transformers_available']}")
            print(f"Feedback samples: {status['feedback_samples']}")
            
            if status['last_training']:
                print(f"Last training: {status['last_training']}")
            else:
                print("No previous training found")
            
            print(f"\n{Fore.GREEN}Available Models:{Style.RESET_ALL}")
            models = status.get('models_available', {})
            if models:
                for model_name, model_info in models.items():
                    print(f"  ✅ {model_name}")
                    print(f"     Last modified: {model_info['last_modified']}")
                    print(f"     Size: {model_info['size']}")
            else:
                print("  No trained models found")
    
    except Exception as e:
        print(f"{Fore.RED}❌ Failed to get status: {e}{Style.RESET_ALL}")

def evaluate_command(args):
    """Handle evaluate command"""
    print(f"{Fore.CYAN}🔍 Evaluating Model Performance{Style.RESET_ALL}")
    
    try:
        results = training_pipeline.evaluate_model_performance(model_type=args.model_type)
        
        if args.output == "json":
            print(json.dumps(results, indent=2))
        else:
            print(f"\n{Fore.YELLOW}📈 Evaluation Results:{Style.RESET_ALL}")
            
            for model_category, model_results in results.items():
                print(f"\n{model_category.upper()} Models:")
                for model_name, metrics in model_results.items():
                    if 'accuracy' in metrics:
                        accuracy = metrics['accuracy']
                        print(f"  {model_name}: {accuracy:.2%} accuracy")
                    else:
                        print(f"  {model_name}: Evaluation completed")
    
    except Exception as e:
        print(f"{Fore.RED}❌ Evaluation failed: {e}{Style.RESET_ALL}")

def feedback_command(args):
    """Handle feedback command"""
    print(f"{Fore.CYAN}📝 Processing Model Feedback{Style.RESET_ALL}")
    
    try:
        # Load feedback data from file
        with open(args.feedback_file, 'r') as f:
            feedback_data = json.load(f)
        
        if not isinstance(feedback_data, list):
            feedback_data = [feedback_data]
        
        results = training_pipeline.update_model_with_feedback(feedback_data)
        
        print(f"{Fore.GREEN}✅ Feedback processed successfully{Style.RESET_ALL}")
        
        if args.output == "json":
            print(json.dumps(results, indent=2))
        else:
            print(f"Feedback samples processed: {results.get('feedback_stored', 0)}")
            print(f"Total feedback samples: {results.get('total_feedback', 0)}")
            
            if 'training_started' in results:
                print(f"{Fore.YELLOW}🔄 Automatic retraining triggered!{Style.RESET_ALL}")
    
    except FileNotFoundError:
        print(f"{Fore.RED}❌ Feedback file not found: {args.feedback_file}{Style.RESET_ALL}")
    except json.JSONDecodeError:
        print(f"{Fore.RED}❌ Invalid JSON in feedback file{Style.RESET_ALL}")
    except Exception as e:
        print(f"{Fore.RED}❌ Failed to process feedback: {e}{Style.RESET_ALL}")

def main():
    parser = argparse.ArgumentParser(description="ML Training Pipeline for OnlyFans Chatting Assistant")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    parser.add_argument("--output", choices=["text", "json"], default="text", help="Output format")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Train command
    train_parser = subparsers.add_parser("train", help="Train ML models")
    train_parser.add_argument("--force", action="store_true", help="Force retrain even if recent models exist")
    train_parser.add_argument("--models", choices=["all", "sklearn", "transformers"], default="all",
                             help="Which models to train")
    
    # Status command
    status_parser = subparsers.add_parser("status", help="Show training status")
    
    # Evaluate command
    eval_parser = subparsers.add_parser("evaluate", help="Evaluate model performance")
    eval_parser.add_argument("--model-type", choices=["all", "personality", "engagement"], 
                            default="all", help="Which models to evaluate")
    
    # Feedback command
    feedback_parser = subparsers.add_parser("feedback", help="Process model feedback")
    feedback_parser.add_argument("feedback_file", help="JSON file containing feedback data")
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.verbose)
    
    if not args.command:
        parser.print_help()
        return
    
    print(f"{Fore.MAGENTA}=== OnlyFans AI Chatbot - ML Training Pipeline ==={Style.RESET_ALL}")
    print(f"Configuration: {config.get_config_source()}")
    print(f"Database connected: {config.get('database', 'enabled', default=False)}")
    print()
    
    # Execute command
    if args.command == "train":
        train_command(args)
    elif args.command == "status":
        status_command(args)
    elif args.command == "evaluate":
        evaluate_command(args)
    elif args.command == "feedback":
        feedback_command(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()