# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SwarmUI is a ViCE (Vibe Coding Environment) - a modern alternative to traditional IDEs that enables natural, conversational coding through AI integration. It's a Ruby on Rails 8.0.2 application using modern Rails conventions and the Hotwire stack (Turbo + Stimulus) for frontend interactivity.

### The ViCE Philosophy

SwarmUI is purpose-built for vibe coding mastery. Unlike traditional IDEs that bolt on AI features, SwarmUI provides the perfect environment for developers who:

- Have transcended traditional tool-based workflows
- Want to master the art of conversational development
- Need precisely the right tools without unnecessary complexity
- Seek a pure vibe coding experience

Key principles:
- **Minimal, essential tooling** - Just what you need for vibe coding, nothing more
- **Natural language first** - Express intent, not commands
- **Flow state optimization** - No interruptions, no friction
- **AI-native workflows** - Built for Claude collaboration from day one

This isn't an IDE with AI features added - it's a precision instrument for vibe coding practitioners.

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
- **Icons**: Heroicon (SVG icon library)

## Development Commands

NOTE: NEVER TRY TO RUN THE RAILS SERVER! If you need it restarted, ask the user.

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

1. NEVER START OR RESTART THE DEVELOPMENT SERVER
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

## Forms
- Use Simple Form for all forms in the application
- Simple Form has been configured to work with Tailwind CSS
- Refer to `llm_docs/simple_form_tailwind.md` for usage guidelines and examples
- The configuration uses custom wrappers for proper Tailwind styling

## UI Design Guidelines
- Always use Tailwind CSS 4 utility classes for styling in views and components.
- Follow the official Tailwind CSS 4 documentation that is in llm_docs/tailwind for syntax, features, and best practices.
- Prefer semantic HTML and accessibility best practices alongside Tailwind classes.
- Avoid custom CSS unless a design cannot be achieved with Tailwind utilities.
- For custom themes, define variables using `@theme` in app/assets/tailwind/application.css.

### Tailwind CSS 4 Documentation
The `llm_docs/tailwind/` directory contains the complete Tailwind CSS 4 documentation split into individual MDX files. 

**IMPORTANT**: Always consult `llm_docs/tailwind/INDEX.md` first to quickly find the right documentation file for any Tailwind utility class or concept.

When you need to:
- Look up a specific utility class → Read `llm_docs/tailwind/[utility-name].mdx` (e.g., `llm_docs/tailwind/background-color.mdx` for bg-* classes)
- Understand responsive design → Read `llm_docs/tailwind/responsive-design.mdx`
- Work with states (hover, focus, etc.) → Read `llm_docs/tailwind/hover-focus-and-other-states.mdx`
- Customize the theme → Read `llm_docs/tailwind/theme.mdx`
- Add custom styles → Read `llm_docs/tailwind/adding-custom-styles.mdx`
- Use functions and directives → Read `llm_docs/tailwind/functions-and-directives.mdx`

Common utility class files:
- Colors: `llm_docs/tailwind/colors.mdx`, `llm_docs/tailwind/background-color.mdx`, `llm_docs/tailwind/color.mdx`
- Layout: `llm_docs/tailwind/display.mdx`, `llm_docs/tailwind/position.mdx`, `llm_docs/tailwind/flex.mdx`, `llm_docs/tailwind/grid-template-columns.mdx`
- Spacing: `llm_docs/tailwind/padding.mdx`, `llm_docs/tailwind/margin.mdx`, `llm_docs/tailwind/gap.mdx`
- Typography: `llm_docs/tailwind/font-size.mdx`, `llm_docs/tailwind/font-weight.mdx`, `llm_docs/tailwind/text-align.mdx`
- Borders: `llm_docs/tailwind/border-width.mdx`, `llm_docs/tailwind/border-color.mdx`, `llm_docs/tailwind/border-radius.mdx`
- Effects: `llm_docs/tailwind/box-shadow.mdx`, `llm_docs/tailwind/opacity.mdx`, `llm_docs/tailwind/filter.mdx`

When implementing UI features, proactively read the relevant Tailwind documentation files to ensure correct usage of Tailwind CSS 4 utilities.

## Code Style Guidelines

- Follow Rails conventions and the rubocop-shopify style guide
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
- IF you need to write custom CSS because Tailwind classes did not resolve the issue, add it to app/assets/stylesheets/application.css
- Follow software engineering principles like SOLID
- Write code with testability in mind from the start, with proper abstractions and environment-independent behavior. There's should be no special code paths for tests only.
- Always use path/url helpers to render a Rails route - never hardcode Rails urls/paths

## Testing guidelines
- When using expectations, like something.expects(:...), always set the expectation in an instance of the class if it is available. Only use `any_instance.expects` if you can't grab the instance of the class that is the subject of what you are trying to mock/stub
- Use VCR when tests require http requests.
- Use the helpers from the `rails-controller-testing` gem for controller tests
- Use factories for tests instead of fixtures. Existing factories live in `test/factories`. New factories should go in that directory.

## Using Heroicons

The application uses the `heroicon` gem for consistent icons throughout the UI. To add icons:

```erb
<%= heroicon "icon-name", variant: :solid, options: { class: "h-5 w-5" } %>
```

- **icon-name**: The name of the icon (see [heroicons.com](https://heroicons.com) for available icons)
- **variant**: Can be `:solid`, `:outline`, `:mini` or `:micro`
- **options**: Additional HTML attributes like classes

Common icons used in the application:
- Navigation: `bars-3`, `x-mark`, `home`, `user`, `cog-6-tooth`
- Actions: `plus`, `pencil`, `trash`, `arrow-right`, `arrow-left`
- Status: `check-circle`, `x-circle`, `exclamation-triangle`, `information-circle`
- Features: `terminal`, `server`, `code-bracket`, `globe-alt`, `bolt`

Default icon configuration is in `config/initializers/heroicon.rb`.
