# frozen_string_literal: true

# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin "@rails/actioncable", to: "actioncable.esm.js"

# Swarm Visual Builder modules
pin_all_from "app/javascript/swarm_visual_builder", under: "swarm_visual_builder"

# Monaco Editor for diff viewing
pin "monaco-editor", to: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/+esm"

# YAML parsing for import/export
pin "js-yaml", to: "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm"
