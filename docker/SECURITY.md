# Security Notice for SwarmUI Container

## IMPORTANT: Rails Master Key

The Rails master key is now required as an environment variable when building and running the container. This prevents the accidental exposure of sensitive credentials in the repository.

### Building the Container

Before building, export your Rails master key:

```bash
export RAILS_MASTER_KEY='your-actual-master-key-here'
./docker/build.sh
```

### Running the Container

The same environment variable must be set when running:

```bash
export RAILS_MASTER_KEY='your-actual-master-key-here'
./docker/run-container.sh
```

### Security Best Practices

1. **Never commit the master key** to version control
2. **Use environment variables** or secure secret management systems
3. **Rotate the master key** if it was ever exposed
4. **Use different keys** for development, staging, and production environments

### If Your Key Was Exposed

If you accidentally committed your Rails master key:

1. Generate a new master key immediately
2. Update all encrypted credentials with the new key
3. Update all deployment environments with the new key
4. Consider any secrets in `credentials.yml.enc` as compromised and rotate them

### Generating a New Master Key

```bash
# Backup your current encrypted credentials
cp config/credentials.yml.enc config/credentials.yml.enc.backup

# Generate new key
rails credentials:edit

# This will create a new master.key file
# Copy the new key and update your environment variables
```