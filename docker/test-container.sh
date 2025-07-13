#!/bin/bash

echo "Testing SwarmUI container..."

# Stop and remove any existing container
podman stop swarmui 2>/dev/null || true
podman rm swarmui 2>/dev/null || true

# Create volumes if they don't exist
podman volume create swarmui_datadir 2>/dev/null || true
podman volume create swarmui_postgres_data 2>/dev/null || true

# Run the container
echo "Starting container..."
podman run -d \
  --name swarmui \
  -p 8080:80 \
  -v swarmui_datadir:/home/app/datadir:Z \
  -v swarmui_postgres_data:/var/lib/postgresql/data:Z \
  -e RAILS_MASTER_KEY="${RAILS_MASTER_KEY}" \
  swarmui:latest

# -e SECRET_KEY_BASE="${SECRET_KEY_BASE}" \
# Wait for services to start
echo "Waiting for services to start..."
sleep 20

# Check container status
echo "Container status:"
podman ps --filter name=swarmui

# Check logs
echo -e "\nContainer logs (last 50 lines):"
podman logs swarmui | tail -50

# Test endpoints
echo -e "\nTesting endpoints:"
echo -n "Testing nginx (port 8080 -> 80): "
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health || echo "Failed"

echo -e "\n\nContainer is running. Access the application at: http://localhost:8080"
echo "To view logs: podman logs -f swarmui"
echo "To stop: podman stop swarmui && podman rm swarmui"