#!/usr/bin/env python3
"""
Test runner for OnlyFans Chatting Assistant

Run all tests or specific test modules.
"""

import sys
import unittest
import os
from pathlib import Path

def run_tests(test_pattern=None):
    """Run tests with optional pattern filter"""
    
    # Set up path
    current_dir = Path(__file__).parent
    sys.path.insert(0, str(current_dir))
    
    # Discover and run tests
    if test_pattern:
        suite = unittest.TestLoader().loadTestsFromName(test_pattern)
    else:
        # Discover all tests in tests directory
        suite = unittest.TestLoader().discover(
            start_dir=current_dir / 'tests',
            pattern='test_*.py',
            top_level_dir=current_dir
        )
    
    # Run tests with verbose output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Return exit code based on results
    return 0 if result.wasSuccessful() else 1

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Run OnlyFans Chatting Assistant tests')
    parser.add_argument('--pattern', help='Specific test pattern to run (e.g., tests.test_fan_analyzer)')
    parser.add_argument('--coverage', action='store_true', help='Run with coverage analysis')
    
    args = parser.parse_args()
    
    if args.coverage:
        try:
            import coverage
            cov = coverage.Coverage()
            cov.start()
            
            exit_code = run_tests(args.pattern)
            
            cov.stop()
            cov.save()
            
            print("\nCoverage Report:")
            cov.report()
            
            sys.exit(exit_code)
        except ImportError:
            print("Coverage.py not installed. Run: pip install coverage")
            sys.exit(1)
    else:
        exit_code = run_tests(args.pattern)
        sys.exit(exit_code)