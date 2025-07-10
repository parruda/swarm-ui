# frozen_string_literal: true

require "English"
require "timeout"

class WebhookProcessService
  class << self
    def start(project)
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
        repo = "#{project.github_repo_owner}/#{project.github_repo_name}"
        events_str = events.join(",")
        url = Rails.application.routes.url_helpers.github_webhooks_url(
          project_id: project.id,
          host: ENV.fetch("WEBHOOK_HOST", "localhost"),
          port: ENV.fetch("WEBHOOK_PORT", "3000"),
        )

        cmd = [
          "gh",
          "webhook",
          "forward",
          "--repo=#{repo}",
          "--events=#{events_str}",
          "--url=#{url}",
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

      begin
        # Send SIGTERM to the process group
        Process.kill("-TERM", process.pid)

        # Wait up to 5 seconds for graceful shutdown
        Timeout.timeout(5) do
          Process.waitpid(process.pid)
        end
      rescue Errno::ESRCH
        # Process already dead
        Rails.logger.info("Process #{process.pid} already terminated")
      rescue Timeout::Error
        # Force kill if graceful shutdown failed
        Rails.logger.warn("Force killing process #{process.pid}")
        begin
          Process.kill("-KILL", process.pid)
        rescue
          nil
        end
      rescue => e
        Rails.logger.error("Error stopping process #{process.pid}: #{e.message}")
      ensure
        process.update!(status: "stopped", stopped_at: Time.current)
      end
    end

    def stop_all_for_project(project)
      project.github_webhook_processes.where(status: "running").each do |process|
        stop(process)
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
