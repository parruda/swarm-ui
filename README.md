# SwarmUI

A ViCE (Vibe Coding Environment) for AI-assisted development. SwarmUI is a modern alternative to traditional IDEs that embraces natural, conversational coding through Claude integration.

## What is a ViCE?

A Vibe Coding Environment is purpose-built for developers who have embraced AI-powered, conversational development. While traditional IDEs may add AI features as an afterthought, SwarmUI is designed from the ground up for vibe coding mastery. It provides just the right tools - nothing more, nothing less - allowing you to express creative intent through natural language without the bloat of traditional development environments.

Perfect for developers who want to master vibe coding or have already transcended tool-based workflows, SwarmUI offers a distraction-free environment where you can truly flow with your AI pair programmer.

SwarmUI provides an intuitive browser-based interface to create, view, and manage AI-assisted development sessions powered by Claude.

## Features

- 🚀 **Session Management**: Create and manage multiple swarm sessions
- 📁 **Filesystem Browser**: Interactive file browser for project selection
- 🎨 **Dark Mode Support**: Seamless dark/light theme switching
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔄 **Real-time Updates**: Live session status tracking
- 📊 **Version Tracking**: Automatic update notifications
- 🖥️ **Terminal Integration**: Direct terminal access via ttyd

## Requirements

### Core Dependencies
- **Ruby >= 3.4** (required - must be installed before running the installer)
- **Bundler** (Ruby's package manager)

### System Dependencies
The following will be installed automatically by the installation script:
- **ttyd** - Terminal emulator for web access
- **tmux** - Terminal multiplexer for session management
- **gh CLI** - GitHub command line interface
- **gh webhook extension** - For GitHub webhook integration
- **Redis** - For pub/sub and webhook notifications (must be available as `redis-server` in your PATH)

### Database
- **SQLite** - Embedded database (no separate server required)

## Installation

### Prerequisites
Ensure Ruby 3.4 or higher is installed:
```bash
ruby --version  # Should show 3.4.0 or higher
```

If Ruby is not installed or needs upgrading:
- **macOS**: `brew install ruby`
- **Ubuntu/Debian**: `sudo apt-get install ruby-full`
- **Other platforms**: See [Ruby installation guide](https://www.ruby-lang.org/en/documentation/installation/)

### Quick Setup

1. Clone the repository:
```bash
git clone https://github.com/parruda/swarm-ui.git
cd swarm-ui
```

2. Run the installer script:
```bash
bin/install
```
This will:
- Install all required system dependencies (ttyd, tmux, gh CLI, and Redis)
- Install Ruby dependencies (bundle install)
- Create and migrate the database

3. Start the application:

```bash
bin/start
```
This starts all services:
- Rails app runs on port 4269
- ttyd terminal runs on port 4268
- Redis runs on a Unix socket

The application will be available at `http://localhost:4269`

## Development

### Initial Setup
```bash
bin/setup
```
This will:
- Install Ruby dependencies
- Create and migrate the SQLite database
- Start the development server

### Running Development Mode
```bash
bin/dev
```
This starts all services including Redis, Rails server, Tailwind CSS watcher, and ttyd.

The application will be available at:
- `http://localhost:3000` when using `bin/dev`


### Running Tests

```bash
bin/rails test
```

### Code Quality

```bash
bin/rubocop -A  # Run linter with auto-fix
bin/brakeman    # Run security scan
```

### Database Commands

```bash
bin/rails db:migrate  # Run migrations
bin/rails db:seed     # Seed database
bin/rails console     # Rails console
```

## Architecture

SwarmUI is built with:

- **Rails 8.0.2**: Modern web framework
- **Hotwire**: Turbo + Stimulus for reactive UI
- **Tailwind CSS 4**: Utility-first CSS framework
- **SQLite**: Embedded database
- **Redis**: Pub/sub for webhook notifications
- **Solid Queue**: Background job processing (in-memory for development)
- **Solid Cable**: WebSocket support
- **Import Maps**: No-build JavaScript

## Configuration

The application uses standard Rails configuration. Key files:

- `config/database.yml`: Database configuration
- `config/application.rb`: Application settings
- `config/environments/`: Environment-specific settings

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
