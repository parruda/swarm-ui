import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["container", "row", "keyInput", "textField"]

  connect() {
    // Parse existing environment variables from the hidden text field
    if (this.hasTextFieldTarget && this.textFieldTarget.value) {
      this.parseAndDisplayVariables(this.textFieldTarget.value)
    }
  }

  parseAndDisplayVariables(text) {
    const lines = text.trim().split('\n').filter(line => line.trim())
    
    lines.forEach(line => {
      const [key, ...valueParts] = line.split('=')
      if (key) {
        const value = valueParts.join('=') // Handle values that contain '='
        this.addVariableRow(key.trim(), value.trim())
      }
    })
  }

  addVariableRow(key = '', value = '') {
    const timestamp = new Date().getTime()
    const template = `
      <div class="flex gap-2 items-start" data-session-environment-variables-target="row">
        <input type="text"
               value="${this.escapeHtml(key)}"
               placeholder="KEY"
               data-session-environment-variables-target="keyInput"
               data-action="input->session-environment-variables#updateTextfield"
               class="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 dark:focus:ring-orange-500 font-mono text-sm">
        <input type="text"
               value="${this.escapeHtml(value)}"
               placeholder="VALUE"
               data-action="input->session-environment-variables#updateTextfield"
               class="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 dark:focus:ring-orange-500 font-mono text-sm">
        <button type="button"
                data-action="click->session-environment-variables#remove"
                class="inline-flex items-center p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-200">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `
    
    this.containerTarget.insertAdjacentHTML("beforeend", template)
    
    // Focus on the new key input if it's a new empty row
    if (!key && !value) {
      const newRow = this.containerTarget.lastElementChild
      const keyInput = newRow.querySelector('[data-session-environment-variables-target="keyInput"]')
      if (keyInput) {
        keyInput.focus()
      }
    }
  }

  add() {
    this.addVariableRow()
  }

  remove(event) {
    const row = event.currentTarget.closest('[data-session-environment-variables-target="row"]')
    if (row) {
      row.remove()
      this.updateTextfield()
    }
  }

  updateTextfield() {
    const rows = this.rowTargets
    const variables = []
    
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input[type="text"]')
      const key = inputs[0]?.value.trim()
      const value = inputs[1]?.value.trim()
      
      if (key && value) {
        variables.push(`${key}=${value}`)
      }
    })
    
    if (this.hasTextFieldTarget) {
      this.textFieldTarget.value = variables.join('\n')
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}