# frozen_string_literal: true

namespace :db do
  desc "Ensure PostgreSQL user exists for the application"
  task ensure_user: :environment do
    require "yaml"
    require "erb"

    # Load database configuration
    db_config = Rails.configuration.database_configuration
    env = Rails.env

    db_user = db_config[env]["username"]
    db_password = db_config[env]["password"]
    db_host = db_config[env]["host"] || "localhost"

    if db_user.blank?
      puts "No database username specified in database.yml for #{env} environment"
      next
    end

    puts "Checking PostgreSQL user '#{db_user}'..."

    # Check if user exists
    user_check_cmd = "psql -h #{db_host} -U postgres -tAc \"SELECT 1 FROM pg_user WHERE usename='#{db_user}'\" 2>/dev/null"
    user_exists = system("#{user_check_cmd} | grep -q 1")

    if user_exists
      puts "PostgreSQL user '#{db_user}' already exists."
    else
      puts "Creating PostgreSQL user '#{db_user}'..."

      # Try different methods to create the user
      created = false

      # Method 1: Direct createuser command
      if system("createuser -h #{db_host} -s #{db_user} 2>/dev/null")
        puts "PostgreSQL user '#{db_user}' created successfully."
        created = true
      # Method 2: Using psql with postgres user
      elsif system("psql -h #{db_host} -U postgres -c \"CREATE USER #{db_user} WITH SUPERUSER;\" 2>/dev/null")
        puts "PostgreSQL user '#{db_user}' created successfully via psql."
        created = true
      # Method 3: Try without specifying postgres user (might work if current user has privileges)
      elsif system("psql -h #{db_host} -c \"CREATE USER #{db_user} WITH SUPERUSER;\" 2>/dev/null")
        puts "PostgreSQL user '#{db_user}' created successfully."
        created = true
      else
        puts "\n⚠️  ERROR: Could not create PostgreSQL user '#{db_user}'."
        puts "\nPlease create the user manually with one of these commands:"
        puts "  sudo -u postgres createuser -s #{db_user}"
        puts "  psql -U postgres -c \"CREATE USER #{db_user} WITH SUPERUSER;\""
        puts "\nThen set the password:"
        puts "  psql -U postgres -c \"ALTER USER #{db_user} WITH PASSWORD '#{db_password}';\""

        raise "PostgreSQL user creation failed"
      end

      # Set password if user was created and password is specified
      if created && db_password.present?
        if system("psql -h #{db_host} -U postgres -c \"ALTER USER #{db_user} WITH PASSWORD '#{db_password}';\" 2>/dev/null") ||
            system("psql -h #{db_host} -c \"ALTER USER #{db_user} WITH PASSWORD '#{db_password}';\" 2>/dev/null")
          puts "Password set for PostgreSQL user '#{db_user}'."
        else
          puts "Warning: Could not set password for user '#{db_user}'. You may need to do this manually."
        end
      end
    end
  end

  # Hook into db:prepare to ensure user exists first
  task prepare: :ensure_user # rubocop:disable Rake/Desc
end
