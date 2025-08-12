#!/usr/bin/env python3
import json
import sys
from datetime import datetime
from typing import List, Dict, Optional
import argparse
from colorama import init, Fore, Style
import os

from fan_analyzer import FanAnalyzer
from message_generator import MessageGenerator

init(autoreset=True)

class OnlyFansChatBot:
    def __init__(self, account_size: str = "small"):
        self.analyzer = FanAnalyzer()
        self.generator = MessageGenerator()
        self.account_size = account_size
        self.conversations = {}
    
    def process_fan_messages(self, fan_id: str, messages: List[str]) -> Dict:
        """
        Process fan messages and generate appropriate response
        """
        print(f"\n{Fore.CYAN}Analyzing fan {fan_id}...{Style.RESET_ALL}")
        
        fan_profile = self.analyzer.analyze_personality_type(messages)
        phase = self.analyzer.analyze_conversation_phase(messages)
        interests = self.analyzer.extract_interests(messages)
        spending_potential = self.analyzer.calculate_spending_potential(messages)
        
        print(f"{Fore.GREEN}Fan Profile:{Style.RESET_ALL}")
        print(f"  Type: {fan_profile['type']} (confidence: {fan_profile['confidence']:.2f})")
        print(f"  Sentiment: {fan_profile['sentiment']['mood']}")
        print(f"  Engagement: {fan_profile['engagement_level']}")
        print(f"  Phase: {phase.upper()}")
        print(f"  Spending Potential: {spending_potential['potential']}")
        
        context = {
            "topic": interests[0] if interests else "our chats",
            "offer_link": "my exclusive content",
            "rank": "top 10%"
        }
        
        response = self.generator.generate_message(
            fan_profile=fan_profile,
            phase=phase,
            context=context,
            account_size=self.account_size
        )
        
        self.conversations[fan_id] = {
            "profile": fan_profile,
            "phase": phase,
            "interests": interests,
            "spending_potential": spending_potential,
            "last_interaction": datetime.now().isoformat()
        }
        
        return {
            "fan_id": fan_id,
            "suggested_response": response,
            "profile": fan_profile,
            "phase": phase,
            "spending_potential": spending_potential
        }
    
    def generate_mass_message(self, fan_type: str = "all") -> str:
        """
        Generate mass message for broadcast
        """
        if fan_type == "emotional":
            return "Hey loves! 💕 I've been working on something special that I think you'll really connect with... Check your DMs for a personal surprise! 🌹"
        elif fan_type == "conqueror":
            return "🔥 ATTENTION VIPs: Exclusive competition starting NOW! First 10 to respond get elite access. Don't let others beat you! 👑"
        else:
            return "Special announcement! 🎉 New content dropping tonight - personalized surprises for everyone who messages me in the next hour! 💖🏆"
    
    def handle_special_scenarios(self, scenario: str, fan_profile: Dict) -> str:
        """
        Handle special messaging scenarios
        """
        if scenario == "birthday":
            return self.generator.generate_tip_request(fan_profile, "birthday")
        elif scenario == "new_content":
            return self.generator.create_ppv_message(fan_profile, "video", 29.99)
        elif scenario == "re_engagement":
            return self.generator.generate_re_engagement_message(fan_profile, 14)
        elif scenario == "upsell":
            sequence = self.generator.generate_upsell_sequence(fan_profile, 50.0)
            return sequence[0]
        else:
            return "Message not available for this scenario"
    
    def save_conversation_data(self, filename: str = "conversations.json"):
        """
        Save conversation data for future reference
        """
        with open(filename, 'w') as f:
            json.dump(self.conversations, f, indent=2)
        print(f"{Fore.GREEN}Conversation data saved to {filename}{Style.RESET_ALL}")
    
    def load_conversation_data(self, filename: str = "conversations.json"):
        """
        Load previous conversation data
        """
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                self.conversations = json.load(f)
            print(f"{Fore.GREEN}Loaded {len(self.conversations)} conversations{Style.RESET_ALL}")

def interactive_mode():
    """
    Interactive mode for testing the chatbot
    """
    bot = OnlyFansChatBot(account_size="small")
    
    print(f"\n{Fore.MAGENTA}=== OnlyFans AI Chatbot ==={Style.RESET_ALL}")
    print("Enter 'quit' to exit, 'analyze' to process messages, or 'scenario' for special messages\n")
    
    while True:
        command = input(f"{Fore.YELLOW}Command: {Style.RESET_ALL}").strip().lower()
        
        if command == "quit":
            break
        
        elif command == "analyze":
            fan_id = input("Fan ID: ").strip()
            print("Enter messages (one per line, empty line to finish):")
            messages = []
            while True:
                msg = input()
                if not msg:
                    break
                messages.append(msg)
            
            if messages:
                result = bot.process_fan_messages(fan_id, messages)
                print(f"\n{Fore.CYAN}Suggested Response:{Style.RESET_ALL}")
                print(f"{result['suggested_response']}\n")
        
        elif command == "scenario":
            print("\nAvailable scenarios:")
            print("1. birthday - Birthday tip request")
            print("2. new_content - New PPV content")
            print("3. re_engagement - Win back inactive fan")
            print("4. upsell - Upsell to existing fan")
            print("5. mass - Mass broadcast message")
            
            scenario = input("\nSelect scenario: ").strip()
            
            if scenario == "mass":
                fan_type = input("Fan type (all/emotional/conqueror): ").strip()
                message = bot.generate_mass_message(fan_type)
                print(f"\n{Fore.CYAN}Mass Message:{Style.RESET_ALL}")
                print(f"{message}\n")
            else:
                fan_type = input("Fan type (Emotional/Conqueror): ").strip()
                profile = {"type": fan_type}
                message = bot.handle_special_scenarios(scenario, profile)
                print(f"\n{Fore.CYAN}Scenario Message:{Style.RESET_ALL}")
                print(f"{message}\n")
        
        elif command == "save":
            bot.save_conversation_data()
        
        elif command == "load":
            bot.load_conversation_data()
        
        else:
            print(f"{Fore.RED}Unknown command. Try 'analyze', 'scenario', 'save', 'load', or 'quit'{Style.RESET_ALL}")

def batch_mode(input_file: str):
    """
    Process multiple fans from a JSON file
    """
    bot = OnlyFansChatBot(account_size="large")
    
    with open(input_file, 'r') as f:
        fan_data = json.load(f)
    
    results = []
    for fan in fan_data:
        result = bot.process_fan_messages(fan['id'], fan['messages'])
        results.append(result)
    
    output_file = "batch_results.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n{Fore.GREEN}Processed {len(results)} fans. Results saved to {output_file}{Style.RESET_ALL}")

def main():
    parser = argparse.ArgumentParser(description="OnlyFans AI Chatbot")
    parser.add_argument("--mode", choices=["interactive", "batch"], default="interactive",
                       help="Run mode: interactive or batch")
    parser.add_argument("--input", help="Input file for batch mode")
    parser.add_argument("--account-size", choices=["small", "large"], default="small",
                       help="Account size affects messaging strategy")
    
    args = parser.parse_args()
    
    if args.mode == "batch":
        if not args.input:
            print(f"{Fore.RED}Error: --input file required for batch mode{Style.RESET_ALL}")
            sys.exit(1)
        batch_mode(args.input)
    else:
        interactive_mode()

if __name__ == "__main__":
    main()