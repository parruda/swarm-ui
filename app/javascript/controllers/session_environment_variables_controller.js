import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["container", "row", "keyInput", "textField"]

  connect() {
    // Parse existing environment variables from the hidden text field
    if (this.hasTextFieldTarget && this.textFieldTarget.value) {
      this.parseAndDisplayVariables(this.textFieldTarget.value)
    }
    
    // Listen for project changes from the filesystem browser controller
    this.projectSelect = document.querySelector('[data-filesystem-browser-target="projectSelect"]')
    if (this.projectSelect) {
      this.projectSelect.addEventListener('change', this.handleProjectChange.bind(this))
      // If project is already selected, fetch its env vars
      if (this.projectSelect.value) {
        this.fetchProjectEnvVars(this.projectSelect.value)
      }
    }
  }
  
  async handleProjectChange(event) {
    const projectId = event.target.value
    if (projectId) {
      await this.fetchProjectEnvVars(projectId)
    } else {
      // Clear all rows if no project is selected
      this.containerTarget.innerHTML = ''
      this.updateTextfield()
    }
  }
  
  async fetchProjectEnvVars(projectId) {
    try {
      const response = await fetch(`/projects/${projectId}/environment_variables`)
      const data = await response.json()
      
      // Save current session-specific variables before clearing
      const currentSessionVars = this.getCurrentSessionVariables()
      
      // Clear everything
      this.containerTarget.innerHTML = ''
      
      if (data.environment_variables && Object.keys(data.environment_variables).length > 0) {
        // Add section header for project variables
        this.addSectionHeader('project', Object.keys(data.environment_variables).length)
        
        // Add project environment variables
        Object.entries(data.environment_variables).forEach(([key, value]) => {
          this.addVariableRow(key, value, true) // true indicates it's from project
        })
        
        // Add divider and section header for session-specific variables
        this.addDivider()
        this.addSectionHeader('session')
      } else if (currentSessionVars.length > 0) {
        // No project vars, but we have session vars - just show session section
        this.addSectionHeader('session')
      }
      
      // Restore session-specific variables
      currentSessionVars.forEach(({key, value}) => {
        this.addVariableRow(key, value, false)
      })
      
      this.updateTextfield()
    } catch (error) {
      console.error("Failed to fetch project environment variables:", error)
    }
  }
  
  getCurrentSessionVariables() {
    const sessionVars = []
    const rows = this.rowTargets
    
    rows.forEach(row => {
      // Only get session-specific variables (not from project)
      if (row.dataset.fromProject === 'false') {
        const inputContainer = row.querySelector('.flex.gap-2')
        const inputs = inputContainer ? inputContainer.querySelectorAll('input[type="text"]') : row.querySelectorAll('input[type="text"]')
        const key = inputs[0]?.value.trim()
        const value = inputs[1]?.value.trim()
        
        if (key || value) { // Keep even if only one field has data
          sessionVars.push({ key, value })
        }
      }
    })
    
    return sessionVars
  }
  
  addSectionHeader(type, count = null) {
    const headerHtml = type === 'project' ? `
      <div class="flex items-center gap-3 mb-3" data-section-header="project">
        <div class="flex items-center gap-2">
          <div class="flex items-center justify-center w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <svg class="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
            </svg>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">Inherited from Project</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">${count} variable${count !== 1 ? 's' : ''} from the selected project</p>
          </div>
        </div>
      </div>
    ` : `
      <div class="flex items-center gap-3 mb-3" data-section-header="session">
        <div class="flex items-center gap-2">
          <div class="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <svg class="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">Session-specific Variables</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">Additional variables for this session only</p>
          </div>
        </div>
      </div>
    `
    
    this.containerTarget.insertAdjacentHTML("beforeend", headerHtml)
  }
  
  addDivider() {
    const dividerHtml = `
      <div class="relative my-6" data-divider="true">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-200 dark:border-gray-700"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="bg-white dark:bg-gray-800 px-3 text-gray-500 dark:text-gray-400 font-medium">or</span>
        </div>
      </div>
    `
    this.containerTarget.insertAdjacentHTML("beforeend", dividerHtml)
  }

  parseAndDisplayVariables(text) {
    const lines = text.trim().split('\n').filter(line => line.trim())
    
    if (lines.length > 0) {
      // Only add session header if we have variables to display
      // and there's no project section already
      const hasProjectSection = this.containerTarget.querySelector('[data-section-header="project"]')
      if (!hasProjectSection) {
        this.addSectionHeader('session')
      }
      
      lines.forEach(line => {
        const [key, ...valueParts] = line.split('=')
        if (key) {
          const value = valueParts.join('=') // Handle values that contain '='
          this.addVariableRow(key.trim(), value.trim())
        }
      })
    }
  }

  addVariableRow(key = '', value = '', fromProject = false) {
    const timestamp = new Date().getTime()
    
    // Different styles for project vs session variables
    const rowClasses = fromProject 
      ? 'group relative pl-4 border-l-2 border-orange-200 dark:border-orange-900/50'
      : 'pl-4'
    
    const inputClasses = fromProject
      ? 'flex-1 px-3 py-2 bg-orange-50 dark:bg-orange-900/10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 dark:focus:ring-orange-500 font-mono text-sm placeholder-gray-400 dark:placeholder-gray-500'
      : 'flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 dark:focus:ring-orange-500 font-mono text-sm'
    
    const template = `
      <div class="${rowClasses} mb-2" data-session-environment-variables-target="row" data-from-project="${fromProject}">
        <div class="flex gap-2 items-start">
          <input type="text"
                 value="${this.escapeHtml(key)}"
                 placeholder="KEY"
                 data-session-environment-variables-target="keyInput"
                 data-action="input->session-environment-variables#updateTextfield"
                 data-from-project="${fromProject}"
                 ${fromProject ? 'readonly' : ''}
                 class="${inputClasses} ${fromProject ? 'cursor-not-allowed opacity-75' : ''}">
          <input type="text"
                 value="${this.escapeHtml(value)}"
                 placeholder="VALUE"
                 data-action="input->session-environment-variables#updateTextfield"
                 data-from-project="${fromProject}"
                 class="${inputClasses}">
          <button type="button"
                  data-action="click->session-environment-variables#remove"
                  class="inline-flex items-center p-2 ${fromProject ? 'text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400' : 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300'} transition-colors duration-200">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        ${fromProject ? `
          <div class="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-full bg-orange-300 dark:bg-orange-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
        ` : ''}
      </div>
    `
    
    this.containerTarget.insertAdjacentHTML("beforeend", template)
    
    // Focus on the new key input if it's a new empty row
    if (!key && !value && !fromProject) {
      const newRow = this.containerTarget.lastElementChild
      const keyInput = newRow.querySelector('[data-session-environment-variables-target="keyInput"]')
      if (keyInput) {
        keyInput.focus()
      }
    }
  }

  add() {
    // Check if we have sections
    const hasProjectSection = this.containerTarget.querySelector('[data-section-header="project"]')
    const sessionHeader = this.containerTarget.querySelector('[data-section-header="session"]')
    
    if (hasProjectSection && !sessionHeader) {
      // Add session section if it doesn't exist
      this.addDivider()
      this.addSectionHeader('session')
    } else if (!hasProjectSection && !sessionHeader) {
      // If no sections exist, add session header first
      this.addSectionHeader('session')
    }
    
    // Add the new row at the end (which will be in the session section)
    this.addVariableRow()
  }

  remove(event) {
    const row = event.currentTarget.closest('[data-session-environment-variables-target="row"]')
    if (row) {
      const isProjectVar = row.dataset.fromProject === 'true'
      row.remove()
      
      // Check if we need to clean up empty sections
      const projectRows = this.containerTarget.querySelectorAll('[data-from-project="true"]')
      const sessionRows = this.containerTarget.querySelectorAll('[data-from-project="false"]')
      
      // If we removed the last project variable, remove the project section
      if (isProjectVar && projectRows.length === 0) {
        const projectHeader = this.containerTarget.querySelector('[data-section-header="project"]')
        const divider = this.containerTarget.querySelector('[data-divider="true"]')
        if (projectHeader) projectHeader.remove()
        if (divider) divider.remove()
      }
      
      // If no variables remain at all, remove all headers
      if (projectRows.length === 0 && sessionRows.length === 0) {
        this.containerTarget.innerHTML = ''
      }
      
      this.updateTextfield()
    }
  }

  updateTextfield() {
    const rows = this.rowTargets
    const variables = []
    
    rows.forEach(row => {
      // Get inputs from the flex container within the row
      const inputContainer = row.querySelector('.flex.gap-2')
      const inputs = inputContainer ? inputContainer.querySelectorAll('input[type="text"]') : row.querySelectorAll('input[type="text"]')
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