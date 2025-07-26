# Migration from PostgreSQL to SQLite

This document describes how to migrate your SwarmUI installation from PostgreSQL to SQLite.

## Prerequisites

1. Ensure your PostgreSQL database is running and accessible
2. Back up your PostgreSQL database before starting the migration
3. Stop any running SwarmUI processes

## Migration Steps

### 1. Export Data from PostgreSQL

First, install dependencies and run the migration script to export your data:

```bash
# Install both pg and sqlite3 gems needed for migration
BUNDLE_GEMFILE=Gemfile.migrate bundle install

# Run the migration script
BUNDLE_GEMFILE=Gemfile.migrate bundle exec bin/migrate_to_sqlite
```

This will:
- Export all data from your PostgreSQL database to a JSON backup file in `tmp/`
- Create new SQLite database files in the `storage/` directory
- Migrate all data including proper JSON conversion

### 2. Update Dependencies

Install the new dependencies:

```bash
bundle install
```

### 3. Run Migrations

Apply the schema changes for SQLite:

```bash
bin/rails db:migrate
```

### 4. Verify Migration

Test that the migration was successful:

```bash
bin/rails console
# Check that your data is present
Project.count
Session.count
```

### 5. Start SwarmUI

Start the application with the new SQLite backend:

```bash
bin/dev
```

## File Structure Changes

The migration creates the following SQLite database files:
- `storage/development.sqlite3` - Main application database
- `storage/development_cache.sqlite3` - Solid Cache database
- `storage/development_queue.sqlite3` - Solid Queue database  
- `storage/development_cable.sqlite3` - Solid Cable database

## Rollback Instructions

If you need to rollback to PostgreSQL:

1. Restore your `Gemfile` to include `gem "pg", "~> 1.1"` instead of `sqlite3`
2. Restore the original `config/database.yml` 
3. Restore `Procfile.start` to include the postgres process
4. Restore the PostgreSQL startup scripts (`bin/pg-start`, `bin/pg-dev`)
5. Run `bundle install`
6. Start PostgreSQL and restore from your backup

## Cleanup After Successful Migration

Once you've verified the migration was successful:

1. Remove the temporary migration Gemfile: `rm Gemfile.migrate Gemfile.migrate.lock`
2. Remove PostgreSQL backup files from `tmp/`: `rm tmp/pg_backup_*.json`
3. You can keep the migration script for future reference or remove it: `rm bin/migrate_to_sqlite`

## Notes

- The migration converts JSONB columns to JSON (stored as TEXT in SQLite)
- SQLite has different concurrency characteristics than PostgreSQL - it uses a write-ahead log for better concurrency
- Backup files are stored in `tmp/pg_backup_[timestamp].json`
- The migration is idempotent - you can run it multiple times safely