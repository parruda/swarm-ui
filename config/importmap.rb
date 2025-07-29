# frozen_string_literal: true

# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"

# Monaco Editor for diff viewing
pin "monaco-editor", to: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/+esm"

# Note: Rete.js is loaded via script tags in the view due to ES module compatibility issues
