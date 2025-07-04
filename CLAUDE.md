# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SwarmUi is a Ruby on Rails 8.0.2 application using modern Rails conventions and the Hotwire stack (Turbo + Stimulus) for frontend interactivity.

## Key Technologies

- **Ruby**: 3.4.2
- **Rails**: 8.0.2
- **Database**: PostgreSQL
- **CSS Framework**: Tailwind CSS
- **JavaScript**: Import Maps (no Node.js build process)
- **Frontend Stack**: Hotwire (Turbo + Stimulus)
- **Asset Pipeline**: Propshaft
- **Background Jobs**: Solid Queue
- **Caching**: Solid Cache
- **WebSockets**: Solid Cable

## Development Commands

### Initial Setup
```bash
bin/setup
```

### Running the Development Server
```bash
bin/dev
```
This starts both the Rails server and Tailwind CSS watcher.

### Database Commands
```bash
bin/rails db:create      # Create the database
bin/rails db:migrate     # Run migrations
bin/rails db:seed        # Seed the database
bin/rails db:prepare     # Create, migrate, and seed in one command
```

### Testing
```bash
bin/rails test           # Run all tests
bin/rails test test/models/user_test.rb  # Run specific test file
bin/rails test test/models/user_test.rb:42  # Run specific test by line number
```

### Code Quality
```bash
bin/rubocop -A           # Run RuboCop for code style checks and auto-fix violations
bin/brakeman             # Run security vulnerability scan
```

## Code Architecture

The application follows standard Rails conventions:

- **app/controllers/**: HTTP request handlers
- **app/models/**: ActiveRecord models for database interaction
- **app/views/**: ERB templates for HTML rendering
- **app/javascript/**: Stimulus controllers and JavaScript modules
- **app/assets/**: Static assets and stylesheets
- **config/**: Application configuration
- **db/**: Database schema and migrations
- **test/**: Minitest test files

### Testing Stack
- **Minitest**: Default Rails testing framework
- **Factory Bot**: Test data generation
- **Capybara**: Integration/system testing
- **WebMock/VCR**: HTTP request mocking

### Code Style
The project uses RuboCop with Shopify's style guide. Always run `bin/rubocop -A` and fix linting errors before committing changes.

## Development Workflow

1. Start the development server with `bin/dev`
2. The server runs on http://localhost:3000 by default
3. Tailwind CSS compilation happens automatically
4. Rails automatically reloads on code changes
5. Use `bin/rails console` for interactive debugging

## Important Conventions

- Follow existing code patterns and Rails conventions
- Use Turbo for page updates instead of full page reloads
- Write Stimulus controllers for JavaScript behavior
- Keep controllers thin and models fat
- Write tests for all new functionality
- Use strong parameters in controllers
- Follow RESTful routing conventions

## Code Style Guidelines

- Follow Rails conventions and the rubocop-rails-omakase style guide
- Use 2 spaces for indentation
- Prefer snake_case for variable/method names, CamelCase for classes/modules
- Keep lines under 100 characters
- Include meaningful validations in models
- Use service objects for complex business logic
- Organize imports at the top of files with standard library first, then gems, then local imports
- Use meaningful error handling with specific exceptions when possible
- Follow RESTful controller patterns
- Write meaningful tests for all functionality
- When writing Javascript, use Stimulus Controllers. DO NOT WRITE INLINE JAVASCRIPT.
- When writing CSS, use SASS and add it to app/assets/stylesheets/application.scss
- Follow software engineering principles like SOLID
- Write code with testability in mind from the start, with proper abstractions and environment-independent behavior. There's should be no special code paths for tests only.
- Always use path/url helpers to render a Rails route - never hardcode Rails urls/paths

## Testing guidelines
- When using expectations, like something.expects(:...), always set the expectation in an instance of the class if it is available. Only use `any_instance.expects` if you can't grab the instance of the class that is the subject of what you are trying to mock/stub
- Use VCR when tests require http requests.
- Use the helpers from the `rails-controller-testing` gem for controller tests
- Use factories for tests instead of fixtures. Existing factories live in `test/factories`. New factories should go in that directory.
