# frozen_string_literal: true

# Service to validate file paths for local single-user application
# Focus is on preventing accidental access to system files, not security attacks
class FileSecurityService
  # Patterns to prevent accidental system damage
  DANGEROUS_PATTERNS = [
    %r{\.\./}, # Parent directory traversal
    %r{^/(?!Users/#{ENV["USER"]})}, # Paths outside user home (Mac)
    %r{^/(?!home/#{ENV["USER"]})}, # Paths outside user home (Linux)
    %r{\.git/}, # Git internals
    /\.(ssh|aws|env)/, # Sensitive config files
  ].freeze

  # Protected system directories
  PROTECTED_PATHS = [
    "/System",
    "/usr",
    "/bin",
    "/sbin",
    "/etc",
    "~/.ssh",
    "~/.aws",
    "~/.config",
  ].map { |p| File.expand_path(p) }.freeze

  MAX_FILE_SIZE = 10.megabytes

  class << self
    def validate_path(base_dir, requested_path)
      full_path = File.expand_path(requested_path, base_dir)

      # Must be within base directory
      unless full_path.start_with?(File.expand_path(base_dir))
        raise "Path outside session directory"
      end

      # Check against dangerous patterns
      if DANGEROUS_PATTERNS.any? { |pattern| full_path.match?(pattern) }
        raise "Path contains dangerous pattern"
      end

      # Check against protected paths
      if PROTECTED_PATHS.any? { |protected| full_path.start_with?(protected) }
        raise "Path is in protected directory"
      end

      # Check file size for read operations
      if File.exist?(full_path) && File.size(full_path) > MAX_FILE_SIZE
        raise "File too large (max #{MAX_FILE_SIZE / 1.megabyte}MB)"
      end

      full_path
    end

    def safe_for_tmux(text)
      # Escape characters that could cause issues with tmux send-keys
      text.gsub('"', '\"').gsub("$", '\$').gsub("`", '\`')
    end
  end
end
