#!/usr/bin/env python3
"""
CodeBERT Embedding Service

This script runs a simple HTTP server that provides CodeBERT embeddings
directly using the PyTorch model.
"""

import os
import sys
import json
import torch
import logging
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import argparse

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Parse arguments
parser = argparse.ArgumentParser(description='CodeBERT Embedding Service')
parser.add_argument('--port', type=int, default=3090, help='Port to run the service on')
parser.add_argument('--model-dir', type=str, help='Directory containing the PyTorch model')
args = parser.parse_args()

# Set default model directory if not specified
home_dir = Path.home()
model_dir = args.model_dir or str(home_dir / '.terminal_helper' / 'models' / 'codebert-base')

# Global variables
model = None
tokenizer = None

def load_model():
    """Load the CodeBERT model and tokenizer"""
    global model, tokenizer
    
    try:
        from transformers import AutoModel, AutoTokenizer
        
        logger.info(f"Loading CodeBERT model from {model_dir}")
        
        # Load tokenizer and model
        tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
        model = AutoModel.from_pretrained(model_dir, local_files_only=True)
        
        # Set model to evaluation mode
        model.eval()
        
        logger.info("Successfully loaded CodeBERT model and tokenizer")
        return True
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        return False

def generate_embedding(text):
    """Generate an embedding for the given text using CodeBERT"""
    global model, tokenizer
    
    try:
        # Ensure model is loaded
        if model is None or tokenizer is None:
            load_model()
        
        # Preprocess and tokenize
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
        
        # Generate embedding
        with torch.no_grad():
            outputs = model(**inputs)
        
        # Extract embedding (mean pooling)
        # Get the last hidden state
        last_hidden_state = outputs.last_hidden_state
        
        # Create attention mask for mean pooling
        attention_mask = inputs.attention_mask
        
        # Calculate mean of token embeddings (masked mean)
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()
        sum_embeddings = torch.sum(last_hidden_state * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        mean_embeddings = sum_embeddings / sum_mask
        
        # Convert to list and normalize
        embedding = mean_embeddings[0].tolist()
        
        # Make sure it's a flat list, not a nested structure
        if isinstance(embedding, list) and any(isinstance(x, list) for x in embedding):
            # Flatten nested lists
            embedding = [item for sublist in embedding for item in sublist]
        
        # Calculate norm for normalization
        norm = sum(x * x for x in embedding) ** 0.5
        
        # Normalize the embedding
        normalized_embedding = [float(x / norm) for x in embedding] if norm > 0 else [float(x) for x in embedding]
        
        # Verify the embedding is a flat list of floats
        if not all(isinstance(x, float) for x in normalized_embedding):
            logger.warning(f"Non-float values in embedding: {[type(x) for x in normalized_embedding if not isinstance(x, float)]}")
            normalized_embedding = [float(x) if not isinstance(x, float) else x for x in normalized_embedding]
        
        return normalized_embedding
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        return None

class RequestHandler(BaseHTTPRequestHandler):
    def _send_response(self, status_code, content):
        """Send HTTP response with JSON content"""
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(content).encode())
    
    def do_GET(self):
        """Handle GET requests - for health check"""
        if self.path == '/health':
            self._send_response(200, {'status': 'ok', 'model': 'codebert'})
        else:
            self._send_response(404, {'error': 'Not found'})
    
    def do_POST(self):
        """Handle POST requests for embedding generation"""
        if self.path == '/embed':
            # Get request body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            
            try:
                # Parse JSON
                data = json.loads(post_data)
                text = data.get('text', '')
                
                if not text:
                    self._send_response(400, {'error': 'Missing text parameter'})
                    return
                
                # Generate embedding
                embedding = generate_embedding(text)
                
                if embedding is None:
                    self._send_response(500, {'error': 'Failed to generate embedding'})
                    return
                
                # Ensure we're returning a valid array of floats
                if isinstance(embedding, list):
                    # Verify all elements are valid numbers
                    for i, val in enumerate(embedding):
                        if not isinstance(val, (int, float)):
                            logger.warning(f"Non-numeric value at index {i}: {val} (type: {type(val)})")
                            embedding[i] = 0.0
                else:
                    logger.error(f"Embedding is not a list: {type(embedding)}")
                    embedding = [0.0] * 768  # Default dimension
                
                # Return as a simple list of floats
                self._send_response(200, {'embedding': [float(x) for x in embedding]})
            except json.JSONDecodeError:
                self._send_response(400, {'error': 'Invalid JSON'})
            except Exception as e:
                logger.error(f"Error processing request: {e}")
                self._send_response(500, {'error': str(e)})
        else:
            self._send_response(404, {'error': 'Not found'})

def run_server(port):
    """Run the HTTP server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, RequestHandler)
    logger.info(f"Starting CodeBERT service on port {port}")
    httpd.serve_forever()

if __name__ == "__main__":
    # Load the model
    if load_model():
        # Run a test to verify
        test_text = "def hello_world(): print('Hello, World!')"
        test_embedding = generate_embedding(test_text)
        
        if test_embedding:
            logger.info(f"Model test successful - embedding dimension: {len(test_embedding)}")
            # Start the server
            run_server(args.port)
        else:
            logger.error("Model test failed - could not generate embedding")
            sys.exit(1)
    else:
        logger.error("Failed to load model")
        sys.exit(1)
