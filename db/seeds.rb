# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).

puts "Creating instance templates..."

# Frontend template
frontend_template = InstanceTemplate.find_or_create_by!(name: "Frontend Developer") do |template|
  template.description = "Specializes in React, Vue, and modern frontend development"
  template.instance_type = "frontend"
  template.model = "sonnet"
  template.prompt = "You are a frontend developer specializing in React, Vue, and modern web technologies. Focus on creating responsive, accessible, and performant user interfaces."
  template.allowed_tools = ["Read", "Edit", "Write", "Bash(npm:*)", "Bash(yarn:*)", "Bash(pnpm:*)", "Grep", "Glob"]
  template.disallowed_tools = []
  template.vibe = false
  template.provider = "claude"
end

# Backend template
backend_template = InstanceTemplate.find_or_create_by!(name: "Backend Developer") do |template|
  template.description = "Focuses on server-side development, APIs, and databases"
  template.instance_type = "backend"
  template.model = "sonnet"
  template.prompt = "You are a backend developer specializing in server-side applications, RESTful APIs, and database design. Focus on performance, security, and scalability."
  template.allowed_tools = ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
  template.disallowed_tools = []
  template.vibe = false
  template.provider = "claude"
end

# DevOps template
devops_template = InstanceTemplate.find_or_create_by!(name: "DevOps Engineer") do |template|
  template.description = "Handles infrastructure, CI/CD, and deployment"
  template.instance_type = "devops"
  template.model = "sonnet"
  template.prompt = "You are a DevOps engineer specializing in infrastructure as code, CI/CD pipelines, and cloud deployments. Focus on automation, monitoring, and reliability."
  template.allowed_tools = ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
  template.disallowed_tools = []
  template.vibe = false
  template.provider = "claude"
end

# Database specialist template
database_template = InstanceTemplate.find_or_create_by!(name: "Database Specialist") do |template|
  template.description = "Expert in database design, optimization, and migrations"
  template.instance_type = "database"
  template.model = "sonnet"
  template.prompt = "You are a database specialist with expertise in PostgreSQL, MySQL, and NoSQL databases. Focus on schema design, query optimization, and data integrity."
  template.allowed_tools = ["Read", "Edit", "Write", "Bash", "Grep"]
  template.disallowed_tools = []
  template.vibe = false
  template.provider = "claude"
end

# Testing specialist template
testing_template = InstanceTemplate.find_or_create_by!(name: "Testing Specialist") do |template|
  template.description = "Focuses on unit tests, integration tests, and test automation"
  template.instance_type = "testing"
  template.model = "sonnet"
  template.prompt = "You are a testing specialist focused on ensuring code quality through comprehensive test coverage. Write unit tests, integration tests, and end-to-end tests."
  template.allowed_tools = ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
  template.disallowed_tools = []
  template.vibe = false
  template.provider = "claude"
end

# Research assistant template (OpenAI example)
research_template = InstanceTemplate.find_or_create_by!(name: "Research Assistant") do |template|
  template.description = "Conducts research and gathers information"
  template.instance_type = "research"
  template.model = "gpt-4"
  template.prompt = "You are a research assistant who helps gather information, analyze documentation, and provide insights. Focus on accuracy and thoroughness."
  template.allowed_tools = ["Read", "WebSearch", "Grep", "Glob"]
  template.disallowed_tools = ["Edit", "Write", "Bash"]
  template.vibe = false
  template.provider = "openai"
  template.temperature = 0.3
  template.api_version = "chat_completion"
  template.openai_token_env = "OPENAI_API_KEY"
end

puts "Created #{InstanceTemplate.count} instance templates"

puts "\nCreating swarm configurations..."

# Example full-stack development swarm
fullstack_config = SwarmConfiguration.find_or_create_by!(name: "Full-Stack Development Team") do |config|
  config.description = "A complete development team for full-stack web applications"
  config.is_template = true
  config.before = ["npm install", "bundle install"]
  config.config_yaml = <<~YAML
    version: 1
    swarm:
      name: "Full-Stack Development Team"
      main: lead
      before:
        - "npm install"
        - "bundle install"
      instances:
        lead:
          description: "Lead developer coordinating the team"
          directory: "."
          model: "opus"
          prompt: "You are the lead developer coordinating a team building a web application. Guide the team, make architectural decisions, and ensure code quality."
          allowed_tools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
          connections: ["frontend", "backend", "database"]
          vibe: false
        frontend:
          description: "Frontend specialist for UI development"
          directory: "./frontend"
          model: "sonnet"
          prompt: "You are a frontend developer specializing in React and modern web technologies. Focus on creating responsive, accessible user interfaces."
          allowed_tools: ["Read", "Edit", "Write", "Bash(npm:*)", "Bash(yarn:*)", "Grep", "Glob"]
          connections: ["backend"]
          vibe: false
        backend:
          description: "Backend developer for API and server logic"
          directory: "./backend"
          model: "sonnet"
          prompt: "You are a backend developer working on RESTful APIs and server-side logic. Focus on performance, security, and clean architecture."
          allowed_tools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
          connections: ["database"]
          vibe: false
        database:
          description: "Database specialist for schema and queries"
          directory: "./db"
          model: "sonnet"
          prompt: "You are a database specialist managing PostgreSQL schemas and optimizing queries. Ensure data integrity and performance."
          allowed_tools: ["Read", "Edit", "Write", "Bash", "Grep"]
          vibe: false
  YAML
end

# Example simple pair programming swarm
pair_config = SwarmConfiguration.find_or_create_by!(name: "Pair Programming") do |config|
  config.description = "Two developers working together on code"
  config.is_template = true
  config.before = []
  config.config_yaml = <<~YAML
    version: 1
    swarm:
      name: "Pair Programming Session"
      main: driver
      instances:
        driver:
          description: "The driver writing code"
          directory: "."
          model: "sonnet"
          prompt: "You are the driver in a pair programming session. Write clean, well-tested code while explaining your thought process."
          allowed_tools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
          connections: ["navigator"]
          vibe: false
        navigator:
          description: "The navigator reviewing and guiding"
          directory: "."
          model: "sonnet"
          prompt: "You are the navigator in a pair programming session. Review code, suggest improvements, and help catch bugs."
          allowed_tools: ["Read", "Grep", "Glob"]
          vibe: false
  YAML
end

# Example research team swarm
research_config = SwarmConfiguration.find_or_create_by!(name: "Research Team") do |config|
  config.description = "A team for conducting research and analysis"
  config.is_template = true
  config.before = []
  config.config_yaml = <<~YAML
    version: 1
    swarm:
      name: "Research and Analysis Team"
      main: coordinator
      instances:
        coordinator:
          description: "Research coordinator managing the team"
          directory: "."
          model: "opus"
          prompt: "You coordinate a research team, organizing findings and ensuring comprehensive analysis."
          allowed_tools: ["Read", "Write", "WebSearch", "Grep", "Glob"]
          connections: ["researcher1", "researcher2"]
          vibe: false
        researcher1:
          description: "Primary researcher"
          directory: "./research"
          model: "sonnet"
          prompt: "You are a researcher focused on gathering and analyzing information from various sources."
          allowed_tools: ["Read", "Write", "WebSearch", "Grep", "Glob"]
          vibe: false
        researcher2:
          description: "Secondary researcher"
          directory: "./research"
          model: "gpt-4"
          provider: "openai"
          temperature: 0.3
          api_version: "chat_completion"
          prompt: "You are a researcher providing alternative perspectives and cross-validation of findings."
          allowed_tools: ["Read", "WebSearch", "Grep", "Glob"]
          vibe: false
  YAML
end

puts "Created #{SwarmConfiguration.count} swarm configurations"

puts "\nCreating sample directories..."

# Example directory
Directory.find_or_create_by!(path: File.expand_path("~/projects/my-app")) do |dir|
  dir.name = "My Application"
  dir.is_git_repository = true
  dir.default_swarm_configuration = fullstack_config
  dir.last_accessed_at = Time.current
end

# Another example directory
Directory.find_or_create_by!(path: File.expand_path("~/Documents/research")) do |dir|
  dir.name = "Research Projects"
  dir.is_git_repository = false
  dir.default_swarm_configuration = research_config
  dir.last_accessed_at = 1.day.ago
end

puts "Created #{Directory.count} directories"

puts "\nSeed data created successfully!"
puts "  - Instance Templates: #{InstanceTemplate.count}"
puts "  - Swarm Configurations: #{SwarmConfiguration.count}"
puts "  - Directories: #{Directory.count}"
