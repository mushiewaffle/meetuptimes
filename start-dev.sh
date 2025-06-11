#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")"

# Clear terminal
clear

echo "=========================================="
echo "Starting Festival Meetup App in Development Mode"
echo "=========================================="
echo ""
echo "📷 Image Upload Feature is now available!"
echo "👉 Take screenshots of Festival app schedules"
echo "👉 Upload to automatically extract set times"
echo ""
echo "Starting development server..."
echo ""

# Start the development server
npm run dev
