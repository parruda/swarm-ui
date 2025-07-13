#!/bin/bash

# Build and run SwarmUI container with Podman

# Build the container image
echo "Building SwarmUI container image..."
podman build -t swarmui:latest -f Containerfile .

# Create volumes if they don't exist
echo "Creating volumes..."
podman volume create swarmui_datadir 2>/dev/null || true
podman volume create swarmui_postgres_data 2>/dev/null || true

# Run the container
echo "Starting SwarmUI container..."
podman run -d \
  --name swarmui \
  -p 8080:80 \
  -v swarmui_datadir:/home/app/datadir:Z \
  -v swarmui_postgres_data:/var/lib/postgresql/data:Z \
  -e RAILS_MASTER_KEY="${RAILS_MASTER_KEY}" \
  -e SECRET_KEY_BASE="${SECRET_KEY_BASE}" \
  swarmui:latest

echo "SwarmUI container started!"
echo "Access the application at: http://localhost:8080"
echo ""
echo "To view logs: podman logs -f swarmui"
echo "To stop: podman stop swarmui"
echo "To remove: podman rm swarmui"
echo ""
echo "Volume information:"
echo "  - User data directory: swarmui_datadir -> /home/app/datadir"
echo "  - PostgreSQL data: swarmui_postgres_data -> /var/lib/postgresql/data"