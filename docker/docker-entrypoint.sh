#!/bin/bash
set -e

# Function to initialize PostgreSQL if needed
init_postgres() {
    if [ ! -s "$PGDATA/PG_VERSION" ]; then
        echo "PostgreSQL data directory appears to be empty. Initializing..."
        
        # Ensure the directory exists with correct permissions
        mkdir -p "$PGDATA"
        chown -R app:app "$PGDATA"
        chmod 700 "$PGDATA"
        
        # Initialize the database
        echo "Running initdb..."
        initdb -D "$PGDATA" \
            --username="$POSTGRES_USER" \
            --pwfile=<(echo "$POSTGRES_PASSWORD") \
            --auth-local=trust \
            --auth-host=scram-sha-256
        
        # Start PostgreSQL temporarily to create database and enable extensions
        echo "Starting PostgreSQL temporarily..."
        pg_ctl -D "$PGDATA" \
            -o "-c listen_addresses=''" \
            -w start
        
        # Create the main database and additional databases for production
        echo "Creating databases..."
        createdb -U "$POSTGRES_USER" "$POSTGRES_DB" 2>/dev/null || true
        createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_cache" 2>/dev/null || true
        createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_queue" 2>/dev/null || true
        createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_cable" 2>/dev/null || true
        
        # Enable pgvector extension in all databases
        echo "Enabling pgvector extension..."
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;"
        psql -U "$POSTGRES_USER" -d "${POSTGRES_DB}_cache" -c "CREATE EXTENSION IF NOT EXISTS vector;"
        psql -U "$POSTGRES_USER" -d "${POSTGRES_DB}_queue" -c "CREATE EXTENSION IF NOT EXISTS vector;"
        psql -U "$POSTGRES_USER" -d "${POSTGRES_DB}_cable" -c "CREATE EXTENSION IF NOT EXISTS vector;"
        
        # Stop PostgreSQL
        echo "Stopping PostgreSQL..."
        pg_ctl -D "$PGDATA" -m fast -w stop
        
        # Configure PostgreSQL for container use
        echo "Configuring PostgreSQL..."
        {
            echo "listen_addresses = '*'"
            echo "port = 5432"
        } >> "$PGDATA/postgresql.conf"
        
        # Update pg_hba.conf for container networking
        cat > "$PGDATA/pg_hba.conf" <<-EOF
			# TYPE  DATABASE        USER            ADDRESS                 METHOD
			local   all             all                                     trust
			host    all             all             127.0.0.1/32            scram-sha-256
			host    all             all             ::1/128                 scram-sha-256
			host    all             all             0.0.0.0/0               scram-sha-256
		EOF
        
        echo "PostgreSQL initialization complete!"
    else
        echo "PostgreSQL data directory already exists, skipping initialization."
    fi
}

# Initialize PostgreSQL
init_postgres

# Start supervisord to manage all processes
echo "Starting supervisord..."
exec supervisord -c /etc/supervisord.conf