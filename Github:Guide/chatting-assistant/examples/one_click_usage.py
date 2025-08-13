#!/usr/bin/env python3
"""
Example usage of the one-click sending system
Demonstrates how to integrate with the OnlyFans compliance workflow
"""

import json
import time
from datetime import datetime

# Import the system modules
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from one_click_sender import one_click_sender
from message_generator import MessageGenerator
from fan_analyzer import FanAnalyzer

def demonstrate_one_click_workflow():
    """
    Complete demonstration of the one-click sending workflow
    """
    print("🚀 Démonstration du système d'envoi en un clic")
    print("=" * 50)
    
    # Step 1: Analyze fan and generate message
    print("\n1. Analyse du fan et génération du message...")
    
    fan_id = "fan_demo_001"
    fan_messages = [
        "Hey beautiful, I really love your content",
        "You make me feel so special",
        "Can't wait to see more of you"
    ]
    
    # Analyze fan personality
    analyzer = FanAnalyzer()
    fan_profile = analyzer.analyze_personality_type(fan_messages)
    phase = analyzer.analyze_conversation_phase(fan_messages)
    
    print(f"   Fan ID: {fan_id}")
    print(f"   Personality: {fan_profile['type']} (confiance: {fan_profile['confidence']:.2f})")
    print(f"   Phase: {phase}")
    
    # Generate message
    generator = MessageGenerator()
    context = {"topic": "our chats", "offer_link": "exclusive photos"}
    
    message_result = generator.generate_message(
        fan_profile=fan_profile,
        phase=phase,
        context=context,
        account_size="small",
        fan_id=fan_id,
        messages=fan_messages
    )
    
    suggested_message = message_result["message"]
    print(f"   Message généré: {suggested_message[:50]}...")
    
    # Step 2: Prepare for manual sending
    print("\n2. Préparation pour l'envoi manuel...")
    
    prepare_result = one_click_sender.prepare_manual_send(
        fan_id=fan_id,
        message=suggested_message
    )
    
    if "error" in prepare_result:
        print(f"   ❌ Erreur: {prepare_result['error']}")
        return
    
    audit_id = prepare_result["audit_id"]
    print(f"   ✅ Préparé avec ID d'audit: {audit_id}")
    print(f"   URL OnlyFans: {prepare_result['onlyfans_url']}")
    print(f"   Presse-papiers disponible: {prepare_result['clipboard_available']}")
    
    # Step 3: Execute one-click send
    print("\n3. Exécution de l'envoi en un clic...")
    
    send_result = one_click_sender.execute_one_click_send(
        audit_id=audit_id,
        open_browser=False  # Don't actually open browser in demo
    )
    
    if "error" in send_result:
        print(f"   ❌ Erreur: {send_result['error']}")
        return
    
    print(f"   ✅ Message copié: {send_result['clipboard_copied']}")
    print(f"   ✅ Navigateur ouvert: {send_result['browser_opened']}")
    print(f"   📝 Prochaine étape: {send_result['next_step']}")
    
    # Step 4: Check send status
    print("\n4. Vérification du statut d'envoi...")
    
    status_result = one_click_sender.get_send_status(audit_id)
    print(f"   Statut actuel: {status_result.get('status', 'unknown')}")
    
    # Step 5: Simulate user confirmation (in real usage, this happens after manual send)
    print("\n5. Simulation de la confirmation d'envoi...")
    print("   (En usage réel, ceci arrive après l'envoi manuel dans OnlyFans)")
    
    # Wait a moment to simulate user action
    time.sleep(1)
    
    confirm_result = one_click_sender.mark_message_sent(
        audit_id=audit_id,
        sent_by_user=True
    )
    
    if "error" in confirm_result:
        print(f"   ❌ Erreur: {confirm_result['error']}")
        return
    
    print(f"   ✅ Message marqué comme envoyé à: {confirm_result['sent_at']}")
    print(f"   ✅ Conformité maintenue: {confirm_result['compliance_maintained']}")
    
    # Step 6: Generate sending report
    print("\n6. Génération du rapport d'envoi...")
    
    report = one_click_sender.generate_send_report(fan_id=fan_id, days=1)
    print(f"   Total préparés: {report.get('total_prepared', 0)}")
    print(f"   Total envoyés: {report.get('total_sent', 0)}")
    print(f"   Taux de conformité: {report.get('compliance_rate', 0):.1f}%")
    
    print(f"\n✅ Démonstration terminée avec succès!")
    print("   Le message a été traité en respectant la conformité OnlyFans.")

def demonstrate_api_integration():
    """
    Demonstrate API integration for frontend applications
    """
    print("\n🌐 Exemple d'intégration API")
    print("=" * 30)
    
    # This would be the API calls from a frontend application
    api_examples = {
        "prepare_send": {
            "method": "POST",
            "url": "/send/prepare",
            "body": {
                "fan_id": "fan_123",
                "message": "Hey love! 💕 I've been thinking about you...",
                "audit_id": None
            }
        },
        "execute_send": {
            "method": "POST", 
            "url": "/send/execute",
            "body": {
                "audit_id": "audit_fan_123_20240101_120000",
                "open_browser": True
            }
        },
        "confirm_sent": {
            "method": "POST",
            "url": "/send/confirm/audit_fan_123_20240101_120000",
            "body": {}
        },
        "get_status": {
            "method": "GET",
            "url": "/send/status/audit_fan_123_20240101_120000"
        },
        "get_report": {
            "method": "GET",
            "url": "/send/report?fan_id=fan_123&days=7"
        }
    }
    
    for name, example in api_examples.items():
        print(f"\n{name.upper()}:")
        print(f"   {example['method']} {example['url']}")
        if 'body' in example and example['body']:
            print(f"   Body: {json.dumps(example['body'], indent=6)}")

def demonstrate_cli_integration():
    """
    Demonstrate CLI integration with clipboard copying
    """
    print("\n💻 Exemple d'utilisation CLI")
    print("=" * 30)
    
    cli_examples = [
        {
            "description": "Génération de message avec copie automatique",
            "command": 'python main.py generate --profile \'{"type": "Emotional"}\' --phase "attraction" --copy --fan-id "fan_123"'
        },
        {
            "description": "Analyse de fan avec messages",
            "command": 'python main.py analyze --fan-id "fan_123" --messages \'["Hey beautiful", "Love your content"]\''
        },
        {
            "description": "Traitement par lots avec copie",
            "command": "python main.py batch --input fans_batch.json --copy"
        }
    ]
    
    for example in cli_examples:
        print(f"\n📝 {example['description']}:")
        print(f"   {example['command']}")

if __name__ == "__main__":
    try:
        # Run the complete demonstration
        demonstrate_one_click_workflow()
        demonstrate_api_integration()
        demonstrate_cli_integration()
        
        print(f"\n🎉 Démonstration complète terminée!")
        print("   Consultez ML_TRAINING_GUIDE.md pour la documentation complète.")
        
    except Exception as e:
        print(f"\n❌ Erreur pendant la démonstration: {e}")
        import traceback
        traceback.print_exc()