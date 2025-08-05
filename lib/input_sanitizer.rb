# frozen_string_literal: true

# Centralized module for sanitizing user inputs to prevent command injection
# and other security vulnerabilities
module InputSanitizer
  class << self
    # Sanitize UUID format (for session IDs)
    # Allows only lowercase hex and hyphens in UUID format
    def sanitize_uuid(value)
      value.to_s.gsub(/[^a-f0-9\-]/, "")
    end

    # Sanitize GitHub repository components (owner/name)
    # Allows alphanumeric, hyphens, underscores, and dots
    def sanitize_github_component(value)
      value.to_s.gsub(/[^a-zA-Z0-9\-_.]/, "")
    end

    # Sanitize GitHub repository full name (owner/repo)
    # Allows alphanumeric, hyphens, underscores, dots, and forward slash
    def sanitize_github_repo(value)
      value.to_s.gsub(/[^a-zA-Z0-9\-_.\/]/, "")
    end

    # Sanitize GitHub event types
    # Allows alphanumeric, hyphens, and underscores
    def sanitize_github_event(value)
      value.to_s.gsub(/[^a-zA-Z0-9\-_]/, "")
    end

    # Sanitize numeric IDs (e.g., comment IDs)
    # Allows only digits
    def sanitize_numeric_id(value)
      value.to_s.gsub(/[^0-9]/, "")
    end

    # Sanitize shell-dangerous characters for bash scripts
    # Removes backticks, dollar signs, parentheses, backslashes
    def sanitize_shell_path(value)
      value.to_s.gsub(/[`;$()\\]/, "")
    end

    # Validate and expand file path with security checks
    # Returns the expanded path or raises an error
    def safe_expand_path(path, allowed_base_path: nil)
      return nil unless path.present?

      expanded = File.expand_path(path)
      
      # If an allowed base path is provided, ensure the expanded path is within it
      if allowed_base_path
        allowed_base = File.expand_path(allowed_base_path)
        unless expanded.start_with?(allowed_base)
          raise SecurityError, "Path traversal detected: #{path}"
        end
      end

      expanded
    rescue => e
      raise SecurityError, "Invalid path: #{e.message}"
    end

    # Check if a path is within an allowed directory
    def path_within?(path, base_path)
      expanded_path = File.expand_path(path)
      expanded_base = File.expand_path(base_path)
      expanded_path.start_with?(expanded_base)
    end
  end
end