// Template management for SwarmVisualBuilder
export default class TemplateManager {
  constructor(controller) {
    this.controller = controller
  }

  async saveNodeAsTemplate(e) {
    const nodeId = parseInt(e.target.dataset.nodeId)
    const node = this.controller.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Create modal for template name
    const templateName = await this.promptForTemplateName(node.data.name)
    if (!templateName) return // User cancelled
    
    // Get the system prompt and ensure newlines are properly preserved
    let systemPrompt = node.data.system_prompt || node.data.config?.system_prompt || ''
    // Convert literal \n to actual newlines if they exist
    // This handles cases where the prompt was imported or came from JSON with escaped newlines
    if (systemPrompt.includes('\\n')) {
      systemPrompt = systemPrompt.replace(/\\n/g, '\n')
    }
    
    // Prepare template data from node
    const templateData = {
      name: templateName,
      description: node.data.description || 'Instance template created from visual builder',
      category: 'general',
      tags: [],
      system_prompt: systemPrompt,
      config: {
        provider: node.data.provider || 'claude',
        model: node.data.model || 'sonnet',
        directory: node.data.directory || '.',
        allowed_tools: node.data.allowed_tools || node.data.config?.allowed_tools || [],
        vibe: node.data.vibe || node.data.config?.vibe || false,
        worktree: node.data.worktree || node.data.config?.worktree || false
      }
    }
    
    // Add MCP servers if present
    if (node.data.mcps && node.data.mcps.length > 0) {
      templateData.config.mcps = node.data.mcps
    }
    
    // Add OpenAI specific fields if applicable
    if (node.data.provider === 'openai') {
      if (node.data.temperature) templateData.config.temperature = node.data.temperature
      if (node.data.api_version) templateData.config.api_version = node.data.api_version
      if (node.data.reasoning_effort) templateData.config.reasoning_effort = node.data.reasoning_effort
    }
    
    // Save template to database
    try {
      const response = await fetch('/instance_templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ instance_template: templateData })
      })
      
      if (response.ok) {
        const result = await response.json()
        this.controller.uiComponents.showFlashMessage(`Template "${templateName}" saved successfully!`, 'success')
        
        // Optionally refresh the templates list in the left panel
        await this.refreshTemplatesList()
      } else {
        let errorMessage = 'Unknown error'
        const contentType = response.headers.get('content-type')
        
        try {
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json()
            errorMessage = error.message || error.errors?.join(', ') || 'Unknown error'
          } else {
            // Response is not JSON (likely HTML error page)
            const text = await response.text()
            console.error('Non-JSON error response:', text)
            // Try to extract error from HTML if possible
            const match = text.match(/<h1[^>]*>([^<]+)<\/h1>/)
            errorMessage = match ? match[1] : `Server error (${response.status})`
          }
        } catch (e) {
          console.error('Error parsing response:', e)
          errorMessage = `Server error (${response.status})`
        }
        
        this.controller.uiComponents.showFlashMessage('Failed to save template: ' + errorMessage, 'error')
      }
    } catch (error) {
      console.error('Error saving template:', error)
      this.controller.uiComponents.showFlashMessage('Failed to save template: ' + error.message, 'error')
    }
  }

  async refreshTemplatesList() {
    try {
      const response = await fetch('/instance_templates', {
        headers: {
          'Accept': 'application/json'
        }
      })
      if (response.ok) {
        const templates = await response.json()
        
        // Update the templates list in the left panel
        const templatesContainer = this.controller.instanceTemplatesTarget
        templatesContainer.innerHTML = templates.map(template => {
          // Merge system_prompt into config for consistency with existing templates
          const configWithPrompt = { ...template.config, system_prompt: template.system_prompt }
          return `
            <div draggable="true"
                 data-template-card
                 data-template-id="${template.id}"
                 data-template-name="${template.name}"
                 data-template-description="${template.description}"
                 data-template-config='${JSON.stringify(configWithPrompt).replace(/'/g, '&#39;')}'
                 class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
              <div class="flex items-start justify-between">
                <div>
                  <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">${template.name}</h4>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${template.description}</p>
                </div>
                <span class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                  ${template.model}
                </span>
              </div>
            </div>
          `
        }).join('')
        
        // Re-initialize drag and drop for new templates
        this.initializeTemplateDragAndDrop()
      }
    } catch (error) {
      console.error('Error refreshing templates:', error)
    }
  }

  initializeTemplateDragAndDrop() {
    // Re-bind drag event listeners for templates
    const templates = this.controller.instanceTemplatesTarget.querySelectorAll('[data-template-card]')
    templates.forEach(template => {
      // Remove any existing listeners first
      template.removeEventListener('dragstart', this.handleTemplateDragStart)
      // Add new listener
      template.addEventListener('dragstart', this.handleTemplateDragStart.bind(this))
    })
  }

  handleTemplateDragStart(e) {
    if (e.target.hasAttribute('data-template-card')) {
      const templateData = {
        id: e.target.dataset.templateId,
        name: e.target.dataset.templateName,
        description: e.target.dataset.templateDescription,
        config: JSON.parse(e.target.dataset.templateConfig),
        model: JSON.parse(e.target.dataset.templateConfig).model,
        provider: JSON.parse(e.target.dataset.templateConfig).provider
      }
      e.dataTransfer.setData('template', JSON.stringify(templateData))
      e.dataTransfer.setData('type', 'template')
    }
  }

  filterTemplates(e) {
    const searchTerm = e.target.value.toLowerCase()
    const templates = this.controller.instanceTemplatesTarget.querySelectorAll('[data-template-card]')
    
    templates.forEach(template => {
      const name = template.dataset.templateName.toLowerCase()
      const description = template.dataset.templateDescription.toLowerCase()
      const model = JSON.parse(template.dataset.templateConfig).model?.toLowerCase() || ''
      
      const matches = name.includes(searchTerm) || 
                     description.includes(searchTerm) || 
                     model.includes(searchTerm)
      
      template.style.display = matches ? 'block' : 'none'
    })
  }

  async promptForTemplateName(defaultName) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      
      const modal = document.createElement('div')
      modal.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4'
      modal.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Save as Template</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter a name for this instance template.
        </p>
        <input type="text" 
               value="${defaultName || 'My Template'}" 
               class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent"
               placeholder="Template name">
        <div class="flex justify-end gap-3 mt-6">
          <button type="button" 
                  class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                  data-action="cancel">
            Cancel
          </button>
          <button type="button" 
                  class="px-4 py-2 text-sm font-medium text-white bg-green-600 dark:bg-green-600 rounded-md hover:bg-green-700 dark:hover:bg-green-700"
                  data-action="save">
            Save Template
          </button>
        </div>
      `
      
      overlay.appendChild(modal)
      document.body.appendChild(overlay)
      
      // Focus input and select all text
      const input = modal.querySelector('input')
      input.focus()
      input.select()
      
      const handleSave = () => {
        const name = input.value.trim()
        if (name) {
          document.body.removeChild(overlay)
          resolve(name)
        } else {
          input.classList.add('border-red-500')
          input.focus()
        }
      }
      
      const handleCancel = () => {
        document.body.removeChild(overlay)
        resolve(null)
      }
      
      modal.querySelector('[data-action="save"]').addEventListener('click', handleSave)
      modal.querySelector('[data-action="cancel"]').addEventListener('click', handleCancel)
      
      // Allow Enter key to save
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleSave()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          handleCancel()
        }
      })
      
      // Click outside to cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleCancel()
      })
    })
  }
}