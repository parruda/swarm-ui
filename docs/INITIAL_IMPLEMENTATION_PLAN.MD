# Claude Swarm Rails UI Plan

## Overview

This document outlines the plan for building a Rails application with Tailwind CSS and PostgreSQL to serve as a web-based UI for Claude Swarm. The application will provide a modern interface for launching and managing Claude Swarm sessions, with real-time monitoring and web-based terminal access.

## Core Requirements

1. **Directory Selection**: Browse and select directories on the local machine (Git repositories or regular directories)
2. **Swarm Launching**: Launch swarms with optional Git worktrees for repository isolation
3. **Web Terminal**: Access main instance through web-based terminal interface
4. **Session Management**: Run multiple concurrent sessions with easy switching
5. **Session Monitoring**: Real-time visibility into instance activities through log parsing
6. **State Persistence**: Sessions persist across page refreshes

## Architecture Design

### Database Strategy

The Rails app will store configurations and templates while still reading most runtime data from Claude Swarm's session files:

**Database Schema** (PostgreSQL):

The database schema stores UI-specific data while relying on claude-swarm's file system for runtime state. This hybrid approach ensures the UI can function without modifying claude-swarm while providing persistent configuration management.

```sql
-- sessions table (lightweight tracking)
-- Purpose: Tracks sessions launched through the UI and discovered sessions from the file system.
-- The UI enriches file-based sessions with additional metadata like tmux session names and output files.
-- This table acts as a cache and enhancement layer over the file-based session data.
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  session_path TEXT NOT NULL,
  swarm_configuration_id INTEGER REFERENCES swarm_configurations(id),
  swarm_name VARCHAR(255),
  mode VARCHAR(50) DEFAULT 'interactive',
  status VARCHAR(50) DEFAULT 'active',
  tmux_session VARCHAR(255),
  output_file TEXT,
  pid INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- swarm_configurations table (saved swarm configs)
-- Purpose: Stores reusable swarm configurations that users create through the UI.
-- These can be used to quickly launch new sessions without recreating YAML files.
-- The config_yaml field stores the complete claude-swarm YAML configuration.
CREATE TABLE swarm_configurations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  config_yaml TEXT NOT NULL,              -- Full YAML configuration
  is_template BOOLEAN DEFAULT false,      -- Mark as reusable template
  before TEXT[],                          -- Array of commands to run before launch (swarm-level)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- instance_templates table (reusable instance definitions)
-- Purpose: Provides a library of pre-configured instance types (frontend, backend, etc.)
-- that users can drag-and-drop into their swarm configurations.
-- Supports both Claude and OpenAI instances with appropriate configuration fields.
CREATE TABLE instance_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  instance_type VARCHAR(100),             -- e.g., 'frontend', 'backend', 'devops'
  model VARCHAR(50) DEFAULT 'sonnet',     -- Default is 'sonnet' not 'opus'
  prompt TEXT,
  allowed_tools TEXT[],                   -- Array of tool names
  disallowed_tools TEXT[],                -- Array of disallowed tool names
  vibe BOOLEAN DEFAULT false,
  provider VARCHAR(50) DEFAULT 'claude',
  temperature DECIMAL(3,2),               -- For OpenAI instances (default: 0.3)
  api_version VARCHAR(50),                -- For OpenAI: 'chat_completion' or 'responses'
  openai_token_env VARCHAR(100),          -- For OpenAI: env var name (default: OPENAI_API_KEY)
  base_url TEXT,                          -- For OpenAI: custom API base URL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- swarm_instance_templates (many-to-many join)
-- Purpose: Links instance templates to swarm configurations, allowing templates
-- to be reused across multiple swarms with instance-specific overrides.
CREATE TABLE swarm_instance_templates (
  id SERIAL PRIMARY KEY,
  swarm_configuration_id INTEGER REFERENCES swarm_configurations(id) ON DELETE CASCADE,
  instance_template_id INTEGER REFERENCES instance_templates(id),
  instance_name VARCHAR(255) NOT NULL,    -- Name used in this swarm
  directory TEXT,                         -- Can override template directory (supports JSON array)
  connections TEXT[],                     -- Array of other instance names
  UNIQUE(swarm_configuration_id, instance_name)
);

-- directories table (for quick access)
-- Purpose: Tracks frequently used directories for quick selection in the UI.
-- Stores the last selected swarm configuration for each directory.
-- Directories can be Git repositories or regular folders.
CREATE TABLE directories (
  id SERIAL PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name VARCHAR(255),
  is_git_repository BOOLEAN DEFAULT false,
  default_swarm_configuration_id INTEGER REFERENCES swarm_configurations(id),
  last_accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Rails UI App                          │
├─────────────────────────────────────────────────────────────┤
│  Controllers          │  Services              │  Jobs       │
│  ├─ SessionsController│  ├─ SwarmLauncher     │  ├─ LogJob  │
│  ├─ RepositoriesCtrl  │  ├─ SessionReader     │  └─ StatusJob│
│  └─ TerminalsCtrl     │  └─ LogParser         │             │
├─────────────────────────────────────────────────────────────┤
│                    ActionCable (WebSockets)                  │
├─────────────────────────────────────────────────────────────┤
│                    Claude Swarm Integration                  │
│  ├─ System calls to claude-swarm CLI                        │
│  ├─ File system access to ~/.claude-swarm/sessions/         │
│  └─ Process management via PID tracking                     │
└─────────────────────────────────────────────────────────────┘
```

## Feature Implementation Plan

### Phase 1: Core Infrastructure

1. **Rails Setup**
   - Rails 8.x with Turbo and Stimulus
   - Tailwind CSS for styling  
   - PostgreSQL 17 for session tracking and configuration storage
   - ActionCable for real-time updates (using PostgreSQL adapter)
   - Solid Queue for background job processing (Rails 8 default)
   - simple_form for form handling

2. **Directory Browser**
   - File system browser component (Stimulus)
   - Directory tree navigation
   - Recent directories list
   - Git repository detection (for worktree support)
   - Support for non-Git directories

3. **Swarm Configuration Interface**
   - YAML editor with syntax highlighting
   - Visual configuration builder
   - Template management
   - Validation before launch

### Phase 2: Configuration Management

1. **Swarm Configuration Builder**
   - Visual YAML builder interface
   - Drag-and-drop instance templates
   - Connection drawing tool
   - Live YAML preview
   - Save configurations to database

2. **Instance Template Library**
   - Pre-built templates (frontend, backend, devops, etc.)
   - Custom template creation
   - Template marketplace (future)
   - Version control for templates

3. **Configuration Features**
   - Clone existing configurations
   - Export/import YAML files
   - Share configurations between users
   - Configuration versioning

### Phase 3: Session Management

1. **Swarm Launcher Service**
   - Execute `claude-swarm` command with proper arguments
   - Use saved configurations or templates
   - Capture session ID (format: YYYYMMDD_HHMMSS) and path
   - Track process PIDs
   - Handle worktree creation (--worktree accepts optional value)
     - Only creates worktrees for Git repositories
     - Non-Git directories are used as-is
   - Support global vibe mode (--vibe flag at swarm level)
   - Support debug mode (--debug flag)
   - Handle --stream-logs flag for non-interactive mode

2. **Session Tracking**
   - Monitor `~/.claude-swarm/run/` for active sessions
   - Parse session metadata files
   - Track session status (active/completed)
   - Clean up orphaned sessions

3. **Session Switcher**
   - Tab-based interface for multiple sessions
   - Session state preservation
   - Quick session overview cards

4. **Session Restoration**
   - List restorable sessions with metadata
   - Support `--session-id` flag for restoration
   - Display claude_session_id from state files
   - Show warning about partial context restoration
   - Handle worktree restoration automatically

### Phase 4: Web Terminal Integration

1. **Terminal Implementation**
   - Use xterm.js for terminal emulation
   - WebSocket connection via ActionCable
   - PTY process spawning on backend
   - Connect to main Claude instance

2. **Terminal Features**
   - Full terminal emulation
   - Copy/paste support
   - Terminal resize handling
   - Session persistence

## Web Terminal Implementation Details

### Overview

The web terminal will provide browser-based access to the main Claude instance of each swarm session. This requires careful coordination between the frontend terminal emulator, WebSocket communication, and backend process management.

### Session File Structure (Verified)

Each claude-swarm session creates the following structure:
```
~/.claude-swarm/sessions/{project}/{timestamp}/
├── config.yml                    # Copy of original swarm configuration
├── session_metadata.json         # Session metadata with timestamps and worktree info
├── session.log                   # Plain text log file with human-readable logs
├── session.log.json             # JSONL format with structured events (one JSON per line)
├── start_directory              # Text file with original working directory
├── [instance_name].mcp.json     # MCP configuration for each instance
├── state/                       # Instance state directory
│   └── [instance_id].json       # State file per instance with claude_session_id
└── pids/                        # Process tracking directory
    └── [pid]                    # File per process (content is process name)
```

Note: Project folder names use `+` as separator for path components (e.g., `Users+paulo+project`).

### Architecture

```
┌─────────────────────┐     WebSocket      ┌─────────────────────┐
│   Browser (User)    │ <───────────────> │    Rails Backend    │
├─────────────────────┤                    ├─────────────────────┤
│  xterm.js Terminal  │                    │  ActionCable Channel│
│  - Renders terminal │                    │  - Routes I/O       │
│  - Handles input    │                    │  - Manages state    │
│  - Display output   │                    ├─────────────────────┤
└─────────────────────┘                    │   PTY Process       │
                                           │  - Spawns shell     │
                                           │  - Attaches to      │
                                           │    Claude session   │
                                           └─────────────────────┘
```

### Implementation Approach

#### Option 1: Direct Claude Process Attachment (Recommended)

This approach attaches directly to the running Claude instance:

**Backend Implementation:**

This service demonstrates the challenge of attaching to Claude instances. Since Claude Code runs interactively and expects a real terminal, direct process attachment is complex. This implementation shows a theoretical approach, but the recommended solution (implemented later) is to launch all sessions through tmux from the start.

```ruby
# app/services/terminal_service.rb
require 'pty'
require 'io/console'

class TerminalService
  def initialize(session_id)
    @session = Session.find_by!(session_id: session_id)
    @session_path = @session.session_path
  end
  
  def attach_to_claude
    # Read the main instance PID from session files
    main_instance = read_main_instance_info
    pid = read_claude_pid(main_instance[:instance_id])
    
    # Use screen or tmux to attach to the Claude process
    # This assumes Claude was launched within a screen/tmux session
    PTY.spawn("screen -x claude-swarm-#{@session.session_id}") do |stdout, stdin, pid|
      @pty_out = stdout
      @pty_in = stdin
      @pty_pid = pid
    end
  end
  
  private
  
  def read_main_instance_info
    config = YAML.load_file(File.join(@session_path, 'config.yml'))
    main_name = config['swarm']['main']
    
    # Find instance ID from state files
    state_files = Dir[File.join(@session_path, 'state', '*.json')]
    state_files.each do |file|
      data = JSON.parse(File.read(file))
      return { name: main_name, instance_id: data['instance_id'] } if file.include?(main_name)
    end
  end
  
  def read_claude_pid(instance_id)
    # PIDs are stored in the pids/ directory
    pid_files = Dir[File.join(@session_path, 'pids', '*')]
    # Logic to match PID with instance
  end
end
```

**Challenge:** Claude Code runs interactively and expects a real terminal. We need to either:
1. Launch Claude initially within a multiplexer (screen/tmux)
2. Use process attachment techniques
3. Modify claude-swarm to support a "headless" mode

#### Option 2: Proxy-Based Approach (More Flexible)

Create a proxy that sits between the web terminal and Claude:

**Backend Implementation:**

This proxy service creates a bridge between the web terminal and the Claude session. It manages a pseudo-terminal (PTY) that connects to the tmux session where Claude is running. The service handles bidirectional I/O between the web client and the terminal process.

```ruby
# app/services/claude_terminal_proxy.rb
class ClaudeTerminalProxy
  def initialize(session_id)
    @session = Session.find_by!(session_id: session_id)
    @session_path = @session.session_path
  end
  
  def start
    # Create a new PTY for the web terminal
    PTY.spawn(build_command) do |stdout, stdin, pid|
      @pty_out = stdout
      @pty_in = stdin
      @pty_pid = pid
      
      # Set up non-blocking I/O
      @pty_out.nonblock = true
      @pty_in.nonblock = true
    end
  end
  
  def write(data)
    @pty_in.write(data) if @pty_in
  end
  
  def read
    @pty_out.read_nonblock(1024) if @pty_out
  rescue IO::WaitReadable
    nil
  end
  
  private
  
  def build_command
    # Option 1: Attach to existing screen/tmux session
    "screen -r claude-swarm-#{@session.session_id}"
    
    # Option 2: Create a new Claude instance that connects to existing session
    # This would require claude-swarm to support a "terminal" mode
    # "claude-swarm terminal --session-id #{@session.session_id}"
  end
end
```

**ActionCable Channel:**

This WebSocket channel manages the real-time bidirectional communication between the browser and the terminal session. It spawns a reader thread that continuously monitors the terminal output and broadcasts it to the client. Input from the client is decoded and written to the terminal. The channel properly cleans up resources when the client disconnects.

```ruby
# app/channels/terminal_channel.rb
class TerminalChannel < ApplicationCable::Channel
  def subscribed
    @session_id = params[:session_id]
    @terminal = ClaudeTerminalProxy.new(@session_id)
    @terminal.start
    
    stream_from "terminal_#{@session_id}"
    
    # Start reading output
    @reader_thread = Thread.new do
      loop do
        if output = @terminal.read
          ActionCable.server.broadcast("terminal_#{@session_id}", {
            type: 'output',
            data: Base64.encode64(output)
          })
        end
        sleep 0.01
      end
    end
  end
  
  def input(data)
    decoded = Base64.decode64(data['data'])
    @terminal.write(decoded)
  end
  
  def resize(data)
    # Handle terminal resize
    @terminal.resize(data['cols'], data['rows'])
  end
  
  def unsubscribed
    @reader_thread&.kill
    @terminal&.stop
  end
end
```

**Frontend Implementation:**

This Stimulus controller manages the xterm.js terminal emulator in the browser. It creates a terminal interface, establishes a WebSocket connection via ActionCable, and handles all terminal interactions. The controller manages terminal resizing, input/output, and proper cleanup when the user navigates away.

```javascript
// app/javascript/controllers/terminal_controller.js
import { Controller } from "@hotwired/stimulus"
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import consumer from "../channels/consumer"

export default class extends Controller {
  connect() {
    this.terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4'
      }
    })
    
    // Add addons
    this.fitAddon = new FitAddon()
    this.terminal.loadAddon(this.fitAddon)
    this.terminal.loadAddon(new WebLinksAddon())
    
    // Open terminal in container
    this.terminal.open(this.element)
    this.fitAddon.fit()
    
    // Set up WebSocket connection
    this.setupWebSocket()
    
    // Handle terminal input
    this.terminal.onData(data => {
      if (this.channel) {
        this.channel.perform('input', { 
          data: btoa(data) // Base64 encode
        })
      }
    })
    
    // Handle resize
    window.addEventListener('resize', () => this.handleResize())
  }
  
  setupWebSocket() {
    const sessionId = this.element.dataset.sessionId
    
    this.subscription = consumer.subscriptions.create(
      { 
        channel: "TerminalChannel",
        session_id: sessionId 
      },
      {
        connected: () => {
          console.log("Terminal connected")
          this.channel = this.subscription
        },
        
        received: (data) => {
          if (data.type === 'output') {
            const decoded = atob(data.data)
            this.terminal.write(decoded)
          }
        }
      }
    )
  }
  
  handleResize() {
    this.fitAddon.fit()
    const dimensions = this.fitAddon.proposeDimensions()
    
    if (this.channel && dimensions) {
      this.channel.perform('resize', {
        cols: dimensions.cols,
        rows: dimensions.rows
      })
    }
  }
  
  disconnect() {
    this.subscription?.unsubscribe()
    this.terminal?.dispose()
  }
}
```

### Solution: Rails-Side Terminal Management (No claude-swarm changes needed!)

The Rails app can handle all terminal multiplexer integration without any changes to claude-swarm:

#### Implementation: Rails Launches Claude in Interactive or Non-Interactive Mode

This is the core service that launches claude-swarm sessions. It supports two modes:
- **Interactive Mode**: Launches claude-swarm inside a tmux session, allowing full terminal access through the web UI
- **Non-Interactive Mode**: Launches claude-swarm with a prompt (-p flag), captures output to a file, and terminates when complete

The service handles configuration file creation, session tracking, and proper error handling. It also updates session metadata to enable proper restoration later.

```ruby
# app/services/swarm_launcher.rb
class SwarmLauncher
  def initialize(options = {})
    @options = options
    @session_id = Time.now.strftime("%Y%m%d_%H%M%S")
    @mode = options[:mode] || 'interactive'
    
    # Handle different configuration sources
    @config_path = case options[:configuration_source]
    when 'saved'
      create_temp_config_from_saved
    when 'file'
      options[:config_path]
    else
      raise "Invalid configuration source"
    end
  end
  
  def launch
    case @mode
    when 'interactive'
      launch_interactive
    when 'non-interactive'
      launch_non_interactive
    else
      raise "Invalid mode: #{@mode}"
    end
  end
  
  private
  
  def create_temp_config_from_saved
    config = SwarmConfiguration.find(@options[:swarm_configuration_id])
    temp_path = Rails.root.join('tmp', 'configs', "#{@session_id}.yml")
    FileUtils.mkdir_p(File.dirname(temp_path))
    config.to_file(temp_path)
    temp_path.to_s
  end
  
  def launch_interactive
    unless tmux_available?
      raise "tmux is required for interactive mode. Please install tmux."
    end
    
    session_name = "claude-swarm-#{@session_id}"
    
    # Build claude-swarm command
    cmd = build_claude_command(interactive: true)
    
    # Create detached tmux session
    tmux_cmd = [
      "tmux", "new-session", "-d", "-s", session_name,
      "-c", @options[:directory] || Dir.pwd,
      cmd
    ]
    
    success = system(*tmux_cmd)
    
    if success
      # Wait for session directory to be created
      session_path = wait_for_session_path
      
      # Save session info
      Session.create!(
        session_id: @session_id,
        session_path: session_path,
        tmux_session: session_name,
        mode: 'interactive',
        status: "active"
      )
      
      # Update session metadata with mode for restoration
      update_session_metadata(session_path, mode: 'interactive')
      
      @session_id
    else
      raise "Failed to launch Claude Swarm in tmux"
    end
  end
  
  def launch_non_interactive
    # Build claude-swarm command with -p flag
    cmd = build_claude_command(interactive: false)
    
    # Create output log file
    output_file = Rails.root.join('tmp', 'swarm_outputs', "#{@session_id}.log")
    FileUtils.mkdir_p(File.dirname(output_file))
    
    # Launch in background with output capture
    pid = spawn(*cmd, out: output_file, err: output_file)
    Process.detach(pid)
    
    # Wait for session directory to be created
    session_path = wait_for_session_path
    
    # Save session info
    Session.create!(
      session_id: @session_id,
      session_path: session_path,
      mode: 'non-interactive',
      output_file: output_file.to_s,
      pid: pid,
      status: "active"
    )
    
    # Update session metadata with mode and prompt for restoration
    update_session_metadata(session_path, mode: 'non-interactive', prompt: @options[:prompt])
    
    # Start background job to monitor completion
    MonitorNonInteractiveSessionJob.perform_later(@session_id)
    
    @session_id
  end
  
  def update_session_metadata(session_path, additional_data = {})
    metadata_file = File.join(session_path, "session_metadata.json")
    
    # Wait a bit for claude-swarm to create the file
    retries = 0
    while !File.exist?(metadata_file) && retries < 10
      sleep 0.1
      retries += 1
    end
    
    if File.exist?(metadata_file)
      metadata = JSON.parse(File.read(metadata_file))
      metadata.merge!(additional_data.stringify_keys)
      File.write(metadata_file, JSON.pretty_generate(metadata))
    else
      Rails.logger.warn "Could not update session metadata - file not found"
    end
  end
  
  def build_claude_command(interactive: true)
    cmd = ["claude-swarm"]  # defaults to 'start' command
    cmd << "--config" << @config_path
    if @options[:worktree]
      cmd << "--worktree"
      cmd << @options[:worktree] unless @options[:worktree] == true
    end
    
    if interactive
      # Interactive mode - no -p flag needed
    else
      # Non-interactive mode with prompt
      raise "Prompt required for non-interactive mode" unless @options[:prompt]
      cmd << "-p" << @options[:prompt]
      cmd << "--stream-logs"  # Stream output to stdout for capture
    end
    
    cmd  # Return array, not string
  end
  
  def wait_for_session_path(timeout = 10)
    # Claude swarm creates session directories predictably
    # Monitor ~/.claude-swarm/run/ for new symlinks (active sessions)
    start_time = Time.now
    
    while Time.now - start_time < timeout
      latest = Dir.glob(File.expand_path("~/.claude-swarm/run/*"))
                  .max_by { |f| File.mtime(f) }
      
      if latest && File.mtime(latest) > start_time
        return File.readlink(latest) # Follow symlink to actual session
      end
      
      sleep 0.1
    end
    
    raise "Timeout waiting for session to start"
  end
  
  def tmux_available?
    system("which tmux > /dev/null 2>&1")
  end
end
```

#### Output Viewing for Both Modes

These services handle terminal attachment and output streaming for both interactive and non-interactive sessions:

- **TerminalAttachmentService**: Manages the connection to tmux sessions for interactive mode and checks session health
- **OutputStreamer**: Provides a unified interface for streaming output from both tmux sessions (interactive) and log files (non-interactive)

```ruby
# app/services/terminal_attachment_service.rb
class TerminalAttachmentService
  def initialize(session_id)
    @session = Session.find_by!(session_id: session_id)
  end
  
  def create_attachment_pty
    raise "Cannot attach to non-interactive session" if @session.mode == 'non-interactive'
    
    # Attach to tmux session
    PTY.spawn("tmux", "attach-session", "-t", @session.tmux_session)
  end
  
  def session_exists?
    case @session.mode
    when 'interactive'
      system("tmux has-session -t #{@session.tmux_session} 2>/dev/null")
    when 'non-interactive'
      @session.pid && Process.kill(0, @session.pid) rescue false
    end
  end
  
  def kill_session
    case @session.mode
    when 'interactive'
      system("tmux kill-session -t #{@session.tmux_session}")
    when 'non-interactive'
      Process.kill('TERM', @session.pid) rescue nil
    end
  end
end

# app/services/output_streamer.rb
class OutputStreamer
  def initialize(session)
    @session = session
  end
  
  def stream_output(&block)
    case @session.mode
    when 'interactive'
      # For interactive sessions, capture from tmux
      TmuxManager.new(@session.tmux_session).capture_pane.each_line(&block)
    when 'non-interactive'
      # For non-interactive, tail the output file
      File.open(@session.output_file, 'r') do |file|
        file.each_line(&block)
        
        # Continue tailing if still running
        if @session.status == 'active'
          file.seek(0, IO::SEEK_END)
          loop do
            line = file.gets
            if line
              block.call(line)
            else
              sleep 0.1
              break unless session_still_active?
            end
          end
        end
      end
    end
  end
  
  private
  
  def session_still_active?
    @session.reload.status == 'active'
  end
end
```

#### Configuration Management UI

This view displays saved swarm configurations in a card layout. Users can launch new sessions from saved configurations, edit them, or clone them for variations. The UI emphasizes the most common action (Launch) with a prominent green button.

```erb
<!-- app/views/configurations/index.html.erb -->
<div class="container mx-auto p-6">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold">Swarm Configurations</h1>
    <div class="flex gap-2">
      <%= link_to "New Configuration", new_configuration_path, 
          class: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" %>
      <%= link_to "Instance Templates", instance_templates_path,
          class: "px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700" %>
    </div>
  </div>
  
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <% @configurations.each do |config| %>
      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="font-semibold text-lg"><%= config.name %></h3>
        <p class="text-gray-600 text-sm mb-3"><%= config.description %></p>
        
        <div class="text-sm text-gray-500 mb-3">
          <%= pluralize(config.instance_count, 'instance') %> •
          <%= config.is_template ? "Template" : "Configuration" %>
        </div>
        
        <div class="flex gap-2">
          <%= link_to "Launch", new_session_path(configuration_id: config.id),
              class: "px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700" %>
          <%= link_to "Edit", edit_configuration_path(config),
              class: "px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700" %>
          <%= link_to "Clone", clone_configuration_path(config), method: :post,
              class: "px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700" %>
        </div>
      </div>
    <% end %>
  </div>
</div>
```

This configuration editor provides a dual-interface approach:
- **Visual Builder**: A drag-and-drop interface where users can add instance templates and draw connections between them
- **YAML Editor**: Direct YAML editing with syntax highlighting for power users

The two interfaces stay synchronized, allowing users to switch between visual and code editing seamlessly.

```erb
<!-- app/views/configurations/edit.html.erb -->
<div class="container mx-auto p-6">
  <h1 class="text-2xl font-bold mb-6">Edit Configuration: <%= @configuration.name %></h1>
  
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Visual Builder -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-4">Visual Builder</h2>
      
      <div id="swarm-builder" 
           data-controller="swarm-builder"
           data-configuration="<%= @configuration.to_json %>"
           class="h-96 border-2 border-dashed border-gray-300 rounded relative">
        <!-- Instance nodes and connections rendered here -->
      </div>
      
      <div class="mt-4">
        <h3 class="font-medium mb-2">Available Templates</h3>
        <div class="grid grid-cols-2 gap-2">
          <% @instance_templates.each do |template| %>
            <div class="bg-gray-100 p-2 rounded cursor-pointer hover:bg-gray-200"
                 data-template-id="<%= template.id %>"
                 data-action="dragstart->swarm-builder#startDrag">
              <div class="font-medium text-sm"><%= template.name %></div>
              <div class="text-xs text-gray-600"><%= template.instance_type %></div>
            </div>
          <% end %>
        </div>
      </div>
    </div>
    
    <!-- YAML Editor -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-4">YAML Configuration</h2>
      
      <%= simple_form_for @configuration do |f| %>
        <%= f.input :name, as: :hidden %>
        <%= f.input :description, as: :hidden %>
        
        <%= f.input :config_yaml, 
            label: false,
            input_html: { 
              rows: 25,
              class: "font-mono text-sm",
              data: { controller: "yaml-editor" } 
            } %>
        
        <div class="flex justify-between">
          <%= f.button :submit, "Save Configuration", 
              class: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" %>
          <%= link_to "Export YAML", export_configuration_path(@configuration),
              class: "px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700" %>
        </div>
      <% end %>
    </div>
  </div>
</div>
```

#### UI Components for Mode Selection

This form is the main entry point for launching new swarm sessions. It provides:
- Repository selection with a directory picker
- Configuration source selection (file, saved, or new)
- Mode selection between interactive (terminal access) and non-interactive (prompt-based)
- Dynamic form fields that show/hide based on selections
- Worktree option for Git isolation

The form uses Stimulus controllers to provide dynamic behavior without page reloads.

```erb
<!-- app/views/sessions/new.html.erb -->
<%= simple_form_for :session, url: sessions_path, html: { data: { turbo: false } } do |f| %>
  <div class="space-y-6">
    <!-- Directory Selection -->
    <%= f.input :directory_path, 
        label: "Working Directory",
        placeholder: "/path/to/directory",
        hint: "Can be any directory (Git repository or regular folder)",
        input_html: { 
          data: { controller: "directory-picker" } 
        } %>
    
    <!-- Configuration Selection -->
    <%= f.input :configuration_source, 
        label: "Configuration",
        as: :radio_buttons,
        collection: [
          ['file', 'Use configuration file from repository'],
          ['saved', 'Use saved configuration'],
          ['new', 'Create new configuration']
        ],
        label_method: :last,
        value_method: :first,
        checked: 'file' %>
    
    <!-- Configuration File (shown for 'file' source) -->
    <div id="config-file-field">
      <%= f.input :config_path, 
          label: "Configuration File",
          collection: @config_files,
          prompt: "Select claude-swarm.yml" %>
    </div>
    
    <!-- Saved Configuration (shown for 'saved' source) -->
    <div id="saved-config-field" class="hidden">
      <%= f.input :swarm_configuration_id,
          label: "Saved Configuration",
          collection: @saved_configurations,
          label_method: :name,
          value_method: :id,
          prompt: "Select a configuration" %>
    </div>
    
    <!-- Mode Selection -->
    <div class="bg-gray-50 p-4 rounded-lg">
      <%= f.input :mode,
          label: "Execution Mode",
          as: :radio_buttons,
          collection: [
            ['interactive', 'Interactive Mode', 'Launch with full terminal access. You can interact with Claude in real-time.'],
            ['non-interactive', 'Non-Interactive Mode', 'Run with a specific prompt. Claude completes the task and exits.']
          ],
          label_method: ->(item) { 
            content_tag(:div) do
              content_tag(:div, item[1], class: "font-medium") +
              content_tag(:div, item[2], class: "text-sm text-gray-600")
            end
          },
          value_method: :first,
          checked: 'interactive',
          input_html: { 
            data: { action: "change->mode-selector#updateMode" } 
          } %>
    </div>
    
    <!-- Prompt Field (shown only for non-interactive) -->
    <div id="prompt-field" class="hidden">
      <%= f.input :prompt, 
          as: :text,
          placeholder: "Enter the task for Claude to complete...",
          input_html: { rows: 4 } %>
    </div>
    
    <!-- Worktree Option -->
    <%= f.input :use_worktree, 
        as: :boolean,
        label: "Create in Git worktree" %>
    
    <%= f.button :submit, "Launch Swarm", 
        class: "w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700" %>
  </div>
<% end %>
```

This Stimulus controller handles the dynamic behavior of the session launch form. When the user switches between interactive and non-interactive modes, it shows or hides the prompt field accordingly.

```javascript
// app/javascript/controllers/mode_selector_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  updateMode(event) {
    const mode = event.target.value
    const promptField = document.getElementById('prompt-field')
    
    if (mode === 'non-interactive') {
      promptField.classList.remove('hidden')
    } else {
      promptField.classList.add('hidden')
    }
  }
}
```

#### Advanced tmux Features for Better UX

This service provides advanced tmux functionality beyond basic attachment. It can:
- Create read-only attachments for monitoring without interfering
- Capture pane content for displaying in the UI without attaching
- Send keys programmatically for automation scenarios
- Discover all claude-swarm tmux sessions on the system

```ruby
# app/services/tmux_manager.rb
class TmuxManager
  def initialize(session_name)
    @session_name = session_name
  end
  
  # Create read-only attachment for monitoring
  def create_readonly_attachment
    PTY.spawn("tmux", "attach-session", "-rt", @session_name)
  end
  
  # Get session info
  def session_info
    format_string = '#{session_name}: #{session_created} #{session_attached}'
    output = `tmux list-sessions -F '#{format_string}' 2>/dev/null`
    output.lines.find { |line| line.start_with?(@session_name) }
  end
  
  # Capture current pane content
  def capture_pane(lines = 1000)
    `tmux capture-pane -t #{@session_name} -p -S -#{lines}`
  end
  
  # Send keys programmatically (for automation)
  def send_keys(text)
    system("tmux", "send-keys", "-t", @session_name, text)
  end
  
  # List all tmux sessions (for session discovery)
  def self.list_claude_sessions
    output = `tmux list-sessions -F '#S' 2>/dev/null`  # #S is session name format
    output.lines.map(&:strip).select { |name| name.start_with?("claude-swarm-") }
  end
end
```

### Recommended Implementation Path

1. **Rails launches all swarms in tmux**:
   - Every `claude-swarm` command is wrapped in tmux
   - Session names follow pattern: `claude-swarm-YYYYMMDD_HHMMSS`
   - Rails tracks tmux session name in database

2. **Rails Implementation**:

The terminal controller and view provide a full-screen terminal interface for interactive sessions. The view uses a dark theme consistent with terminal applications and provides session information in the header.

   ```ruby
   # app/controllers/terminals_controller.rb
   class TerminalsController < ApplicationController
     def show
       @session = Session.find_by!(session_id: params[:session_id])
       # Terminal will be initialized via Stimulus controller
     end
   end
   ```

   ```erb
   <!-- app/views/terminals/show.html.erb -->
   <div class="h-screen flex flex-col bg-gray-900">
     <div class="p-4 bg-gray-800 text-white">
       <h1 class="text-xl">Claude Swarm Terminal - <%= @session.swarm_name %></h1>
       <p class="text-sm text-gray-400">Session: <%= @session.session_id %></p>
     </div>
     
     <div class="flex-1 p-4">
       <div id="terminal-container" 
            class="h-full bg-black rounded"
            data-controller="terminal"
            data-session-id="<%= @session.session_id %>">
       </div>
     </div>
   </div>
   ```

3. **tmux Installation & Setup**:
   - Rails checks for tmux on startup
   - Shows clear error if tmux not found: "brew install tmux" or "apt-get install tmux"
   - System package managers handle tmux installation

### Benefits of Rails-Side Implementation

1. **No changes to claude-swarm** - Works with existing version
2. **UI concerns stay in UI layer** - Terminal management is a presentation concern
3. **More flexibility** - Rails can choose tmux settings, session names, etc.
4. **Better error handling** - Rails can provide user-friendly messages
5. **Easier upgrades** - Can update terminal handling without touching claude-swarm


### Session View UI

This is the main session view that adapts based on the session mode:
- **Interactive Mode**: Shows a full terminal interface using xterm.js
- **Non-Interactive Mode**: Shows a log viewer that streams output from the background process

The view provides session controls (logs, stop) and real-time status indicators.

```erb
<!-- app/views/sessions/show.html.erb -->
<div class="h-screen flex flex-col bg-gray-900">
  <div class="p-4 bg-gray-800 text-white flex justify-between items-center">
    <div>
      <h1 class="text-xl">Claude Swarm - <%= @session.swarm_name %></h1>
      <p class="text-sm text-gray-400">
        Session: <%= @session.session_id %> | Mode: <%= @session.mode.humanize %>
      </p>
    </div>
    <div class="flex gap-2">
      <%= link_to "View Logs", session_logs_path(@session), 
          class: "px-4 py-2 bg-gray-700 rounded hover:bg-gray-600" %>
      <%= button_to "Stop Session", session_path(@session), 
          method: :delete,
          class: "px-4 py-2 bg-red-600 rounded hover:bg-red-700" %>
    </div>
  </div>
  
  <div class="flex-1 p-4">
    <% if @session.mode == 'interactive' %>
      <!-- Interactive Mode: Full Terminal -->
      <div id="terminal-container" 
           class="h-full bg-black rounded"
           data-controller="terminal"
           data-session-id="<%= @session.session_id %>">
      </div>
    <% else %>
      <!-- Non-Interactive Mode: Output Viewer -->
      <div class="h-full bg-black rounded p-4 overflow-auto font-mono text-sm text-gray-300"
           data-controller="output-viewer"
           data-session-id="<%= @session.session_id %>">
        <div id="output-content">
          <!-- Output will be streamed here -->
        </div>
        <% if @session.status == 'active' %>
          <div class="mt-2 text-yellow-400">
            <span class="animate-pulse">●</span> Running...
          </div>
        <% else %>
          <div class="mt-2 text-green-400">
            ✓ Completed
          </div>
        <% end %>
      </div>
    <% end %>
  </div>
</div>
```

This controller manages the output viewer for non-interactive sessions. It:
- Establishes a WebSocket connection to receive real-time output
- Loads existing output when the page loads
- Auto-scrolls to show new content as it arrives
- Updates the status indicator when the session completes

```javascript
// app/javascript/controllers/output_viewer_controller.js
import { Controller } from "@hotwired/stimulus"
import consumer from "../channels/consumer"

export default class extends Controller {
  connect() {
    this.sessionId = this.element.dataset.sessionId
    this.outputContent = document.getElementById('output-content')
    
    // Subscribe to output channel
    this.subscription = consumer.subscriptions.create(
      { 
        channel: "OutputChannel",
        session_id: this.sessionId 
      },
      {
        received: (data) => {
          if (data.line) {
            this.appendLine(data.line)
          }
          if (data.status === 'completed') {
            this.markCompleted()
          }
        }
      }
    )
    
    // Load existing output
    this.loadExistingOutput()
  }
  
  appendLine(line) {
    const lineElement = document.createElement('div')
    lineElement.textContent = line
    this.outputContent.appendChild(lineElement)
    
    // Auto-scroll to bottom
    this.element.scrollTop = this.element.scrollHeight
  }
  
  markCompleted() {
    const statusIndicator = this.element.querySelector('.animate-pulse')?.parentElement
    if (statusIndicator) {
      statusIndicator.innerHTML = '✓ Completed'
      statusIndicator.classList.remove('text-yellow-400')
      statusIndicator.classList.add('text-green-400')
    }
  }
  
  async loadExistingOutput() {
    const response = await fetch(`/sessions/${this.sessionId}/output`)
    const text = await response.text()
    this.outputContent.textContent = text
  }
  
  disconnect() {
    this.subscription?.unsubscribe()
  }
}
```

### Security Considerations

1. **Authentication**: Ensure only authorized users can access terminals
2. **Session Isolation**: Prevent cross-session access
3. **Input Sanitization**: Validate all terminal input
4. **Resource Limits**: Prevent terminal flooding
5. **Timeout Handling**: Clean up abandoned connections

### Implementation Challenges

1. **Claude's Interactive Nature**: Claude Code expects a real TTY
2. **Session Persistence**: Maintaining connection across page refreshes
3. **Process Management**: Handling process lifecycle properly
4. **Performance**: Minimizing latency in terminal I/O
5. **Error Recovery**: Handling disconnections gracefully

### Phase 5: Real-Time Monitoring

1. **Log Streaming**
   - Tail session.log.json files
   - Parse JSONL events in real-time
   - Stream updates via ActionCable

2. **Instance Visualization**
   - Tree view of instance hierarchy
   - Real-time status indicators
   - Cost tracking per instance
   - Tool call monitoring

3. **Activity Dashboard**
   - Timeline view of events
   - Instance communication flow
   - Tool usage statistics
   - Cost breakdown charts

## Technical Implementation Details

### Key Rails Components

1. **Models**

These ActiveRecord models provide the data layer for the UI:

- **Session**: Tracks both UI-launched and discovered sessions. The `active?` method checks different sources based on mode (tmux for interactive, process for non-interactive)
- **SwarmConfiguration**: Stores complete YAML configurations for reuse. The `to_file` method enables writing configs for claude-swarm
- **InstanceTemplate**: Pre-configured instance definitions that can be dragged into swarm configurations

**Important Distinction - Instance Names vs Instance IDs**:
- **Instance Name**: User-defined identifier in the YAML config (e.g., "frontend", "backend")
- **Instance ID**: Runtime-generated UUID created when the instance launches
- **Usage**: Instance names are used for connections and references in configuration. Instance IDs are used for state tracking and internal MCP communication
- **Example**: An instance named "frontend" might have instance_id "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

   ```ruby
   # app/models/session.rb
   class Session < ApplicationRecord
     belongs_to :swarm_configuration, optional: true
     
     validates :session_id, presence: true, uniqueness: true
     
     scope :active, -> { where(status: 'active') }
     scope :completed, -> { where(status: 'completed') }
     
     def active?
       case mode
       when 'interactive'
         # Check if tmux session exists
         tmux_session.present? && system("tmux has-session -t #{tmux_session} 2>/dev/null")
       when 'non-interactive'
         # Check if process is still running
         pid && Process.kill(0, pid) rescue false
       end
     end
     
     def logs
       SessionLogReader.new(session_path).read_logs
     end
     
     def swarm_name
       # Read from session metadata if not stored
       self[:swarm_name] || read_session_metadata['swarm_name']
     end
     
     private
     
     def read_session_metadata
       metadata_file = File.join(session_path, 'session_metadata.json')
       File.exist?(metadata_file) ? JSON.parse(File.read(metadata_file)) : {}
     end
   end
   
   # app/models/swarm_configuration.rb
   class SwarmConfiguration < ApplicationRecord
     has_many :swarm_instance_templates, dependent: :destroy
     has_many :instance_templates, through: :swarm_instance_templates
     has_many :sessions
     
     validates :name, presence: true
     validates :config_yaml, presence: true
     
     def instance_count
       yaml_config['swarm']['instances'].size rescue 0
     end
     
     def yaml_config
       @yaml_config ||= YAML.safe_load(config_yaml)
     end
     
     def to_file(path)
       File.write(path, config_yaml)
     end
   end
   
   # app/models/instance_template.rb
   class InstanceTemplate < ApplicationRecord
     has_many :swarm_instance_templates
     has_many :swarm_configurations, through: :swarm_instance_templates
     
     validates :name, presence: true
     validates :instance_type, inclusion: { 
       in: %w[frontend backend devops database testing documentation research] 
     }
     
     def to_yaml_hash
       {
         'description' => description,
         'model' => model,
         'prompt' => prompt,
         'allowed_tools' => allowed_tools,  # Can include patterns like "Bash(npm:*)"
         'disallowed_tools' => disallowed_tools,
         'vibe' => vibe,
         'provider' => provider,
         'temperature' => temperature,
         'api_version' => api_version,
         'openai_token_env' => openai_token_env,
         'base_url' => base_url
       }.compact
     end
   end
   ```

2. **Services**

The service layer provides the core business logic for interacting with claude-swarm's file system:

- **SessionLogReader**: Reads and tails JSONL log files for real-time event streaming
- **SessionDiscoveryService**: Discovers all sessions (active and inactive) from the file system without relying on CLI commands
- **SessionMonitorService**: (implemented earlier) Calculates costs and checks session health
- **SessionCleanupService**: Handles cleanup of stale sessions and worktrees

   ```ruby
   # app/services/session_log_reader.rb
   class SessionLogReader
     def initialize(session_path)
       @session_path = session_path
       @log_file = File.join(@session_path, 'session.log.json')
     end
     
     def read_logs
       return [] unless File.exist?(@log_file)
       
       File.readlines(@log_file).map do |line|
         JSON.parse(line) rescue nil
       end.compact
     end
     
     def tail_logs(&block)
       File.open(@log_file, 'r') do |file|
         file.seek(0, IO::SEEK_END)
         loop do
           line = file.gets
           if line
             event = JSON.parse(line) rescue nil
             block.call(event) if event
           else
             sleep 0.1
           end
         end
       end
     end
   end
   
   # Note: SwarmLauncher is already fully implemented above (line 520)
   
   # app/services/session_discovery_service.rb
   class SessionDiscoveryService
     # List all sessions from the sessions directory
     def self.list_all_sessions(limit: nil)
       sessions_dir = File.expand_path("~/.claude-swarm/sessions")
       return [] unless Dir.exist?(sessions_dir)
       
       sessions = []
       Dir.glob("#{sessions_dir}/*/*").each do |session_path|
         next unless File.directory?(session_path)
         next unless File.exist?(File.join(session_path, "session_metadata.json"))
         
         begin
           metadata = load_session_metadata(session_path)
           sessions << build_session_info(session_path, metadata)
         rescue => e
           Rails.logger.error "Failed to load session #{session_path}: #{e.message}"
         end
       end
       
       # Sort by start time desc and apply limit
       sessions.sort_by! { |s| -s[:start_time].to_i }
       sessions = sessions.first(limit) if limit
       sessions
     end
     
     # Get active sessions from run directory symlinks
     def self.active_sessions
       run_dir = File.expand_path("~/.claude-swarm/run")
       return [] unless File.directory?(run_dir)
       
       Dir.glob(File.join(run_dir, "*")).map do |symlink|
         next unless File.symlink?(symlink)
         
         session_id = File.basename(symlink)
         session_path = File.readlink(symlink)
         
         # Verify session still exists
         next unless File.exist?(File.join(session_path, "session_metadata.json"))
         
         metadata = load_session_metadata(session_path)
         build_session_info(session_path, metadata).merge(active: true)
       end.compact
     end
     
     private
     
     def self.load_session_metadata(session_path)
       metadata_file = File.join(session_path, "session_metadata.json")
       JSON.parse(File.read(metadata_file))
     end
     
     def self.build_session_info(session_path, metadata)
       session_id = File.basename(session_path)
       project_name = File.basename(File.dirname(session_path))
       
       {
         session_id: session_id,
         session_path: session_path,
         project_name: project_name,
         swarm_name: metadata['swarm_name'],
         start_time: Time.parse(metadata['start_time']),
         worktree: metadata['worktree'],
         start_directory: metadata['start_directory']
       }
     end
   end
   
   # app/services/session_monitor_service.rb
   class SessionMonitorService
     def initialize(session_path)
       @session_path = session_path
       @log_path = File.join(@session_path, "session.log.json")
     end
     
     # Calculate total cost from JSONL events
     def calculate_costs
       costs_by_instance = Hash.new(0.0)
       
       return costs_by_instance unless File.exist?(@log_path)
       
       File.foreach(@log_path) do |line|
         begin
           entry = JSON.parse(line)
           event = entry['event']
           
           # Look for result events with cost information
           if event && event['type'] == 'result' && event['total_cost']
             instance_name = entry['instance'] || 'unknown'
             costs_by_instance[instance_name] += event['total_cost'].to_f
           end
         rescue JSON::ParserError
           next
         end
       end
       
       costs_by_instance
     end
     
     # Check if session is still active
     def active?
       # Check PIDs in pids/ directory
       pids_dir = File.join(@session_path, "pids")
       if Dir.exist?(pids_dir)
         Dir.glob(File.join(pids_dir, "*")).each do |pid_file|
           pid = File.basename(pid_file).to_i
           begin
             Process.kill(0, pid)
             return true  # At least one process is running
           rescue Errno::ESRCH, Errno::EPERM
             # Process not found or no permission, continue checking
           end
         end
       end
       
       # Also check for active run symlink
       run_dir = File.expand_path("~/.claude-swarm/run")
       session_id = File.basename(@session_path)
       symlink_path = File.join(run_dir, session_id)
       
       File.symlink?(symlink_path) && File.readlink(symlink_path) == @session_path
     end
     
     # Get instance hierarchy from MCP configurations
     def instance_hierarchy
       hierarchy = {}
       costs_by_instance = calculate_costs
       
       # Load main instance from config
       config_file = File.join(@session_path, "config.yml")
       return hierarchy unless File.exist?(config_file)
       
       begin
         config = YAML.safe_load(File.read(config_file))
         main_instance = config.dig('swarm', 'main')
       rescue => e
         Rails.logger.error "Failed to parse config.yml: #{e.message}"
         return hierarchy
       end
       
       # Build hierarchy from MCP files
       Dir.glob(File.join(@session_path, "*.mcp.json")).each do |mcp_file|
         begin
           instance_name = File.basename(mcp_file, ".mcp.json")
           mcp_data = JSON.parse(File.read(mcp_file))
           
           # Extract connections from mcpServers
           connections = mcp_data['mcpServers']&.keys || []
           
           # Get instance state if available
           state_file = File.join(@session_path, "state", "#{instance_name}.json")
           instance_id = nil
           claude_session_id = nil
           
           if File.exist?(state_file)
             state_data = JSON.parse(File.read(state_file))
             instance_id = state_data['instance_id']
             claude_session_id = state_data['claude_session_id']
           end
           
           hierarchy[instance_name] = {
             is_main: instance_name == main_instance,
             connections: connections,
             costs: costs_by_instance[instance_name] || 0.0,
             instance_id: instance_id,
             claude_session_id: claude_session_id
           }
         rescue => e
           Rails.logger.error "Failed to parse MCP file #{mcp_file}: #{e.message}"
         end
       end
       
       hierarchy
     end
     
     # Stream log events for real-time updates
     def stream_events(&block)
       return unless File.exist?(@log_path)
       
       File.open(@log_path, 'r') do |file|
         file.seek(0, IO::SEEK_END)  # Start at end of file
         
         loop do
           line = file.gets
           if line
             begin
               entry = JSON.parse(line)
               block.call(entry)
             rescue JSON::ParserError
               next
             end
           else
             sleep 0.1
           end
         end
       end
     end
   end
   
   # app/services/session_cleanup_service.rb  
   class SessionCleanupService
     def self.cleanup_stale_sessions(days: 7)
       cutoff_time = Time.now - (days * 24 * 60 * 60)
       cleaned_count = 0
       
       # Clean stale run symlinks
       run_dir = File.expand_path("~/.claude-swarm/run")
       if Dir.exist?(run_dir)
         Dir.glob(File.join(run_dir, "*")).each do |symlink|
           next unless File.symlink?(symlink)
           
           # Check if target exists and is old enough
           begin
             target = File.readlink(symlink)
             if !File.exist?(target) || File.stat(symlink).mtime < cutoff_time
               File.unlink(symlink)
               cleaned_count += 1
             end
           rescue => e
             Rails.logger.error "Error cleaning symlink #{symlink}: #{e.message}"
           end
         end
       end
       
       # Clean orphaned worktrees
       worktrees_dir = File.expand_path("~/.claude-swarm/worktrees")
       if Dir.exist?(worktrees_dir)
         Dir.glob(File.join(worktrees_dir, "*")).each do |session_dir|
           next unless File.directory?(session_dir)
           
           if File.stat(session_dir).mtime < cutoff_time
             FileUtils.rm_rf(session_dir)
             cleaned_count += 1
           end
         end
       end
       
       cleaned_count
     end
   end
   
   # app/services/log_parser_service.rb
   class LogParserService
     def initialize(log_file_path)
       @log_file = log_file_path
     end
     
     # Parse JSONL log file and extract specific event types
     def parse_events(event_types: nil)
       events = []
       return events unless File.exist?(@log_file)
       
       File.foreach(@log_file) do |line|
         begin
           entry = JSON.parse(line)
           event = entry['event']
           
           next if event_types && !event_types.include?(event['type'])
           
           events << {
             timestamp: Time.parse(entry['timestamp']),
             instance: entry['instance'],
             instance_id: entry['instance_id'],
             event: event
           }
         rescue => e
           Rails.logger.debug "Skipping malformed log line: #{e.message}"
         end
       end
       
       events
     end
     
     # Extract tool usage statistics
     def tool_usage_stats
       stats = Hash.new { |h, k| h[k] = { count: 0, instances: Set.new } }
       
       parse_events(event_types: ['assistant']).each do |entry|
         event = entry[:event]
         message = event['message']
         next unless message && message['content']
         
         # Look for tool uses in assistant messages
         message['content'].each do |content|
           if content['type'] == 'tool_use'
             tool_name = content['name']
             stats[tool_name][:count] += 1
             stats[tool_name][:instances] << entry[:instance]
           end
         end
       end
       
       stats.transform_values { |v| v.merge(instances: v[:instances].to_a) }
     end
     
     # Get timeline of events for visualization
     def event_timeline(start_time: nil, end_time: nil)
       events = parse_events
       
       # Filter by time range if provided
       events.select! { |e| e[:timestamp] >= start_time } if start_time
       events.select! { |e| e[:timestamp] <= end_time } if end_time
       
       events.sort_by { |e| e[:timestamp] }
     end
   end
   ```

3. **ActionCable Channels**

These WebSocket channels enable real-time communication between the browser and server:

- **SessionChannel**: Streams log events from the session.log.json file for monitoring
- **OutputChannel**: Streams console output for non-interactive sessions
- **TerminalChannel**: (implemented earlier) Provides bidirectional terminal I/O for interactive sessions

   ```ruby
   # app/channels/session_channel.rb
   class SessionChannel < ApplicationCable::Channel
     def subscribed
       session = Session.find(params[:session_id])
       stream_for session
       
       # Start log tailing job
       LogStreamingJob.perform_later(session)
     end
   end
   
   # app/channels/output_channel.rb
   class OutputChannel < ApplicationCable::Channel
     def subscribed
       @session = Session.find_by!(session_id: params[:session_id])
       stream_from "output_#{@session.session_id}"
       
       # Start streaming output for non-interactive sessions
       if @session.mode == 'non-interactive'
         OutputStreamingJob.perform_later(@session)
       end
     end
   end
   ```
   
4. **Background Jobs**

These Solid Queue jobs handle long-running operations asynchronously:

- **MonitorNonInteractiveSessionJob**: Monitors background processes and updates session status when they complete
- **OutputStreamingJob**: Tails output files for non-interactive sessions and broadcasts new lines via ActionCable
- **LogStreamingJob**: Tails the JSONL log file and broadcasts events for real-time monitoring
- **SessionFileWatcher**: (implemented earlier) Uses the Listen gem for file system notifications

   ```ruby
   # app/jobs/monitor_non_interactive_session_job.rb
   class MonitorNonInteractiveSessionJob < ApplicationJob
     def perform(session_id)
       session = Session.find_by!(session_id: session_id)
       
       # Check if process is still running
       loop do
         if session.pid && Process.kill(0, session.pid)
           sleep 2  # Check every 2 seconds
         else
           # Process has ended
           session.update!(status: 'completed')
           ActionCable.server.broadcast("output_#{session.session_id}", {
             status: 'completed'
           })
           break
         end
       end
     rescue Errno::ESRCH
       # Process doesn't exist
       session.update!(status: 'completed')
     end
   end
   
   # app/jobs/output_streaming_job.rb
   class OutputStreamingJob < ApplicationJob
     def perform(session)
       return unless session.mode == 'non-interactive' && session.output_file
       
       File.open(session.output_file, 'r') do |file|
         file.seek(0, IO::SEEK_END)  # Start at end of file
         
         loop do
           line = file.gets
           if line
             ActionCable.server.broadcast("output_#{session.session_id}", {
               line: line
             })
           else
             sleep 0.1
             break unless session.reload.status == 'active'
           end
         end
       end
     end
   end
   
   # app/jobs/log_streaming_job.rb
   class LogStreamingJob < ApplicationJob
     def perform(session)
       reader = SessionLogReader.new(session.session_path)
       
       reader.tail_logs do |event|
         SessionChannel.broadcast_to(session, {
           type: 'log_event',
           event: event
         })
       end
     rescue => e
       Rails.logger.error "LogStreamingJob error: #{e.message}"
     end
   end
   
   # app/services/session_file_watcher.rb
   class SessionFileWatcher
     def self.watch(session_path, &block)
       return unless Dir.exist?(session_path)
       
       require 'listen'
       
       listener = Listen.to(session_path) do |modified, added, removed|
         changes = {
           modified: modified.map { |f| File.basename(f) },
           added: added.map { |f| File.basename(f) },
           removed: removed.map { |f| File.basename(f) }
         }
         
         # Call block with change details
         block.call(changes) if block_given?
       end
       
       listener.start
       listener
     end
     
     def self.watch_sessions_directory(&block)
       sessions_dir = File.expand_path("~/.claude-swarm/sessions")
       run_dir = File.expand_path("~/.claude-swarm/run")
       
       Listen.to(sessions_dir, run_dir) do |modified, added, removed|
         # Notify about new sessions or status changes
         block.call(modified, added, removed) if block_given?
       end
     end
   end
   ```

4. **Frontend Components**
   - Repository browser (Stimulus controller)
   - Terminal component (xterm.js integration)
   - Log viewer with filtering
   - Instance tree visualization
   - Real-time charts (Chart.js)
   - Directory list manager (multiple directories per instance)
   - Tool pattern builder (supports patterns like "Bash(npm:*)")
   - MCP server configuration forms
   - Provider-specific configuration toggles

5. **Controllers**

The controllers handle HTTP requests and coordinate between models, services, and views:

- **SessionsController**: Main controller for session management including launching, viewing, and restoring sessions
- **TerminalsController**: Handles terminal views for interactive sessions
- **ConfigurationsController**: Manages saved swarm configurations
- **DirectoriesController**: Tracks frequently used directories (Git repos or regular folders)

This implementation shows key methods from SessionsController, demonstrating:
- Session discovery that merges database records with file system data
- Launching new sessions with proper error handling
- Restoring previous sessions with mode detection
- Direct file access for logs and monitoring

   ```ruby
   # app/controllers/sessions_controller.rb
   class SessionsController < ApplicationController
     def index
       # Merge database sessions with discovered sessions
       @sessions = merge_sessions_with_discovery
     end
     
     def new
       @config_files = find_config_files
       @saved_configurations = SwarmConfiguration.all
       @directories = Directory.order(last_accessed_at: :desc).limit(10)
     end
     
     def create
       launcher = SwarmLauncher.new(session_params)
       session_id = launcher.launch
       
       redirect_to session_path(session_id)
     rescue => e
       flash[:error] = e.message
       redirect_to new_session_path
     end
     
     def restore
       @sessions = SessionDiscoveryService.list_all_sessions(limit: 50)
       @sessions = @sessions.map do |session_data|
         # Enrich with database info if exists
         db_session = Session.find_by(session_id: session_data[:session_id])
         
         # Check if session is still active
         monitor = SessionMonitorService.new(session_data[:session_path])
         active = monitor.active?
         
         session_data.merge(db_session: db_session, active: active)
       end
     end
     
     def do_restore
       session_id = params[:session_id]
       
       # Check original session mode from metadata
       session_path = find_session_path(session_id)
       metadata_file = File.join(session_path, "session_metadata.json")
       original_mode = 'interactive'  # default assumption
       
       if File.exist?(metadata_file)
         metadata = JSON.parse(File.read(metadata_file))
         # Check if original session was non-interactive by looking for prompt in first launch
         # This would need to be stored in metadata during initial launch
         original_mode = metadata['mode'] || 'interactive'
       end
       
       cmd = ["claude-swarm", "--session-id", session_id]
       
       if original_mode == 'interactive' || params[:force_interactive]
         # Launch in tmux for interactive restoration
         tmux_session = "claude-swarm-#{session_id}"
         tmux_cmd = ["tmux", "new-session", "-d", "-s", tmux_session, *cmd]
         
         if system(*tmux_cmd)
           # Update or create session record
           session = Session.find_or_create_by(session_id: session_id)
           session.update!(
             session_path: session_path,
             status: 'active',
             tmux_session: tmux_session,
             mode: 'interactive'
           )
           redirect_to session_path(session_id)
         else
           flash[:error] = "Failed to restore session"
           redirect_to restore_sessions_path
         end
       else
         # Non-interactive restoration needs a prompt
         flash[:alert] = "Original session was non-interactive. Restoration would require a new prompt."
         redirect_to restore_sessions_path
       end
     end
     
     def show
       @session = Session.find_by!(session_id: params[:id])
       
       # Get real-time session info from file system
       if @session.session_path && File.exist?(@session.session_path)
         monitor = SessionMonitorService.new(@session.session_path)
         @costs = monitor.calculate_costs
         @instance_hierarchy = monitor.instance_hierarchy
         @active = monitor.active?
         @total_cost = @costs.values.sum
       else
         @costs = {}
         @instance_hierarchy = {}
         @active = false
         @total_cost = 0.0
       end
     end
     
     def logs
       @session = Session.find_by!(session_id: params[:id])
       
       # Stream logs via ActionCable or return recent logs
       if request.headers['Accept'].include?('text/event-stream')
         # SSE streaming
         response.headers['Content-Type'] = 'text/event-stream'
         response.headers['Cache-Control'] = 'no-cache'
         
         monitor = SessionMonitorService.new(@session.session_path)
         monitor.stream_events do |event|
           response.stream.write("data: #{event.to_json}\n\n")
         end
       else
         # Return recent log events
         parser = LogParserService.new(File.join(@session.session_path, "session.log.json"))
         @events = parser.event_timeline(start_time: 1.hour.ago)
         render json: @events
       end
     ensure
       response.stream.close if response.stream.respond_to?(:close)
     end
     
     def destroy
       @session = Session.find_by!(session_id: params[:id])
       TerminalAttachmentService.new(@session.session_id).kill_session
       @session.update!(status: 'terminated')
       
       redirect_to sessions_path
     end
     
     private
     
     def session_params
       params.permit(:directory_path, :configuration_source, :config_path, 
                     :swarm_configuration_id, :mode, :prompt, :worktree, 
                     :worktree_name, :global_vibe, :debug_mode)
     end
     
     def find_config_files
       # Logic to find claude-swarm.yml files in the repository
     end
     
     def merge_sessions_with_discovery
       # Get sessions from database
       db_sessions = Session.includes(:swarm_configuration).to_a
       
       # Get active sessions from file system
       active_session_ids = SessionDiscoveryService.active_sessions.map { |s| s[:session_id] }
       
       # Update database records with active status
       db_sessions.each do |session|
         session.status = active_session_ids.include?(session.session_id) ? 'active' : 'inactive'
       end
       
       # Find any active sessions not in database
       known_ids = db_sessions.map(&:session_id)
       SessionDiscoveryService.active_sessions.each do |discovered|
         next if known_ids.include?(discovered[:session_id])
         
         # Create temporary session object for display
         db_sessions << Session.new(
           session_id: discovered[:session_id],
           session_path: discovered[:session_path],
           swarm_name: discovered[:swarm_name],
           created_at: discovered[:start_time],
           status: 'active',
           mode: 'interactive'  # Assume interactive for discovered sessions
         )
       end
       
       db_sessions.sort_by { |s| -s.created_at.to_i }
     end
   end
   
   # app/controllers/terminals_controller.rb
   class TerminalsController < ApplicationController
     def show
       @session = Session.find_by!(session_id: params[:session_id])
       # Terminal will be initialized via Stimulus controller
     end
   end
   ```

### Claude Swarm Integration Requirements

**No changes needed to claude-swarm** - The current implementation provides everything needed:

1. **Session Discovery**: Via `~/.claude-swarm/sessions/` directory structure
2. **Process Tracking**: PID files in session directories  
3. **Log Access**: Structured logs in JSONL format
4. **Active Sessions**: Symlinks in `~/.claude-swarm/run/` directory
5. **Instance States**: JSON files in `state/` subdirectory with instance_id (UUID) and claude_session_id
6. **Provider Support**: Both Claude and OpenAI instances are fully supported
7. **Generate Command**: While claude-swarm has a `generate` command to create configs via Claude, the UI provides its own visual configuration builder

**Rails UI Implementation Strategy**:

Instead of relying on claude-swarm CLI commands, the Rails app should implement its own services that directly:
- Read session directories and files for listing sessions
- Parse JSONL logs for event streaming and cost calculation
- Check PIDs and tmux sessions for active status
- Calculate costs from session.log.json events
- Build instance hierarchies from MCP configurations
- Monitor file changes for real-time updates using Listen gem or Rails' built-in file watcher

**Understanding Instance Communication**:
The `mcp-serve` command is used internally when instances connect to each other:
- Main instance launches connected instances via MCP protocol
- Each connection spawns a `claude-swarm mcp-serve` process
- The mcp-serve process launches Claude with the instance configuration
- Instance names become MCP tool names with `mcp__` prefix (e.g., `mcp__frontend`)
- This happens automatically - the UI doesn't need to manage it

This approach provides:
- Better performance (no subprocess overhead)
- More control over data presentation
- Real-time updates via file monitoring
- Richer UI-specific features
- Proper error handling for web context

**Important Implementation Considerations**:

1. **Concurrent Access**: Multiple Rails processes may read the same session files. Services should handle:
   - File locking for writes (if any)
   - Graceful handling of file read errors
   - Caching with appropriate TTLs

2. **Error Handling**: Services must handle:
   - Missing files (sessions may be deleted externally)
   - Corrupted JSON/YAML files
   - Partial writes during log streaming
   - Process/tmux session that no longer exists

3. **File Watching**: For real-time updates:
   ```ruby
   # Gemfile
   gem 'listen', '~> 3.0'  # For file system notifications
   
   # Or use Rails' built-in EventedFileUpdateChecker
   # config/environments/development.rb
   config.file_watcher = ActiveSupport::EventedFileUpdateChecker
   ```

4. **Session Restoration Edge Cases**:
   - Original session might have been non-interactive (no tmux)
   - Worktrees might have been manually deleted
   - Original directories might no longer exist
   - Handle partial restoration gracefully
   - Claude session IDs are different from swarm session IDs:
     - Session ID: Timestamp (YYYYMMDD_HHMMSS) identifying the swarm session
     - Instance ID: Runtime UUID for each instance (filename in state/)
     - Claude Session ID: Claude's internal session ID for `--resume`

**Key Configuration Notes** (verified from codebase):
- **Before commands**: Use `before` field at swarm level (array of commands)
- **Directory field**: `directory` accepts both string and array of strings (multiple directories)
- **Worktree flag**: `--worktree` accepts optional value, not just boolean
- **Default model**: Default is `sonnet`, not `opus`
- **Process launch**: Uses `system()` not `exec()`, so tmux wrapping works correctly
- **Session restoration**: Use `--session-id` to restore sessions (experimental feature)
- **Instance state**: Stored in `state/[instance_id].json` with claude_session_id
- **Permission system**: Deprecated - use `allowed_tools` and `disallowed_tools` directly
- **Active sessions**: Tracked via symlinks in `~/.claude-swarm/run/` directory

**Worktree Storage Structure**:
```
~/.claude-swarm/worktrees/
└── [session_id]/
    ├── [repo_name-hash]/
    │   └── [worktree_name]/     # Git worktree for this repository
    └── [other_repo-hash]/
        └── [worktree_name]/     # Same worktree name for different repo
```

**Important Worktree Behavior**:
- Worktrees are ONLY created for Git repositories
- Non-Git directories are used as-is, regardless of the --worktree flag
- The UI should detect if a directory is a Git repository before showing worktree options
- Instance directories can be a mix of Git and non-Git directories in the same swarm

## Rails Application Setup

```bash
# Create new Rails 8 app (importmap is default)
rails new claude-swarm-ui --database=postgresql --css=tailwind

# Add required gems to Gemfile
# gem 'simple_form'
# gem 'listen', '~> 3.0'  # For file system monitoring

# Install dependencies
bundle install
rails generate simple_form:install

# Configure Solid Queue (included by default in Rails 8)
bin/rails solid_queue:install

# Configure ActionCable to use PostgreSQL
# config/cable.yml
production:
  adapter: postgresql
  channel_prefix: claude_swarm_ui
```

### JavaScript Dependencies via Importmap

```ruby
# config/importmap.rb
pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"

# Terminal emulation
pin "xterm", to: "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"
pin "xterm-addon-fit", to: "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"
pin "xterm-addon-web-links", to: "https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js"

# Charts for monitoring
pin "chart.js", to: "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"
```

```css
/* app/assets/stylesheets/application.tailwind.css */
@import 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css';
```

### tmux Session Management

This cleanup system ensures orphaned tmux sessions and stale session files are properly cleaned up:

- **SessionCleanupService**: Discovers orphaned tmux sessions and kills them if they're no longer tracked
- **CleanupStaleSessionsJob**: Scheduled job that runs daily to clean up old sessions and worktrees
- **Startup cleanup**: Runs immediately when Rails starts to clean any sessions from crashes

```ruby
# app/services/session_cleanup_service.rb
class SessionCleanupService
  def self.cleanup_orphaned_sessions
    # List all tmux sessions
    sessions = `tmux list-sessions -F '#S' 2>/dev/null`.lines.map(&:strip)
    
    # Find claude-swarm sessions
    claude_sessions = sessions.select { |s| s.start_with?('claude-swarm-') }
    
    # Check each session against database
    claude_sessions.each do |tmux_session|
      session_id = tmux_session.gsub('claude-swarm-', '')
      
      unless Session.active.exists?(session_id: session_id)
        system("tmux", "kill-session", "-t", tmux_session)
      end
    end
  end
end

# Run cleanup on startup and periodically
# config/initializers/session_cleanup.rb
Rails.application.config.after_initialize do
  SessionCleanupService.cleanup_orphaned_sessions
end

# Schedule periodic cleanup of stale sessions
# app/jobs/cleanup_stale_sessions_job.rb
class CleanupStaleSessionsJob < ApplicationJob
  queue_as :maintenance
  
  def perform(days: 7)
    # Clean up tmux sessions first
    SessionCleanupService.cleanup_orphaned_sessions
    
    # Clean up stale files and worktrees
    cleaned = SessionCleanupService.cleanup_stale_sessions(days: days)
    Rails.logger.info "Cleaned up #{cleaned} stale sessions/worktrees"
  end
end

# Schedule it to run daily
# config/initializers/scheduled_jobs.rb
Rails.application.config.after_initialize do
  # Run cleanup daily at 3 AM
  CleanupStaleSessionsJob.set(cron: "0 3 * * *").perform_later(days: 7)
end
```

### Route Configuration

This routing configuration defines all the endpoints for the Rails UI:

- **Sessions**: Full CRUD with additional actions for restoration, logs, and output streaming
- **Configurations**: Management of saved swarm configurations with cloning and export
- **Instance Templates**: Library of reusable instance definitions
- **Repositories**: Tracking frequently used repositories
- **API Namespace**: JSON endpoints for AJAX session discovery

```ruby
# config/routes.rb
Rails.application.routes.draw do
  root "sessions#index"
  
  resources :sessions do
    collection do
      get :restore
      post :do_restore
    end
    member do
      get :logs
      get :output
    end
    resource :terminal, only: [:show]
  end
  
  resources :configurations do
    member do
      post :clone
      get :export
    end
  end
  
  resources :instance_templates
  resources :directories
  
  # API endpoints for session discovery
  namespace :api do
    resources :sessions, only: [:index] do
      collection do
        get :discover
      end
    end
  end
end
```

## Development Roadmap

### Week 1-2: Foundation
- Rails app setup with Tailwind
- Basic UI layout and navigation
- Repository browser implementation
- Database schema and models

### Week 3-4: Core Features
- Swarm configuration interface
- Launch functionality
- Session tracking and management
- Basic session switching

### Week 5-6: Terminal Integration
- xterm.js setup
- WebSocket terminal connection
- Terminal process management
- Session attachment

### Week 7-8: Monitoring & Polish
- Real-time log streaming
- Instance visualization
- Activity monitoring
- Cost tracking dashboard
- UI polish and optimization

## Technical Stack

- **Backend**: Rails 8.x, PostgreSQL, Solid Queue, ActionCable (PostgreSQL adapter), tmux
- **Frontend**: Turbo, Stimulus, Tailwind CSS, xterm.js, Chart.js
- **Infrastructure**: Direct installation on machine, systemd service (optional), nginx reverse proxy
- **System Requirements**: Ruby 3.4.2, PostgreSQL 17, tmux

## Security Considerations

Since this is a local development tool, security focuses on preventing accidental issues:

1. **Basic Access Control** (optional):

For environments where the UI might be exposed beyond localhost, basic HTTP authentication can be enabled via environment variables.

   ```ruby
   # Simple HTTP Basic Auth for the web interface
   class ApplicationController < ActionController::Base
     http_basic_authenticate_with(
       name: ENV['UI_USERNAME'] || 'admin',
       password: ENV['UI_PASSWORD'] || 'changeme'
     ) if ENV['UI_AUTH_ENABLED'] == 'true'
   end
   ```

2. **Command Safety**:
   - Always use array form for system commands to prevent injection
   - Validate YAML configurations before execution
   - Sanitize file paths to prevent directory traversal

3. **Session Management**:
   - Clean up tmux sessions on exit
   - Prevent orphaned processes
   - Clear temporary configuration files

## Future Enhancements

1. **Multi-user Support**: User authentication and session ownership
2. **Cloud Deployment**: Remote Claude Swarm execution
3. **Advanced Analytics**: Detailed cost analysis and optimization
4. **Collaboration Features**: Shared sessions and team workspaces
5. **Plugin System**: Extensible UI components for custom workflows

## Expected YAML Configuration Format

The UI must generate YAML configurations that match claude-swarm's expected format:

```yaml
version: 1
swarm:
  name: "Development Team"
  main: lead
  before:  # Optional array of commands to run before launching
    - "npm install"
    - "docker-compose up -d"
  instances:
    lead:
      description: "Lead developer coordinating the team"
      directory: "."  # Can be string or array ["./src", "./docs"]
      model: "opus"
      prompt: "You are the lead developer"
      allowed_tools: ["Read", "Edit", "Bash", "Write"]
      # Tool patterns are supported for fine-grained control:
      # allowed_tools: ["Read", "Edit", "Write", "Bash(npm:*)", "Bash(yarn:*)", "Bash(pnpm:*)"]
      disallowed_tools: []  # Usually empty, as allowed_tools is preferred
      connections: ["frontend", "backend"]
      vibe: false
      worktree: true  # Can be boolean, string, or nil
      mcps:
        - name: "database"
          type: "stdio"
          command: "mcp-server-sqlite"
          args: ["-d", "./data.db"]
    frontend:
      description: "Frontend specialist"
      directory: "./frontend"
      model: "sonnet"
      provider: "openai"  # OpenAI instance
      temperature: 0.7
      api_version: "chat_completion"
      openai_token_env: "OPENAI_API_KEY"
```

### Additional Frontend Components

These Stimulus controllers handle dynamic UI behaviors for configuration editing:

```javascript
// app/javascript/controllers/directory_list_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  add(event) {
    event.preventDefault()
    const template = `
      <div class="flex gap-2 mb-2">
        <input type="text" 
               name="instance[directories][]"
               class="flex-1 form-input"
               placeholder="./path/to/directory" />
        <button type="button" 
                class="px-3 py-1 bg-red-500 text-white rounded"
                data-action="click->directory-list#remove">Remove</button>
      </div>
    `
    this.element.insertAdjacentHTML('beforeend', template)
  }
  
  remove(event) {
    event.preventDefault()
    event.target.closest('div').remove()
  }
}

// app/javascript/controllers/tools_builder_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["customTool"]
  
  addCustom(event) {
    event.preventDefault()
    const value = this.customToolTarget.value.trim()
    
    if (value) {
      const checkbox = document.createElement('label')
      checkbox.className = 'flex items-center'
      checkbox.innerHTML = `
        <input type="checkbox" 
               name="instance[allowed_tools][]"
               value="${value}"
               checked />
        <span class="ml-2">${value}</span>
      `
      
      this.element.querySelector('.grid').appendChild(checkbox)
      this.customToolTarget.value = ''
    }
  }
}

// app/javascript/controllers/mcp_builder_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  add(event) {
    event.preventDefault()
    const template = `
      <div class="border p-3 rounded mb-2">
        <div class="grid grid-cols-2 gap-3">
          <input type="text" 
                 name="instance[mcps][][name]"
                 placeholder="MCP server name"
                 class="form-input" />
          
          <select name="instance[mcps][][type]" class="form-select">
            <option value="stdio">stdio</option>
            <option value="sse">sse</option>
          </select>
          
          <input type="text"
                 name="instance[mcps][][command]"
                 placeholder="Command (for stdio)"
                 class="form-input col-span-2" />
          
          <input type="text"
                 name="instance[mcps][][args]"
                 placeholder="Arguments (comma-separated)"
                 class="form-input col-span-2" />
          
          <input type="text"
                 name="instance[mcps][][url]"
                 placeholder="URL (for sse)"
                 class="form-input col-span-2" />
        </div>
        
        <button type="button"
                class="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm"
                data-action="click->mcp-builder#removeMcp">Remove</button>
      </div>
    `
    this.element.insertAdjacentHTML('beforeend', template)
  }
  
  removeMcp(event) {
    event.preventDefault()
    event.target.closest('.border').remove()
  }
}

// app/javascript/controllers/instance_form_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  updateProvider(event) {
    const provider = event.target.value
    const claudeFields = document.getElementById('claude-fields')
    const openaiFields = document.getElementById('openai-fields')
    
    if (provider === 'openai') {
      claudeFields.classList.add('hidden')
      openaiFields.classList.remove('hidden')
    } else {
      claudeFields.classList.remove('hidden')
      openaiFields.classList.add('hidden')
    }
  }
}
```

## Summary

This Rails UI application provides a web-based interface for Claude Swarm without requiring any modifications to the claude-swarm gem itself. Key features:

- **Dual Mode Support**: Interactive terminal sessions via tmux and non-interactive prompt execution
- **Configuration Management**: Save, reuse, and visually build swarm configurations
- **Real-Time Monitoring**: Live session logs, instance communication tracking, and cost analysis
- **Web Terminal**: Full terminal access to interactive Claude sessions through the browser
- **Zero Claude-Swarm Changes**: Works with the existing claude-swarm implementation
- **Flexible Directory Support**: Works with both Git repositories and regular directories
- **Smart Worktree Handling**: Automatically detects Git repos and only creates worktrees where applicable

The application acts as a "pane of glass" over claude-swarm, reading session files directly and managing processes through system commands. This approach maintains separation of concerns and allows independent evolution of both projects.