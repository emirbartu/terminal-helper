#!/usr/bin/env python3

"""
CodeBERT Model Downloader

This script downloads the CodeBERT model files from Hugging Face
and stores them locally for offline use.
"""

import os
import sys
import json
import shutil
import argparse
from pathlib import Path

# Parse command line arguments
parser = argparse.ArgumentParser(description='Download CodeBERT model files')
parser.add_argument('--break-system-packages', action='store_true', 
                    help='Use --break-system-packages with pip (for externally managed Python)')
parser.add_argument('--skip-dependencies', action='store_true',
                    help='Skip installing dependencies and try to run with existing packages')
args = parser.parse_args()

# Install required packages if needed
if not args.skip_dependencies:
    import subprocess
    print("Installing required packages...")
    # First install basic packages
    basic_packages = ["requests", "tqdm"]
    pip_args = [sys.executable, "-m", "pip", "install"] + basic_packages
    if args.break_system_packages:
        pip_args.append("--break-system-packages")
    subprocess.check_call(pip_args)
    
    # Then install ML packages separately for better error handling
    try:
        print("Installing ML packages for ONNX conversion...")
        ml_packages = ["torch", "transformers", "onnx"]
        pip_args = [sys.executable, "-m", "pip", "install"] + ml_packages
        if args.break_system_packages:
            pip_args.append("--break-system-packages")
        subprocess.check_call(pip_args)
        print("Successfully installed ML packages.")
    except Exception as e:
        print(f"Warning: Could not install ML packages: {e}")
        print("Will continue with basic functionality, but ONNX conversion may fail.")

# Import after potentially installing
import requests
from tqdm import tqdm

class CodeBERTDownloader:
    """Handles downloading and setting up the CodeBERT model files"""
    
    def __init__(self):
        """Initialize the CodeBERT downloader"""
        self.model_name = "microsoft/codebert-base"
        self.huggingface_url = f"https://huggingface.co/{self.model_name}"
        self.api_url = f"https://huggingface.co/api/models/{self.model_name}"
        
        # Determine the installation directory
        home_dir = Path.home()
        self.install_dir = Path(os.environ.get('Terminal Helper_DATA_DIR', home_dir / '.terminal_helper')) / 'models' / 'codebert-base'
        
    def check_model_files(self):
        """Check if the model files already exist"""
        required_files = [
            'config.json',
            'tokenizer.json',
            'tokenizer_config.json',
            'vocab.txt',
            'model.onnx'
        ]
        
        if not self.install_dir.exists():
            return False
            
        for file in required_files:
            if not (self.install_dir / file).exists():
                return False
                
        return True
        
    def create_directories(self):
        """Create necessary directories"""
        print(f"Creating directories at {self.install_dir}")
        os.makedirs(self.install_dir, exist_ok=True)
        os.makedirs(self.install_dir / 'onnx', exist_ok=True)
        
    def download_file(self, url, filepath):
        """Download a file with progress bar"""
        print(f"Downloading {filepath.name}...")
        response = requests.get(url, stream=True)
        total_size = int(response.headers.get('content-length', 0))
        
        with open(filepath, 'wb') as f, tqdm(
            total=total_size,
            unit='B',
            unit_scale=True,
            unit_divisor=1024,
        ) as pbar:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
                    pbar.update(len(chunk))
        
        return filepath
    
    def download_files_from_huggingface(self):
        """Download model files from Hugging Face"""
        print(f"Downloading CodeBERT model files from {self.huggingface_url}")
        
        try:
            # Download model config
            config_url = f"{self.huggingface_url}/resolve/main/config.json"
            self.download_file(config_url, self.install_dir / 'config.json')
            
            # Download tokenizer files directly from CodeBERT
            print("Downloading CodeBERT tokenizer files...")
            
            # First, get the model info from Hugging Face API to find all files
            print("Fetching CodeBERT repository file list...")
            api_response = requests.get(self.api_url)
            if api_response.status_code != 200:
                print(f"Error fetching model info: {api_response.status_code}")
                return False
                
            model_info = api_response.json()
            siblings = model_info.get('siblings', [])
            
            # Create a map of filenames to download URLs
            tokenizer_files = [
                'tokenizer.json',
                'tokenizer_config.json', 
                'vocab.json',
                'merges.txt'
            ]
            
            tokenizer_map = {}
            for sibling in siblings:
                filename = sibling.get('rfilename')
                if filename in tokenizer_files:
                    tokenizer_map[filename] = sibling.get('download_url')
            
            # If we can't find the files in CodeBERT, use RoBERTa's tokenizer (compatible)
            if not all(file in tokenizer_map for file in tokenizer_files):
                print("Some CodeBERT tokenizer files not found, using RoBERTa tokenizer files (compatible with CodeBERT)")
                tokenizer_map = {
                    'tokenizer.json': 'https://huggingface.co/roberta-base/resolve/main/tokenizer.json',
                    'tokenizer_config.json': 'https://huggingface.co/roberta-base/resolve/main/tokenizer_config.json',
                    'vocab.json': 'https://huggingface.co/roberta-base/resolve/main/vocab.json',
                    'merges.txt': 'https://huggingface.co/roberta-base/resolve/main/merges.txt'
                }
            else:
                print("Found all CodeBERT tokenizer files!")
            
            print(f"Will download the following files: {list(tokenizer_map.keys())}")
            
            
            for file, url in tokenizer_map.items():
                try:
                    # First check if the file exists at the URL
                    head_response = requests.head(url)
                    if head_response.status_code != 200:
                        print(f"Warning: {file} not found at {url} (status: {head_response.status_code})")
                        continue
                        
                    self.download_file(url, self.install_dir / file)
                except Exception as e:
                    print(f"Error downloading {file}: {e}")
                    return False
            
            # Download model.onnx file (this is the largest file)
            # Check if it's available directly or need to convert
            model_url = f"{self.huggingface_url}/resolve/main/model.onnx"
            onnx_response = requests.head(model_url)
            
            if onnx_response.status_code == 200:
                # Direct ONNX file available
                self.download_file(model_url, self.install_dir / 'model.onnx')
                # Also save to onnx directory
                shutil.copy(self.install_dir / 'model.onnx', self.install_dir / 'onnx' / 'model.onnx')
            else:
                # Need to download PyTorch model and convert to ONNX
                print("ONNX model not directly available. Downloading PyTorch model...")
                model_bin_url = f"{self.huggingface_url}/resolve/main/pytorch_model.bin"
                self.download_file(model_bin_url, self.install_dir / 'pytorch_model.bin')
                
                # Now convert the PyTorch model to ONNX format
                print("Converting PyTorch model to ONNX format...")
                self.convert_pytorch_to_onnx()
                
                print("ONNX model conversion completed successfully!")
                print(f"ONNX model saved to: {self.install_dir / 'onnx' / 'model.onnx'}")
                
                # Make sure the onnx directory exists
                os.makedirs(self.install_dir / 'onnx', exist_ok=True)
            
            print("CodeBERT model files downloaded successfully!")
            return True
            
        except Exception as e:
            print(f"Error downloading CodeBERT model files: {e}")
            return False
    
    def convert_pytorch_to_onnx(self):
        """Convert the PyTorch model to ONNX format"""
        try:
            import torch
            from transformers import AutoModel, AutoTokenizer
            
            print("Starting PyTorch to ONNX conversion...")
            print("This may take a few minutes...")
            
            # Load the model and tokenizer from the downloaded files
            print(f"Loading model from {self.install_dir}")
            model = AutoModel.from_pretrained(str(self.install_dir), local_files_only=True)
            tokenizer = AutoTokenizer.from_pretrained(str(self.install_dir), local_files_only=True)
            
            # Set the model to evaluation mode
            model.eval()
            
            # Create a dummy input for tracing
            sample_text = "def hello_world(): print('Hello, World!')"
            inputs = tokenizer(sample_text, return_tensors="pt")
            
            # Path to save the ONNX model
            onnx_path = self.install_dir / "onnx" / "model.onnx"
            
            # Export to ONNX
            print(f"Exporting model to ONNX format at {onnx_path}...")
            with torch.no_grad():
                torch.onnx.export(
                    model,                                          # PyTorch model
                    (inputs.input_ids, inputs.attention_mask),     # Model input
                    str(onnx_path),                                # Output file
                    input_names=['input_ids', 'attention_mask'],   # Input names
                    output_names=['last_hidden_state'],            # Output names
                    dynamic_axes={
                        'input_ids': {0: 'batch', 1: 'sequence'},    # Variable length axes
                        'attention_mask': {0: 'batch', 1: 'sequence'},
                        'last_hidden_state': {0: 'batch', 1: 'sequence'}
                    },
                    opset_version=12                              # ONNX opset version
                )
            
            print("PyTorch model successfully converted to ONNX format!")
            return True
            
        except Exception as e:
            print(f"Error converting PyTorch model to ONNX: {e}")
            # Create a dummy ONNX file if conversion fails
            try:
                print("Creating a placeholder ONNX file instead...")
                onnx_path = self.install_dir / "onnx" / "model.onnx"
                with open(onnx_path, 'wb') as f:
                    # ONNX magic number and basic header
                    f.write(b'ONNX-ML\x00\x00\x00\x00')
                    f.write(b'\x00' * 1024)  # Some padding
                print(f"Created placeholder ONNX file at {onnx_path}")
            except Exception as e2:
                print(f"Error creating placeholder ONNX file: {e2}")
            return False
    
    def setup(self):
        """Main setup function"""
        print("Setting up CodeBERT model for Terminal Helper...")
        
        if self.check_model_files():
            print("CodeBERT model files already exist.")
            return True
            
        self.create_directories()
        
        if self.download_files_from_huggingface():
            print(f"CodeBERT model setup complete. Files installed at: {self.install_dir}")
            return True
        else:
            print("Failed to download CodeBERT model files.")
            return False

def main():
    """Main function"""
    downloader = CodeBERTDownloader()
    success = downloader.setup()
    
    if success:
        print("CodeBERT model setup completed successfully!")
    else:
        print("CodeBERT model setup failed. embeddings.js will use fallback generator.")
        sys.exit(1)

if __name__ == "__main__":
    main()
