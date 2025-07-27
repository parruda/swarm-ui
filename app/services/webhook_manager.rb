# frozen_string_literal: true

class WebhookManager
  WEBHOOK_CHANGES_CHANNEL = "webhook_changes"
  WEBHOOK_EVENTS_CHANNEL = "webhook_events_changed"

  def initialize
    @running = true
    # For subscriptions, we need a dedicated connection outside the pool
    redis_config = Rails.application.config_for(:redis)
    @redis_sub = Redis.new(url: redis_config["url"])
    @threads = []
    setup_signal_handlers
  end

  def run
    Rails.logger.info("Starting Webhook Manager with Redis pub/sub")

    # Initial sync on startup
    sync_all_webhooks

    begin
      # Start Redis subscription in a separate thread
      @threads << Thread.new do
        Rails.logger.info("Starting Redis subscription thread")
        
        @redis_sub.subscribe(WEBHOOK_CHANGES_CHANNEL, WEBHOOK_EVENTS_CHANNEL) do |on|
          on.subscribe do |channel, subscriptions|
            Rails.logger.info("Subscribed to #{channel} (#{subscriptions} subscriptions)")
          end

          on.message do |channel, message|
            if @running
              Rails.logger.info("Received message on #{channel}: #{message}")
              case channel
              when WEBHOOK_CHANGES_CHANNEL
                handle_notification(message)
              when WEBHOOK_EVENTS_CHANNEL
                handle_events_changed(message)
              end
            end
          end

          on.unsubscribe do |channel, subscriptions|
            Rails.logger.info("Unsubscribed from #{channel} (#{subscriptions} subscriptions)")
          end
        end
      rescue => e
        Rails.logger.error("Redis subscription error: #{e.message}")
        Rails.logger.error(e.backtrace.join("\n"))
      end

      # Main thread for health checks
      while @running
        check_process_health
        sleep 5 # Check health every 5 seconds
      end
    rescue => e
      Rails.logger.error("WebhookManager error: #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
      raise
    ensure
      Rails.logger.info("WebhookManager shutting down...")
      
      # Stop Redis subscription
      @redis_sub.unsubscribe if @redis_sub
      
      # Wait for threads to finish
      @threads.each(&:join)
      
      # Stop all webhook processes
      stop_all_webhook_processes
      
      Rails.logger.info("WebhookManager shutdown complete")
    end
  end

  private

  def stop_all_webhook_processes
    Rails.logger.info("Stopping all webhook processes...")
    count = GithubWebhookProcess.where(status: "running").count
    Rails.logger.info("Found #{count} running webhook processes")

    GithubWebhookProcess.where(status: "running").find_each do |process|
      Rails.logger.info("Stopping webhook process #{process.pid} for project #{process.project_id}")
      WebhookProcessService.stop(process)
    end

    # Kill any orphaned gh processes
    kill_orphaned_gh_processes

    Rails.logger.info("All webhook processes stopped")
  end

  def setup_signal_handlers
    %w[INT TERM].each do |sig|
      Signal.trap(sig) do
        Rails.logger.info("Received #{sig} signal")
        @running = false
        @redis_sub.unsubscribe if @redis_sub
      end
    end
  end

  def handle_notification(payload)
    Rails.logger.info("Handling webhook change notification: #{payload}")
    
    begin
      data = JSON.parse(payload)
      project_id = data["project_id"]
      enabled = data["enabled"]

      if project_id
        if enabled
          ensure_process_running(project_id)
        else
          ensure_process_stopped(project_id)
        end
      end
    rescue JSON::ParserError => e
      Rails.logger.error("Failed to parse webhook notification: #{e.message}")
    end
  end

  def handle_events_changed(payload)
    Rails.logger.info("Handling events change notification: #{payload}")
    
    begin
      data = JSON.parse(payload)
      project_id = data["project_id"]
      
      if project_id
        # Restart the process to pick up new events
        project = Project.find_by(id: project_id)
        if project&.github_webhook_enabled?
          restart_process(project_id)
        end
      end
    rescue JSON::ParserError => e
      Rails.logger.error("Failed to parse events notification: #{e.message}")
    end
  end

  def kill_orphaned_gh_processes
    Rails.logger.info("Looking for orphaned gh webhook processes...")
    
    # Get all PIDs from our database
    known_pids = GithubWebhookProcess.where(status: "running").pluck(:pid).compact

    # Find all gh webhook forward processes
    ps_output = `ps aux | grep "[g]h webhook forward" | grep -v grep`
    
    orphaned_count = 0
    ps_output.each_line do |line|
      parts = line.split
      pid = parts[1].to_i
      
      # If this PID is not in our database, it's orphaned
      unless known_pids.include?(pid)
        Rails.logger.info("Found orphaned gh process with PID #{pid}, killing it")
        begin
          Process.kill("TERM", pid)
          orphaned_count += 1
        rescue Errno::ESRCH
          # Process already dead
        end
      end
    end
    
    Rails.logger.info("Found #{orphaned_count} gh webhook processes to check")
    
    # Also clean up any database records for dead processes
    GithubWebhookProcess.where(status: "running").find_each do |process|
      next unless process.pid
      
      begin
        # Check if process is still alive
        Process.kill(0, process.pid)
      rescue Errno::ESRCH
        # Process is dead, update the record
        Rails.logger.info("Process #{process.pid} is dead, updating record")
        process.update!(status: "stopped", stopped_at: Time.current)
      end
    end
  end

  def check_process_health
    Rails.logger.debug("Checking process health...")
    
    # Check each running process
    GithubWebhookProcess.includes(:project).where(status: "running").find_each do |process|
      WebhookProcessService.check_process(process)
      
      # Restart if needed
      if process.reload.status != "running" && process.project.github_webhook_enabled?
        Rails.logger.info("Process for project #{process.project_id} died, restarting...")
        ensure_process_running(process.project_id)
      end
    end
  rescue => e
    Rails.logger.error("Error in health check: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end

  def sync_all_webhooks
    Rails.logger.info("Syncing all webhook states")
    
    # Ensure processes are running for enabled webhooks
    Project.where(github_webhook_enabled: true).find_each do |project|
      ensure_process_running(project.id)
    end
    
    # Ensure processes are stopped for disabled webhooks
    Project.where(github_webhook_enabled: false).find_each do |project|
      ensure_process_stopped(project.id)
    end
    
    # Clean up any orphaned processes
    cleanup_orphaned_processes
  end

  def restart_process(project_id)
    Rails.logger.info("Restarting webhook process for project #{project_id}")
    
    # Stop existing process
    process = GithubWebhookProcess.find_by(project_id: project_id, status: "running")
    WebhookProcessService.stop(process) if process
    
    # Start new process
    ensure_process_running(project_id)
  end

  def ensure_process_running(project_id)
    # Check if process is already running
    existing = GithubWebhookProcess.find_by(project_id: project_id, status: "running")
    
    if existing
      # Verify it's actually alive
      WebhookProcessService.monitor_process(existing)
      return if existing.reload.status == "running"
    end
    
    # Start new process
    Rails.logger.info("Starting webhook process for project #{project_id}")
    WebhookProcessService.start(project_id)
  end

  def ensure_process_stopped(project_id)
    # Find any running processes for this project
    GithubWebhookProcess.where(project_id: project_id, status: "running").find_each do |process|
      Rails.logger.info("Stopping webhook process for project #{project_id}")
      WebhookProcessService.stop(process)
    end
  end

  def cleanup_orphaned_processes
    # Find processes marked as running but with no corresponding project webhook enabled
    GithubWebhookProcess.includes(:project).where(status: "running").find_each do |process|
      unless process.project&.github_webhook_enabled?
        Rails.logger.info("Cleaning up orphaned process for project #{process.project_id}")
        WebhookProcessService.stop(process)
      end
    end
  end
end