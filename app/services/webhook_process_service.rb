# frozen_string_literal: true

require "English"
require "timeout"

class WebhookProcessService
  class << self
    def start(project_or_id)
      project = project_or_id.is_a?(Project) ? project_or_id : Project.find(project_or_id)

      return unless project.github_webhook_enabled?
      return if project.github_webhook_processes.where(status: "running").exists?

      # Ensure we have repo owner and name
      unless project.github_repo_owner.present? && project.github_repo_name.present?
        Rails.logger.error("GitHub repo owner/name not set for project #{project.id}")
        return
      end

      # Get enabled events
      events = project.github_webhook_events.where(enabled: true).pluck(:event_type)
      if events.empty?
        Rails.logger.warn("No events enabled for project #{project.id}")
        return
      end

      process = project.github_webhook_processes.create!(
        status: "starting",
        started_at: Time.current,
      )

      begin
        # Build the webhook forward command
        # Sanitize repo owner and name to prevent command injection
        sanitized_owner = project.github_repo_owner.to_s.gsub(/[^a-zA-Z0-9\-_.]/, "")
        sanitized_name = project.github_repo_name.to_s.gsub(/[^a-zA-Z0-9\-_.]/, "")
        repo = "#{sanitized_owner}/#{sanitized_name}"
        
        # Sanitize event types
        sanitized_events = events.map { |e| e.to_s.gsub(/[^a-zA-Z0-9\-_]/, "") }
        events_str = sanitized_events.join(",")
        
        url = Rails.application.routes.url_helpers.github_webhooks_url(
          project_id: project.id,
          host: ENV.fetch("WEBHOOK_HOST", "localhost"),
          port: ENV.fetch("WEBHOOK_PORT", "3000"),
        )

        # Use array form with separate arguments for safety
        cmd = [
          "gh",
          "webhook",
          "forward",
          "--repo", repo,
          "--events", events_str,
          "--url", url,
        ]

        Rails.logger.info("Starting webhook forwarder for project #{project.id}: #{cmd.join(" ")}")

        # Spawn the process
        read_out, write_out = IO.pipe
        read_err, write_err = IO.pipe

        pid = Process.spawn(
          *cmd,
          out: write_out,
          err: write_err,
          pgroup: true, # Create new process group for easier management
        )

        Rails.logger.info("Spawned gh process with PID #{pid}, PGID: #{Process.getpgid(pid)}")

        write_out.close
        write_err.close

        process.update!(pid: pid, status: "running")

        # Start threads to capture output
        Thread.new { capture_output(read_out, process, "stdout") }
        Thread.new { capture_output(read_err, process, "stderr") }

        # Monitor process in background thread
        Thread.new { monitor_process(process) }

        Rails.logger.info("Webhook forwarder started for project #{project.id} with PID #{pid}")
      rescue => e
        Rails.logger.error("Failed to start webhook forwarder for project #{project.id}: #{e.message}")
        process.update!(status: "error", stopped_at: Time.current)
        raise
      end
    end

    def stop(process)
      return unless process.status == "running" && process.pid

      Rails.logger.info("Stopping webhook process PID #{process.pid}")

      begin
        # First, check if the process exists
        Process.kill(0, process.pid)
        Rails.logger.info("Process #{process.pid} is alive, sending SIGTERM to process group")

        # Send SIGTERM to the process group
        Process.kill("-TERM", process.pid)

        # Wait up to 2 seconds for graceful shutdown
        Timeout.timeout(2) do
          Process.waitpid(process.pid)
        end

        Rails.logger.info("Process #{process.pid} terminated gracefully")
      rescue Errno::ESRCH
        # Process already dead
        Rails.logger.info("Process #{process.pid} already terminated")
      rescue Errno::ECHILD
        # Child process already reaped
        Rails.logger.info("Process #{process.pid} already reaped")
      rescue Timeout::Error
        # Force kill if graceful shutdown failed
        Rails.logger.warn("Process #{process.pid} did not terminate within 2 seconds, force killing")
        begin
          # Kill the entire process group
          Process.kill("-KILL", process.pid)
          Rails.logger.info("Sent SIGKILL to process group #{process.pid}")

          # Try to reap the zombie process
          Process.waitpid(process.pid, Process::WNOHANG)
        rescue Errno::ESRCH
          Rails.logger.info("Process #{process.pid} died after SIGKILL")
        rescue => e
          Rails.logger.error("Error force killing process #{process.pid}: #{e.message}")
        end
      rescue => e
        Rails.logger.error("Error stopping process #{process.pid}: #{e.class} - #{e.message}")
      ensure
        process.update!(status: "stopped", stopped_at: Time.current)
      end
    end

    def stop_all_for_project(project)
      project.github_webhook_processes.where(status: "running").each do |process|
        stop(process)
      end
    end

    def restart(project)
      Rails.logger.info("Restarting webhook forwarder for project #{project.id}")

      # Stop any running processes
      stop_all_for_project(project)

      # Small delay to ensure process is fully stopped
      sleep(0.5)

      # Start with new configuration
      start(project)
    end

    def check_process(process)
      return unless process.status == "running" && process.pid

      begin
        # Check if the process exists
        Process.kill(0, process.pid)
        # Process is alive
      rescue Errno::ESRCH
        # Process is dead
        Rails.logger.info("Process #{process.pid} for project #{process.project_id} is dead")
        process.update!(status: "stopped", stopped_at: Time.current)
      rescue => e
        Rails.logger.error("Error checking process #{process.pid}: #{e.message}")
        process.update!(status: "error", stopped_at: Time.current)
      end
    end

    private

    def capture_output(io, process, stream_type)
      io.each_line do |line|
        Rails.logger.info("[Webhook #{process.project_id}/#{stream_type}] #{line.chomp}")
      end
    rescue => e
      Rails.logger.error("Output capture error for process #{process.id}: #{e.message}")
    ensure
      begin
        io.close
      rescue
        nil
      end
    end

    def monitor_process(process)
      Process.waitpid(process.pid)
      status = $CHILD_STATUS.exitstatus

      Rails.logger.info("Webhook forwarder for project #{process.project_id} exited with status #{status}")

      process.reload
      process.update!(status: "stopped", stopped_at: Time.current) if process.status == "running"
    rescue => e
      Rails.logger.error("Process monitor error for process #{process.id}: #{e.message}")
      process.update!(status: "error", stopped_at: Time.current)
    end
  end
end
