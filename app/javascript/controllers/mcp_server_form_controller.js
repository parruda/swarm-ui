import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "typeSelect",
    "stdioFields",
    "sseFields",
    "stdioExample",
    "sseExample",
    "nameInput"
  ]

  connect() {
    this.showFieldsForCurrentType()
    // Clean up any existing invalid characters on load
    if (this.hasNameInputTarget) {
      this.validateName()
    }
  }

  typeChanged(event) {
    this.showFieldsForCurrentType()
  }

  showFieldsForCurrentType() {
    const serverType = this.typeSelectTarget.value

    if (serverType === "stdio") {
      this.showStdioFields()
    } else if (serverType === "sse") {
      this.showSseFields()
    }
  }

  showStdioFields() {
    // Show STDIO fields
    this.stdioFieldsTarget.classList.remove("hidden")
    this.sseFieldsTarget.classList.add("hidden")

    // Show STDIO example
    if (this.hasStdioExampleTarget) {
      this.stdioExampleTarget.classList.remove("hidden")
    }
    if (this.hasSseExampleTarget) {
      this.sseExampleTarget.classList.add("hidden")
    }

    // Update required attributes
    const commandInput = this.stdioFieldsTarget.querySelector('input[name="mcp_server[command]"]')
    const urlInput = this.sseFieldsTarget.querySelector('input[name="mcp_server[url]"]')

    if (commandInput) commandInput.required = true
    if (urlInput) urlInput.required = false
  }

  showSseFields() {
    // Show SSE fields
    this.sseFieldsTarget.classList.remove("hidden")
    this.stdioFieldsTarget.classList.add("hidden")

    // Show SSE example
    if (this.hasSseExampleTarget) {
      this.sseExampleTarget.classList.remove("hidden")
    }
    if (this.hasStdioExampleTarget) {
      this.stdioExampleTarget.classList.add("hidden")
    }

    // Update required attributes
    const commandInput = this.stdioFieldsTarget.querySelector('input[name="mcp_server[command]"]')
    const urlInput = this.sseFieldsTarget.querySelector('input[name="mcp_server[url]"]')

    if (commandInput) commandInput.required = false
    if (urlInput) urlInput.required = true
  }

  // Name validation methods
  preventInvalidCharacters(event) {
    // Allow only lowercase letters and underscores
    const char = String.fromCharCode(event.which || event.keyCode)
    const validPattern = /^[a-z_]$/

    // Allow control keys (backspace, delete, tab, etc.)
    if (event.which === 0 || event.which === 8 || event.which === 9 ||
        event.which === 13 || event.which === 27 || event.ctrlKey || event.metaKey) {
      return
    }

    // Prevent invalid characters
    if (!validPattern.test(char)) {
      event.preventDefault()
    }
  }

  validateName(event) {
    if (!this.hasNameInputTarget) return

    // Remove any invalid characters and convert to lowercase
    const currentValue = this.nameInputTarget.value
    const cleanedValue = currentValue.toLowerCase().replace(/[^a-z_]/g, '')

    if (currentValue !== cleanedValue) {
      this.nameInputTarget.value = cleanedValue

      // Show a brief visual feedback
      this.nameInputTarget.classList.add('ring-2', 'ring-red-500')
      setTimeout(() => {
        this.nameInputTarget.classList.remove('ring-2', 'ring-red-500')
      }, 500)
    }
  }
}