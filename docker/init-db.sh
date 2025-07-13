#!/bin/bash
set -e

# Initialize PostgreSQL data directory
echo "Initializing PostgreSQL data directory..."
initdb -D "$PGDATA" --auth-local=trust --auth-host=md5

# Start PostgreSQL temporarily to set up database
echo "Starting PostgreSQL for initial setup..."
pg_ctl -D "$PGDATA" -o "-c listen_addresses='localhost'" -w start

# Create user and database
echo "Creating database and user..."
createuser -s $POSTGRES_USER || true
psql -U $POSTGRES_USER -c "ALTER USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';"
createdb -O $POSTGRES_USER $POSTGRES_DB || true

# Enable pgvector extension
echo "Enabling pgvector extension..."
psql -U $POSTGRES_USER -d $POSTGRES_DB -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Stop PostgreSQL
echo "Stopping PostgreSQL..."
pg_ctl -D "$PGDATA" -m fast -w stop

# Update postgresql.conf for container environment
echo "Configuring PostgreSQL..."
echo "listen_addresses = 'localhost'" >> $PGDATA/postgresql.conf
echo "port = 5432" >> $PGDATA/postgresql.conf

# Update pg_hba.conf for local connections
cat > $PGDATA/pg_hba.conf << EOF
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
EOF

echo "PostgreSQL initialization complete!"