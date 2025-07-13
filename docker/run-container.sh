#!/bin/bash

# SwarmUI Container Run Script

echo "SwarmUI Container Runner"
echo "======================="
echo

# Get RAILS_MASTER_KEY from environment
RAILS_MASTER_KEY="${RAILS_MASTER_KEY:-}"

# Check if RAILS_MASTER_KEY is set
if [ -z "$RAILS_MASTER_KEY" ]; then
    echo "ERROR: RAILS_MASTER_KEY environment variable is not set!"
    echo "Please export RAILS_MASTER_KEY before running this script:"
    echo "  export RAILS_MASTER_KEY='your-actual-master-key'"
    exit 1
fi

# Build the container
echo "Building container image..."
podman build --build-arg RAILS_MASTER_KEY="$RAILS_MASTER_KEY" -t swarmui:latest -f Containerfile . || exit 1

# Stop and remove any existing container
echo
echo "Cleaning up existing containers..."
podman stop swarmui 2>/dev/null || true
podman rm swarmui 2>/dev/null || true

# Create volumes if they don't exist
echo "Creating volumes..."
podman volume create swarmui_datadir 2>/dev/null || true
podman volume create swarmui_postgres_data 2>/dev/null || true

# Run the container
echo "Starting SwarmUI container..."
podman run -d \
  --name swarmui \
  -p 8080:8080 \
  -v swarmui_datadir:/home/app/datadir:Z \
  -v swarmui_postgres_data:/var/lib/postgresql/data:Z \
  -e RAILS_MASTER_KEY="$RAILS_MASTER_KEY" \
  swarmui:latest

echo
echo "Container started successfully!"
echo
echo "Access the application at: http://localhost:8080"
echo
echo "Useful commands:"
echo "  View logs:    podman logs -f swarmui"
echo "  Stop:         podman stop swarmui"
echo "  Remove:       podman rm swarmui"
echo "  Shell access: podman exec -it swarmui /bin/bash"
echo
echo "Data volumes:"
echo "  User data: swarmui_datadir -> /home/app/datadir"
echo "  Database:  swarmui_postgres_data -> /var/lib/postgresql/data"