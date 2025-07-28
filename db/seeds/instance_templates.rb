# frozen_string_literal: true

# System Instance Templates
puts "Creating system instance templates..."

# Frontend Expert
InstanceTemplate.find_or_create_by!(name: "Frontend Expert") do |template|
  template.description = "Expert in modern frontend development, UI/UX, and web technologies"
  template.category = "frontend"
  template.system_template = true
  template.config = {
    "model" => "opus",
    "provider" => "claude",
    "directory" => "${FRONTEND_DIR:=./frontend}",
    "allowed_tools" => ["Read", "Edit", "Write", "Bash"],
    "prompt" => "You are an expert frontend developer specializing in React, TypeScript, and modern web technologies.",
  }
  template.required_variables = ["FRONTEND_DIR"]
end

# Backend Expert
InstanceTemplate.find_or_create_by!(name: "Backend Expert") do |template|
  template.description = "Expert in backend development, APIs, databases, and server architecture"
  template.category = "backend"
  template.system_template = true
  template.config = {
    "model" => "opus",
    "provider" => "claude",
    "directory" => "${BACKEND_DIR:=./backend}",
    "allowed_tools" => ["Read", "Edit", "Write", "Bash"],
    "prompt" => "You are an expert backend developer specializing in scalable architectures and API design.",
  }
  template.required_variables = ["BACKEND_DIR"]
end

# Rails Developer
InstanceTemplate.find_or_create_by!(name: "Rails Developer") do |template|
  template.description = "Expert in Ruby on Rails development and best practices"
  template.category = "backend"
  template.system_template = true
  template.config = {
    "model" => "sonnet",
    "provider" => "claude",
    "directory" => ".",
    "allowed_tools" => ["Read", "Edit", "Write", "Bash"],
    "prompt" => "You are an expert Ruby on Rails developer following Rails conventions and best practices.",
  }
end

# Code Reviewer
InstanceTemplate.find_or_create_by!(name: "Code Reviewer") do |template|
  template.description = "Thorough code reviewer focusing on quality, security, and best practices"
  template.category = "general"
  template.system_template = true
  template.config = {
    "model" => "opus",
    "provider" => "claude",
    "directory" => ".",
    "allowed_tools" => ["Read"],
    "prompt" => "You are an expert code reviewer. Focus on code quality, security vulnerabilities, performance issues, and adherence to best practices.",
  }
end

# Security Auditor
InstanceTemplate.find_or_create_by!(name: "Security Auditor") do |template|
  template.description = "Security expert for identifying vulnerabilities and security best practices"
  template.category = "security"
  template.system_template = true
  template.config = {
    "model" => "opus",
    "provider" => "claude",
    "directory" => ".",
    "allowed_tools" => ["Read", "Bash", "Grep", "Glob"],
    "prompt" => "You are a security expert specializing in identifying vulnerabilities and implementing security best practices. Focus on OWASP top 10 and secure coding practices.",
  }
end

# Database Expert
InstanceTemplate.find_or_create_by!(name: "Database Expert") do |template|
  template.description = "Expert in database design, optimization, and query performance"
  template.category = "database"
  template.system_template = true
  template.config = {
    "model" => "sonnet",
    "provider" => "claude",
    "directory" => "${DB_DIR:=./db}",
    "allowed_tools" => ["Read", "Edit", "Write", "Bash"],
    "prompt" => "You are a database expert specializing in schema design, query optimization, and data modeling.",
  }
  template.required_variables = ["DB_DIR"]
end

# Test Engineer
InstanceTemplate.find_or_create_by!(name: "Test Engineer") do |template|
  template.description = "Expert in writing comprehensive tests and test automation"
  template.category = "testing"
  template.system_template = true
  template.config = {
    "model" => "sonnet",
    "provider" => "claude",
    "directory" => "${TEST_DIR:=./test}",
    "allowed_tools" => ["Read", "Edit", "Write", "Bash"],
    "prompt" => "You are a test engineer specializing in comprehensive test coverage, TDD, and test automation.",
  }
  template.required_variables = ["TEST_DIR"]
end

# DevOps Engineer
InstanceTemplate.find_or_create_by!(name: "DevOps Engineer") do |template|
  template.description = "Expert in CI/CD, infrastructure, and deployment automation"
  template.category = "devops"
  template.system_template = true
  template.config = {
    "model" => "sonnet",
    "provider" => "claude",
    "directory" => ".",
    "allowed_tools" => ["Read", "Edit", "Write", "Bash"],
    "prompt" => "You are a DevOps engineer specializing in CI/CD pipelines, infrastructure as code, and deployment automation.",
  }
end

# Documentation Writer
InstanceTemplate.find_or_create_by!(name: "Documentation Writer") do |template|
  template.description = "Expert technical writer for clear and comprehensive documentation"
  template.category = "general"
  template.system_template = true
  template.config = {
    "model" => "sonnet",
    "provider" => "claude",
    "directory" => "${DOCS_DIR:=./docs}",
    "allowed_tools" => ["Read", "Edit", "Write"],
    "prompt" => "You are a technical writer specializing in clear, comprehensive, and user-friendly documentation.",
  }
  template.required_variables = ["DOCS_DIR"]
end

# Research Assistant
InstanceTemplate.find_or_create_by!(name: "Research Assistant") do |template|
  template.description = "General-purpose research assistant for gathering and analyzing information"
  template.category = "general"
  template.system_template = true
  template.config = {
    "model" => "sonnet",
    "provider" => "claude",
    "directory" => ".",
    "allowed_tools" => ["Read", "Grep", "WebSearch", "WebFetch"],
    "prompt" => "You are a research assistant skilled at gathering, analyzing, and summarizing information from various sources.",
  }
end

puts "Created #{InstanceTemplate.system.count} system instance templates"
