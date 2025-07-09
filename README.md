# SwarmUI

A modern web interface for managing Claude Swarm sessions. SwarmUI provides an intuitive browser-based interface to create, view, and manage AI-assisted development sessions powered by Claude.

## Features

- 🚀 **Session Management**: Create and manage multiple swarm sessions
- 📁 **Filesystem Browser**: Interactive file browser for project selection
- 🎨 **Dark Mode Support**: Seamless dark/light theme switching
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔄 **Real-time Updates**: Live session status tracking
- 📊 **Version Tracking**: Automatic update notifications
- 🖥️ **Terminal Integration**: Direct terminal access via ttyd

## Requirements

- Ruby 3.4.2
- Rails 8.0.2
- PostgreSQL (or Podman/Docker for containerized PostgreSQL)
- Redis (for Solid Queue/Cable)
- ttyd (for terminal integration)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/parruda/swarm-ui.git
cd swarm-ui
```

2. Install dependencies:
```bash
bundle install
```

3. Setup the database:
```bash
bin/rails db:prepare
```

4. Start the application:

**Option A: Full stack with PostgreSQL** (recommended for first-time setup)
```bash
bin/start
```
This starts all services including PostgreSQL in a container using Podman.
- Rails app runs on port 4269
- ttyd terminal runs on port 4268
- PostgreSQL runs on port 4267

**Option B: Development mode** (if you have PostgreSQL already running)
```bash
bin/dev
```
This starts only the Rails server, Tailwind CSS watcher, and ttyd on the default ports.

The application will be available at:
- `http://localhost:4269` when using `bin/start`
- `http://localhost:3000` when using `bin/dev`

## Development

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
- **PostgreSQL**: Primary database
- **Solid Queue**: Background job processing
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
