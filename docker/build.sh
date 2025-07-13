#!/bin/bash

# SwarmUI Container Build Script

set -e

echo "SwarmUI Container Builder"
echo "========================"
echo

# Determine container engine
if command -v podman >/dev/null 2>&1; then
    ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
    ENGINE="docker"
else
    echo "Error: Neither podman nor docker found in PATH"
    echo "Please install either Podman or Docker to continue"
    exit 1
fi

echo "Using container engine: $ENGINE"
echo

# Parse command line arguments
TAG="swarmui:latest"
NO_CACHE=""
PLATFORM=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag|-t)
            TAG="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --platform)
            PLATFORM="--platform $2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo
            echo "Options:"
            echo "  --tag, -t <tag>      Tag for the built image (default: swarmui:latest)"
            echo "  --no-cache           Build without using cache"
            echo "  --platform <platform> Set platform (e.g., linux/amd64, linux/arm64)"
            echo "  --help, -h           Show this help message"
            echo
            echo "Examples:"
            echo "  $0                           # Build with default tag"
            echo "  $0 --tag myswarmui:v1.0      # Build with custom tag"
            echo "  $0 --no-cache                # Force rebuild without cache"
            echo "  $0 --platform linux/amd64    # Build for specific platform"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Change to project root directory
cd "$(dirname "$0")/.."

# Check if Containerfile exists
if [ ! -f "Containerfile" ]; then
    echo "Error: Containerfile not found in $(pwd)"
    echo "Please run this script from the SwarmUI project directory"
    exit 1
fi

# Display build configuration
echo "Build Configuration:"
echo "  Container file: Containerfile"
echo "  Image tag: $TAG"
if [ -n "$NO_CACHE" ]; then
    echo "  Cache: disabled"
else
    echo "  Cache: enabled"
fi
if [ -n "$PLATFORM" ]; then
    echo "  Platform: ${PLATFORM#--platform }"
fi
echo

# Start build
echo "Starting build..."
echo "================="
echo

# Get RAILS_MASTER_KEY from environment or use placeholder
RAILS_MASTER_KEY="${RAILS_MASTER_KEY:-YOUR_RAILS_MASTER_KEY_HERE}"

# Check if RAILS_MASTER_KEY is set properly
if [ "$RAILS_MASTER_KEY" = "YOUR_RAILS_MASTER_KEY_HERE" ]; then
    echo "WARNING: RAILS_MASTER_KEY not set!"
    echo "Please export RAILS_MASTER_KEY environment variable before building:"
    echo "  export RAILS_MASTER_KEY='your-actual-master-key'"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

BUILD_CMD="$ENGINE build $NO_CACHE $PLATFORM --build-arg RAILS_MASTER_KEY=$RAILS_MASTER_KEY -t $TAG -f Containerfile ."

echo "Running: $BUILD_CMD"
echo

if $BUILD_CMD; then
    echo
    echo "Build completed successfully!"
    echo
    echo "Image created: $TAG"
    echo
    echo "To run the container:"
    echo "  $ENGINE run -d \\"
    echo "    --name swarmui \\"
    echo "    -p 8080:8080 \\"
    echo "    -v swarmui_datadir:/home/app/datadir:Z \\"
    echo "    -v swarmui_postgres_data:/var/lib/postgresql/data:Z \\"
    echo "    -e RAILS_MASTER_KEY=\"\${RAILS_MASTER_KEY}\" \\"
    echo "    $TAG"
    echo
    echo "Or use the run-container.sh script for automated setup"
else
    echo
    echo "Build failed!"
    echo "Please check the error messages above"
    exit 1
fi