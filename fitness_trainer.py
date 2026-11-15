"""
Quick launcher for AI Fitness Trainer
Run this directly to start the trainer without the web app
"""

import subprocess
import sys
import os

APP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app.py')

def launch_trainer():
    """Launch the fitness trainer application"""
    try:
        if not os.path.exists(APP_FILE):
            print("❌ Error: app.py not found next to fitness_trainer.py!")
            input("Press Enter to exit...")
            return
        
        print("🚀 Launching AI Fitness Trainer...")
        print("📹 Make sure your camera is connected!")
        print("\n" + "="*50)
        
        subprocess.run([sys.executable, APP_FILE])
        
    except KeyboardInterrupt:
        print("\n\n✓ Trainer closed by user")
    except Exception as e:
        print(f"\n❌ Error launching trainer: {str(e)}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    launch_trainer()