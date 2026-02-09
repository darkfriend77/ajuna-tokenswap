#!/bin/bash

# Start a simple HTTP server for the test UI
echo "Starting test UI server..."
echo "Open your browser to: http://localhost:8000/test-ui.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python3 -m http.server 8000
