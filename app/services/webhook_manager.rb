# frozen_string_literal: true

class WebhookManager
  def initialize
    @running = true
    setup_signal_handlers
  end

  def run
    Rails.logger.info("Starting Webhook Manager with PostgreSQL LISTEN")

    # Initial sync on startup
    sync_all_webhooks

    # Listen for changes
    connection = ActiveRecord::Base.connection.raw_connection

    begin
      connection.exec("LISTEN webhook_changes")
      connection.exec("LISTEN webhook_events_changed")
      Rails.logger.info("Listening for webhook changes...")

      while @running
        # Wait for notifications (with timeout for periodic health checks)
        connection.wait_for_notify(1) do |channel, _pid, payload|
          case channel
          when "webhook_changes"
            handle_notification(payload)
          when "webhook_events_changed"
            handle_events_changed(payload)
          end
        end

        # Periodic health check even without notifications
        check_process_health if @running
      end
    rescue => e
      Rails.logger.error("WebhookManager error: #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
      raise
    ensure
      Rails.logger.info("WebhookManager shutting down...")

      # Stop all webhook processes
      stop_all_webhook_processes

      # Cleanup PostgreSQL listeners
      begin
        connection.exec("UNLISTEN webhook_changes")
        connection.exec("UNLISTEN webhook_events_changed")
      rescue
        nil
      end

      Rails.logger.info("WebhookManager shutdown complete")
    end
  end

  private

  def setup_signal_handlers
    ["INT", "TERM", "QUIT"].each do |signal|
      Signal.trap(signal) do
        Rails.logger.info("Received #{signal} signal, shutting down WebhookManager...")
        @running = false
      end
    end
  end

  def stop_all_webhook_processes
    Rails.logger.info("Stopping all webhook processes...")

    # Get all running webhook processes
    running_processes = GithubWebhookProcess.where(status: "running")

    Rails.logger.info("Found #{running_processes.count} running webhook processes")

    running_processes.find_each do |process|
      Rails.logger.info("Stopping webhook process #{process.pid} for project #{process.project_id}")
      WebhookProcessService.stop(process)
    rescue => e
      Rails.logger.error("Error stopping process #{process.pid}: #{e.message}")
    end

    # Also kill any orphaned gh webhook processes that might not be tracked
    kill_orphaned_gh_processes

    Rails.logger.info("All webhook processes stopped")
  end

  def kill_orphaned_gh_processes
    # Find any gh webhook forward processes that might be orphaned
    Rails.logger.info("Looking for orphaned gh webhook processes...")

    # First try pgrep if available
    pids = []

    # Try to find gh processes - look for both "gh webhook" and just "gh" with webhook args
    begin
      gh_pids = %x(pgrep -f "gh.*webhook.*forward").strip.split("\n").map(&:to_i).reject(&:zero?)
      pids.concat(gh_pids)
    rescue
      # pgrep not available, fall back to ps
      output = %x(ps aux | grep -E "gh.*webhook.*forward" | grep -v grep)
      output.each_line do |line|
        parts = line.split
        pids << parts[1].to_i
      end
    end

    Rails.logger.info("Found #{pids.size} gh webhook processes to check")

    # Kill ALL gh webhook processes, even tracked ones during shutdown
    pids.uniq.each do |pid|
      Rails.logger.warn("Killing gh webhook process with PID #{pid}")
      begin
        # Try graceful first
        Process.kill("TERM", pid)
        sleep(0.2)

        # Check if still alive and force kill
        Process.kill(0, pid)
        Rails.logger.warn("Process #{pid} still alive after TERM, sending KILL")
        Process.kill("KILL", pid)
      rescue Errno::ESRCH
        Rails.logger.info("Process #{pid} successfully terminated")
      end
    end

    # Also clean up any webhook processes that claim to be running but have no process
    GithubWebhookProcess.where(status: "running").find_each do |process|
      Process.kill(0, process.pid)
      Rails.logger.info("Database process #{process.pid} is still running, killing it")
      Process.kill("TERM", process.pid)
      sleep(0.2)
      Process.kill("KILL", process.pid)
    rescue Errno::ESRCH
      Rails.logger.warn("Database shows process #{process.pid} as running but it's dead, updating status")
      process.update!(status: "stopped", stopped_at: Time.current)
    end
  rescue => e
    Rails.logger.error("Error killing orphaned processes: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end

  def handle_notification(payload)
    data = JSON.parse(payload)
    project_id = data["project_id"]
    enabled = data["enabled"]

    Rails.logger.info("Received webhook change: Project #{project_id}, enabled: #{enabled}")

    project = Project.find(project_id)

    if enabled
      ensure_process_running(project)
    else
      ensure_process_stopped(project)
    end
  rescue => e
    Rails.logger.error("Error handling notification: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end

  def handle_events_changed(project_id)
    Rails.logger.info("Received webhook events change for project #{project_id}")

    project = Project.find(project_id)

    # Only restart if webhook is enabled and running
    if project.github_webhook_enabled? && project.webhook_running?
      Rails.logger.info("Restarting webhook forwarder with updated events for project #{project_id}")
      WebhookProcessService.restart(project)
    end
  rescue => e
    Rails.logger.error("Error handling events changed notification: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end

  def sync_all_webhooks
    Rails.logger.info("Syncing all webhook states")

    # Start webhooks that should be running
    Project.where(github_webhook_enabled: true).find_each do |project|
      ensure_process_running(project)
    end

    # Stop webhooks that shouldn't be running
    Project.where(github_webhook_enabled: false).find_each do |project|
      ensure_process_stopped(project)
    end

    # Clean up orphaned processes
    cleanup_orphaned_processes
  end

  def check_process_health
    # Check if any running processes have died unexpectedly
    GithubWebhookProcess.where(status: "running").find_each do |process|
      Process.kill(0, process.pid) # Check if process exists
    rescue Errno::ESRCH
      # Process doesn't exist
      Rails.logger.warn("Process #{process.pid} for project #{process.project_id} is dead, updating status")
      process.update!(status: "stopped", stopped_at: Time.current)

      # Restart if webhook is still enabled
      if process.project.github_webhook_enabled?
        Rails.logger.info("Restarting webhook for project #{process.project_id}")
        ensure_process_running(process.project)
      end
    rescue => e
      Rails.logger.error("Error checking process #{process.pid}: #{e.message}")
    end
  end

  def ensure_process_running(project)
    current_process = project.github_webhook_processes.where(status: "running").first

    if current_process
      # Verify it's actually running
      begin
        Process.kill(0, current_process.pid)
        Rails.logger.debug("Webhook process for project #{project.id} already running (PID: #{current_process.pid})")
        return
      rescue Errno::ESRCH
        Rails.logger.info("Dead process found for project #{project.id}, cleaning up")
        current_process.update!(status: "stopped", stopped_at: Time.current)
      end
    end

    # Start new process
    Rails.logger.info("Starting webhook process for project #{project.id}")
    WebhookProcessService.start(project)
  rescue => e
    Rails.logger.error("Failed to ensure process running for project #{project.id}: #{e.message}")
  end

  def ensure_process_stopped(project)
    project.github_webhook_processes.where(status: "running").each do |process|
      Rails.logger.info("Stopping webhook process #{process.pid} for project #{project.id}")
      WebhookProcessService.stop(process)
    end
  end

  def cleanup_orphaned_processes
    # Mark any processes as stopped if they don't have a running PID
    GithubWebhookProcess.where(status: "running").find_each do |process|
      Process.kill(0, process.pid)
    rescue Errno::ESRCH
      Rails.logger.info("Cleaning up orphaned process record #{process.id}")
      process.update!(status: "stopped", stopped_at: Time.current)
    end
  end
end
