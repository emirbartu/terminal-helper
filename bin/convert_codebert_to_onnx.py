#!/usr/bin/env python3
"""
CodeBERT to ONNX Converter

This script converts the CodeBERT PyTorch model to ONNX format.
It requires torch, transformers, and onnx packages to be installed.
"""

import os
import sys
import argparse
from pathlib import Path

def convert_to_onnx(model_dir, output_file):
    """Convert CodeBERT PyTorch model to ONNX format"""
    try:
        import torch
        from transformers import AutoModel, AutoTokenizer
    except ImportError:
        print("Error: Required packages not found. Please install:")
        print("pip install torch transformers onnx")
        return False

    print(f"Loading CodeBERT model from {model_dir}")
    try:
        # Load model and tokenizer
        model = AutoModel.from_pretrained(model_dir, local_files_only=True)
        tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
        
        # Set model to evaluation mode
        model.eval()
        
        # Create a sample input for tracing
        sample_text = "def hello_world(): print('Hello, World!')"
        inputs = tokenizer(sample_text, return_tensors="pt")
        
        # Export to ONNX
        print(f"Converting model to ONNX format at {output_file}")
        with torch.no_grad():
            torch.onnx.export(
                model,                                      # PyTorch model
                (inputs.input_ids, inputs.attention_mask),  # Model inputs
                output_file,                                # Output file
                input_names=['input_ids', 'attention_mask'],# Input names
                output_names=['last_hidden_state'],         # Output names
                dynamic_axes={                              # Dynamic axes
                    'input_ids': {0: 'batch', 1: 'sequence'},
                    'attention_mask': {0: 'batch', 1: 'sequence'},
                    'last_hidden_state': {0: 'batch', 1: 'sequence'}
                },
                opset_version=12                           # ONNX opset version
            )
        
        # Verify the ONNX model
        try:
            import onnx
            onnx_model = onnx.load(output_file)
            onnx.checker.check_model(onnx_model)
            print("ONNX model verified successfully!")
        except Exception as e:
            print(f"Warning: ONNX model verification failed: {e}")
        
        print(f"Successfully converted PyTorch model to ONNX format at: {output_file}")
        return True
    
    except Exception as e:
        print(f"Error converting model to ONNX: {e}")
        return False

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Convert CodeBERT PyTorch model to ONNX format')
    parser.add_argument('--model-dir', type=str, help='Directory containing the PyTorch model')
    parser.add_argument('--output-file', type=str, help='Path to save the ONNX model')
    args = parser.parse_args()
    
    # Use default paths if not specified
    home_dir = Path.home()
    model_dir = args.model_dir or str(home_dir / '.terminal_helper' / 'models' / 'codebert-base')
    output_dir = Path(model_dir) / 'onnx'
    output_file = args.output_file or str(output_dir / 'model.onnx')
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Convert the model
    success = convert_to_onnx(model_dir, output_file)
    
    if success:
        print("\nConversion successful!")
        print(f"ONNX model saved to: {output_file}")
        print("Now you can use this model with the transformers.js library.")
        sys.exit(0)
    else:
        print("\nConversion failed.")
        print("Please install the required packages and try again:")
        print("pip install torch transformers onnx")
        sys.exit(1)

if __name__ == "__main__":
    main()
