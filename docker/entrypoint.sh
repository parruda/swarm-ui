#!/bin/bash
set -e

# Function to wait for PostgreSQL to be ready
wait_for_postgres() {
    echo "Waiting for PostgreSQL to be ready..."
    until pg_isready -h localhost -p 5432 -U $POSTGRES_USER; do
        echo "PostgreSQL is unavailable - sleeping"
        sleep 1
    done
    echo "PostgreSQL is up and running!"
}

# Initialize PostgreSQL if needed
if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL database..."
    sudo -u app /usr/local/bin/init-db.sh
fi

# Start supervisord to manage all processes
echo "Starting supervisord..."
exec sudo /usr/bin/supervisord -c /etc/supervisord.conf