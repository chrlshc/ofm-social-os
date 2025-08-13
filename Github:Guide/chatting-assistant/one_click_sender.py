#!/usr/bin/env python3
"""
One-click manual sending system with clipboard integration
Maintains OnlyFans compliance while simplifying the sending process
"""

import json
import webbrowser
from typing import Dict, Optional
import logging
from datetime import datetime

# Clipboard support
try:
    import pyperclip
    CLIPBOARD_AVAILABLE = True
except ImportError:
    CLIPBOARD_AVAILABLE = False

from database import db
from config_manager import config

logger = logging.getLogger(__name__)

class OneClickSender:
    """
    Handles one-click manual sending while maintaining compliance.
    Copies message to clipboard and opens OnlyFans for manual sending.
    """
    
    def __init__(self):
        self.onlyfans_base_url = "https://onlyfans.com"
        self.audit_records = {}
    
    def prepare_manual_send(self, fan_id: str, message: str, audit_id: Optional[str] = None) -> Dict:
        """
        Prepare message for one-click manual sending
        
        Returns preparation data including audit ID and send instructions
        """
        try:
            # Create audit record if not provided
            if not audit_id:
                audit_data = {
                    'fan_id': fan_id,
                    'message': message,
                    'prepared_at': datetime.now().isoformat(),
                    'compliance_status': 'ready_for_manual_send',
                    'manual_send_required': True
                }
                
                # Save audit record to database
                success = db.save_compliance_audit(
                    fan_id=fan_id,
                    compliance_check=audit_data,
                    manual_send_required=True
                )
                
                if success:
                    # Get the audit_id from the database
                    audit_id = self._get_latest_audit_id(fan_id)
                else:
                    logger.error(f"Failed to save audit record for fan {fan_id}")
                    return {"error": "Failed to prepare message for sending"}
            
            # Store in memory for quick access
            self.audit_records[audit_id] = {
                'fan_id': fan_id,
                'message': message,
                'prepared_at': datetime.now().isoformat(),
                'status': 'prepared'
            }
            
            # Prepare OnlyFans URL
            onlyfans_url = self._build_onlyfans_url(fan_id)
            
            return {
                'audit_id': audit_id,
                'fan_id': fan_id,
                'message': message,
                'onlyfans_url': onlyfans_url,
                'clipboard_available': CLIPBOARD_AVAILABLE,
                'instructions': self._get_send_instructions(),
                'ready_for_send': True
            }
            
        except Exception as e:
            logger.error(f"Failed to prepare manual send for fan {fan_id}: {e}")
            return {"error": str(e)}
    
    def execute_one_click_send(self, audit_id: str, open_browser: bool = True) -> Dict:
        """
        Execute one-click send: copy to clipboard and open OnlyFans
        
        This maintains compliance by requiring manual paste and send in OnlyFans
        """
        try:
            # Get audit record
            if audit_id not in self.audit_records:
                # Try to load from database
                audit_record = self._load_audit_from_db(audit_id)
                if not audit_record:
                    return {"error": f"Audit record {audit_id} not found"}
            else:
                audit_record = self.audit_records[audit_id]
            
            fan_id = audit_record['fan_id']
            message = audit_record['message']
            
            # Copy message to clipboard
            clipboard_success = False
            if CLIPBOARD_AVAILABLE:
                try:
                    pyperclip.copy(message)
                    clipboard_success = True
                    logger.info(f"Message copied to clipboard for fan {fan_id}")
                except Exception as e:
                    logger.warning(f"Failed to copy to clipboard: {e}")
            
            # Open OnlyFans in browser
            browser_success = False
            onlyfans_url = self._build_onlyfans_url(fan_id)
            
            if open_browser:
                try:
                    webbrowser.open(onlyfans_url)
                    browser_success = True
                    logger.info(f"Opened OnlyFans for fan {fan_id}")
                except Exception as e:
                    logger.warning(f"Failed to open browser: {e}")
            
            # Update audit record status
            self._update_audit_status(audit_id, 'clipboard_prepared')
            
            result = {
                'audit_id': audit_id,
                'fan_id': fan_id,
                'clipboard_copied': clipboard_success,
                'browser_opened': browser_success,
                'onlyfans_url': onlyfans_url,
                'message_preview': message[:50] + "..." if len(message) > 50 else message,
                'next_step': 'Paste message in OnlyFans and click Send',
                'compliance_maintained': True
            }
            
            if not clipboard_success:
                result['manual_copy_required'] = True
                result['message_to_copy'] = message
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to execute one-click send for audit {audit_id}: {e}")
            return {"error": str(e)}
    
    def mark_message_sent(self, audit_id: str, sent_by_user: bool = True) -> Dict:
        """
        Mark message as manually sent by user
        
        Call this after user confirms they sent the message in OnlyFans
        """
        try:
            # Update database
            success = db.mark_message_sent_manually(audit_id)
            
            if success:
                # Update in-memory record
                if audit_id in self.audit_records:
                    self.audit_records[audit_id]['status'] = 'sent_manually'
                    self.audit_records[audit_id]['sent_at'] = datetime.now().isoformat()
                
                logger.info(f"Marked message as sent for audit {audit_id}")
                
                return {
                    'audit_id': audit_id,
                    'status': 'sent_manually',
                    'sent_at': datetime.now().isoformat(),
                    'compliance_maintained': True,
                    'success': True
                }
            else:
                return {"error": "Failed to update database"}
                
        except Exception as e:
            logger.error(f"Failed to mark message as sent for audit {audit_id}: {e}")
            return {"error": str(e)}
    
    def get_send_status(self, audit_id: str) -> Dict:
        """
        Get current send status for an audit record
        """
        try:
            # Check in-memory first
            if audit_id in self.audit_records:
                record = self.audit_records[audit_id]
                return {
                    'audit_id': audit_id,
                    'status': record.get('status', 'unknown'),
                    'fan_id': record.get('fan_id'),
                    'prepared_at': record.get('prepared_at'),
                    'sent_at': record.get('sent_at')
                }
            
            # Check database
            audit_record = self._load_audit_from_db(audit_id)
            if audit_record:
                return {
                    'audit_id': audit_id,
                    'status': audit_record.get('status', 'unknown'),
                    'fan_id': audit_record.get('fan_id'),
                    'found_in': 'database'
                }
            
            return {"error": "Audit record not found"}
            
        except Exception as e:
            logger.error(f"Failed to get send status for audit {audit_id}: {e}")
            return {"error": str(e)}
    
    def _build_onlyfans_url(self, fan_id: str) -> str:
        """
        Build OnlyFans URL for direct message to fan
        
        Note: Actual URL format may need adjustment based on OnlyFans structure
        """
        # Generic URL - adapt based on actual OnlyFans URL structure
        return f"{self.onlyfans_base_url}/my/chats/chat/{fan_id}"
    
    def _get_send_instructions(self) -> Dict:
        """
        Get instructions for manual sending process
        """
        return {
            'step_1': 'Click "Copier et ouvrir OnlyFans" button',
            'step_2': 'OnlyFans will open in new tab with message copied to clipboard',
            'step_3': 'Navigate to the fan\'s conversation',
            'step_4': 'Paste message (Ctrl+V or Cmd+V) into message box',
            'step_5': 'Review message and click Send in OnlyFans',
            'step_6': 'Return here and click "Confirmer envoi" to complete audit',
            'compliance_note': 'Manual sending maintains OnlyFans platform compliance'
        }
    
    def _get_latest_audit_id(self, fan_id: str) -> Optional[str]:
        """
        Get the latest audit ID for a fan from database
        """
        try:
            # This would need to be implemented in database.py
            # For now, generate a simple audit ID
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            return f"audit_{fan_id}_{timestamp}"
        except Exception as e:
            logger.error(f"Failed to get latest audit ID for fan {fan_id}: {e}")
            return None
    
    def _load_audit_from_db(self, audit_id: str) -> Optional[Dict]:
        """
        Load audit record from database
        """
        try:
            # This would need to be implemented based on database schema
            # For now, return None to indicate not found
            return None
        except Exception as e:
            logger.error(f"Failed to load audit record {audit_id} from database: {e}")
            return None
    
    def _update_audit_status(self, audit_id: str, status: str):
        """
        Update audit record status
        """
        try:
            if audit_id in self.audit_records:
                self.audit_records[audit_id]['status'] = status
                self.audit_records[audit_id]['updated_at'] = datetime.now().isoformat()
        except Exception as e:
            logger.error(f"Failed to update audit status for {audit_id}: {e}")
    
    def generate_send_report(self, fan_id: Optional[str] = None, days: int = 7) -> Dict:
        """
        Generate report of sending activity
        """
        try:
            # Get sending statistics from database
            stats = {
                'total_prepared': 0,
                'total_sent': 0,
                'pending_sends': 0,
                'compliance_rate': 100.0,
                'period_days': days
            }
            
            if fan_id:
                stats['fan_id'] = fan_id
                stats['fan_specific'] = True
            
            # Count in-memory records
            for audit_id, record in self.audit_records.items():
                if not fan_id or record.get('fan_id') == fan_id:
                    stats['total_prepared'] += 1
                    if record.get('status') == 'sent_manually':
                        stats['total_sent'] += 1
                    elif record.get('status') in ['prepared', 'clipboard_prepared']:
                        stats['pending_sends'] += 1
            
            # Calculate compliance rate
            if stats['total_prepared'] > 0:
                stats['compliance_rate'] = (stats['total_sent'] / stats['total_prepared']) * 100
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to generate send report: {e}")
            return {"error": str(e)}

# Global one-click sender instance
one_click_sender = OneClickSender()