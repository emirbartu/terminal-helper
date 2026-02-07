#!/usr/bin/env python3
"""
Automatic Ollama installation script for Terminal Helper

This script checks if Ollama is installed and installs it if necessary.
It also verifies the service is running and starts it if needed.
"""

import os
import platform
import shutil
import subprocess
import sys
import time
import requests


class OllamaSetup:
    """Handles Ollama installation, service management, and model management"""
    
    def __init__(self, model_name="phi4"):
        """
        Initialize the Ollama setup handler
        
        Args:
            model_name: Name of the model to use (default: phi4)
        """
        self.model_name = model_name
        self.system = platform.system().lower()
        self.ollama_url = "http://localhost:11434"
        
    def check_installation(self):
        """Check if Ollama is installed on the system"""
        return shutil.which('ollama') is not None

    def install_ollama(self):
        """Install Ollama based on the operating system"""
        print("Ollama not found. Installing Ollama...")
        
        if self.system == "linux":
            try:
                # Check if curl is installed
                if not shutil.which('curl'):
                    print("curl is required but not installed. Installing curl...")
                    subprocess.run("sudo apt-get update && sudo apt-get install -y curl", shell=True, check=True)
                
                print("Installing Ollama on Linux...")
                subprocess.run(
                    "curl -fsSL https://ollama.com/install.sh | sh",
                    shell=True, check=True
                )
                print("Ollama installed successfully on Linux")
                return True
            except subprocess.CalledProcessError as e:
                print(f"Failed to install Ollama on Linux: {e}")
                print("Please try manual installation:")
                print("1. curl -fsSL https://ollama.com/install.sh | sh")
                print("2. Or visit https://ollama.com for alternative installation methods")
                return False
                
        elif self.system == "darwin":  # macOS
            try:
                print("Installing Ollama on macOS...")
                
                # Check if Homebrew is installed
                if shutil.which('brew'):
                    print("Using Homebrew to install Ollama...")
                    subprocess.run("brew install ollama", shell=True, check=True)
                else:
                    # Using the official install script for macOS
                    subprocess.run(
                        "curl -fsSL https://ollama.com/install.sh | sh",
                        shell=True, check=True
                    )
                
                print("Ollama installed successfully on macOS")
                return True
            except subprocess.CalledProcessError as e:
                print(f"Failed to install Ollama on macOS: {e}")
                print("Please try manual installation:")
                print("1. If you have Homebrew: brew install ollama")
                print("2. Download from https://ollama.com")
                return False
        else:
            print(f"Unsupported operating system: {self.system}")
            print("Please install Ollama manually from https://ollama.com")
            return False

    def is_service_running(self):
        """Check if the Ollama service is running"""
        try:
            response = requests.get(f"{self.ollama_url}/api/version", timeout=2)
            return response.status_code == 200
        except requests.RequestException:
            return False

    def start_service(self):
        """Start the Ollama service if it's not running"""
        if self.is_service_running():
            print("Ollama service is already running.")
            return True

        print("Starting Ollama service...")
        
        try:
            if self.system == "darwin" or self.system == "linux":
                # Start the service in the background
                subprocess.Popen(
                    ["ollama", "serve"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True
                )
                
                # Wait for the service to start
                for _ in range(10):  # Wait up to 10 seconds
                    time.sleep(1)
                    if self.is_service_running():
                        print("Ollama service started successfully.")
                        return True
                
                print("Warning: Ollama service started but not responding within the timeout.")
                return False
            else:
                print(f"Service auto-start not supported on {self.system}.")
                print("Please start Ollama manually before using Terminal Helper.")
                return False
        except Exception as e:
            print(f"Failed to start Ollama service: {e}")
            print("Please start Ollama manually using 'ollama serve' before using Terminal Helper.")
            return False

    def ensure_model_available(self):
        """Make sure the default model is available"""
        if not self.is_service_running():
            print("Ollama service is not running. Cannot check/install models.")
            return False
            
        try:
            # Check if model is already pulled
            result = subprocess.run(
                ["ollama", "list"], 
                capture_output=True, 
                text=True, 
                check=True
            )
            
            if self.model_name in result.stdout:
                print(f"Model {self.model_name} is already available.")
                return True
                
            print(f"Downloading model {self.model_name}...")
            # Pull the model
            subprocess.run(
                ["ollama", "pull", self.model_name],
                check=True
            )
            print(f"Model {self.model_name} downloaded successfully.")
            return True
        except subprocess.CalledProcessError as e:
            print(f"Failed to check/download model: {e}")
            return False


def main():
    """Main function to ensure Ollama is installed and running"""
    setup = OllamaSetup()
    
    # Check if Ollama is installed
    if not setup.check_installation():
        # Install Ollama
        if not setup.install_ollama():
            print("Failed to install Ollama automatically.")
            print("Please install Ollama manually from https://ollama.com")
            sys.exit(1)
    
    # Start the service
    if not setup.start_service():
        print("Warning: Could not start Ollama service.")
        print("Please start Ollama manually using 'ollama serve' before using Terminal Helper.")
    
    # Ensure default model is available
    if not setup.ensure_model_available():
        print("Warning: Could not ensure the default model is available.")
        print("Please run 'ollama pull phi4' manually before using Terminal Helper.")
    
    print("Ollama setup completed successfully!")


if __name__ == "__main__":
    main() 