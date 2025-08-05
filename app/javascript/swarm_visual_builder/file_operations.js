// File operations for SwarmVisualBuilder
export default class FileOperations {
  constructor(controller) {
    this.controller = controller
  }

  async saveSwarm() {
    const swarmData = this.controller.buildSwarmData()
    const yaml = this.controller.generateReadableYaml(swarmData)
    
    // Always work with files now
    if (this.controller.isFileEditValue && this.controller.filePathValue) {
      // Editing existing file - save to same path
      await this.saveToFile(this.controller.filePathValue, yaml)
    } else if (this.controller.projectPathValue) {
      // Creating new file - prompt for filename
      await this.saveAsNewFile(yaml)
    } else {
      // No project path available
      this.controller.showFlashMessage('Cannot save: No project selected', 'error')
    }
  }

  async saveToFile(filePath, yaml) {
    try {
      const response = await fetch('/projects/save_swarm_file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({
          file_path: filePath,
          yaml_content: yaml
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        
        // Update the file path for future saves
        this.controller.filePathValue = result.file_path
        this.controller.isFileEditValue = true
        this.controller.isNewFileValue = false
        
        // Show success message
        this.controller.showFlashMessage(result.message || 'Swarm file saved successfully', 'success')
        
        // Enable the Launch button
        this.enableLaunchButton()
        
        // Update Save button text from "Save as..." to "Save"
        this.updateSaveButtonText()
        
        // Enable chat after successful save
        this.controller.chatIntegration.enableChatAfterSave(result.file_path)
        
        // Update URL to reflect editing state (for new files)
        if (!window.location.pathname.includes('/edit_swarm_file')) {
          this.updateUrlForEditing(result.file_path)
        }
        
        // Don't redirect - stay on the page
        if (result.redirect_url) {
          // Only redirect if explicitly requested
          window.location.href = result.redirect_url
        }
      } else {
        const error = await response.json()
        this.controller.showFlashMessage('Failed to save swarm file: ' + (error.message || 'Unknown error'), 'error')
      }
    } catch (error) {
      console.error('Save error:', error)
      this.controller.showFlashMessage('Failed to save swarm file: ' + error.message, 'error')
    }
  }

  async saveAsNewFile(yaml) {
    // Generate default filename from swarm name
    const swarmName = this.controller.nameInputTarget.value || 'swarm'
    const defaultFilename = swarmName.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.yml'
    
    // Prompt for filename
    const filename = await this.promptForFilename(defaultFilename)
    if (!filename) return // User cancelled
    
    // Build full path
    const filePath = `${this.controller.projectPathValue}/${filename}`
    
    // Check if file exists
    const fileExists = await this.checkFileExists(filePath)
    if (fileExists) {
      const shouldOverwrite = await this.confirmOverwrite(filename)
      if (!shouldOverwrite) {
        // User cancelled, prompt again
        return this.saveAsNewFile(yaml)
      }
    }
    
    // Save to file
    await this.saveToFile(filePath, yaml)
  }

  async checkFileExists(filePath) {
    try {
      const response = await fetch('/projects/check_file_exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ file_path: filePath })
      })
      
      if (response.ok) {
        const result = await response.json()
        return result.exists
      }
      return false
    } catch (error) {
      console.error('Error checking file existence:', error)
      return false
    }
  }

  async launchSwarm() {
    // Check if we have a saved file path
    if (!this.controller.filePathValue) {
      this.controller.showFlashMessage('Please save the swarm file first before launching', 'error')
      return
    }
    
    // Get the relative path from the project directory
    const projectPath = this.controller.projectPathValue
    const filePath = this.controller.filePathValue
    let relativePath = filePath
    
    // If the file path starts with the project path, make it relative
    if (filePath.startsWith(projectPath)) {
      relativePath = filePath.substring(projectPath.length)
      // Remove leading slash if present
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1)
      }
    } else {
      // If not within project path, just use the filename
      relativePath = filePath.split('/').pop()
    }
    
    // Navigate to the new session page with the swarm config pre-selected
    const projectId = this.controller.projectIdValue
    if (projectId) {
      // Build the URL with the swarm config pre-selected
      const newSessionUrl = `/sessions/new?project_id=${projectId}&config=${encodeURIComponent(relativePath)}`
      window.location.href = newSessionUrl
    } else {
      this.controller.showFlashMessage('Cannot launch swarm: project not found', 'error')
    }
  }

  exportYaml() {
    const swarmData = this.controller.buildSwarmData()
    const yaml = this.controller.generateReadableYaml(swarmData)
    
    // Normalize filename: lowercase and replace spaces with dashes
    const filename = (this.controller.nameInputTarget.value || 'swarm')
      .toLowerCase()
      .replace(/\s+/g, '-')
    
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.yml`
    a.click()
    URL.revokeObjectURL(url)
  }

  async copyYaml() {
    const yaml = this.controller.yamlPreviewTarget.querySelector('pre').textContent
    
    try {
      await navigator.clipboard.writeText(yaml)
      
      // Update button text temporarily to show success
      const button = this.controller.yamlPreviewTabTarget.querySelector('[data-action="click->swarm-visual-builder#copyYaml"]')
      const originalHTML = button.innerHTML
      button.innerHTML = `
        <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        Copied!
      `
      button.classList.add('text-green-600', 'dark:text-green-400')
      
      // Reset after 2 seconds
      setTimeout(() => {
        button.innerHTML = originalHTML
        button.classList.remove('text-green-600', 'dark:text-green-400')
      }, 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = yaml
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  updateSaveButtonText() {
    const saveButton = document.getElementById('save-swarm')
    if (saveButton) {
      // Find the text node (last child after the icon)
      const textNode = saveButton.childNodes[saveButton.childNodes.length - 1]
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        if (this.controller.isFileEditValue && this.controller.filePathValue) {
          textNode.textContent = 'Save'
        } else {
          textNode.textContent = 'Save as...'
        }
      }
    }
  }

  enableLaunchButton() {
    const launchButton = document.getElementById('launch-swarm')
    if (launchButton) {
      launchButton.disabled = false
      launchButton.classList.remove('opacity-50', 'cursor-not-allowed')
      launchButton.classList.add('hover:bg-blue-700', 'dark:hover:bg-blue-700')
    }
  }

  updateUrlForEditing(filePath) {
    // Only update URL if we're creating a new file (not already editing)
    const currentPath = window.location.pathname
    const projectId = this.controller.projectIdValue
    
    if (projectId && filePath && !currentPath.includes('/edit_swarm_file')) {
      // Use History API to update URL without reload
      const newUrl = `/projects/${projectId}/edit_swarm_file?file_path=${encodeURIComponent(filePath)}`
      window.history.replaceState({ filePath: filePath }, '', newUrl)
    }
  }

  // Modal dialogs for file operations
  async promptForFilename(defaultName) {
    return new Promise((resolve) => {
      // Implementation moved from main controller
      // Ensure default name ends with .yml (not .yaml)
      let normalizedDefault = defaultName.replace(/\.(yaml|yml)$/i, '')
      normalizedDefault = normalizedDefault + '.yml'
      
      // Create modal overlay
      const overlay = document.createElement('div')
      overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      
      // Create modal
      const modal = document.createElement('div')
      modal.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4'
      modal.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Save Swarm File</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter a filename for the swarm configuration.
          <br/>
          <span class="text-xs">It will be saved in: ${this.controller.projectPathValue}/</span>
        </p>
        <input type="text" 
               value="${normalizedDefault}" 
               class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 dark:focus:ring-orange-400 focus:border-transparent"
               placeholder="filename.yml">
        <div class="flex justify-end gap-3 mt-6">
          <button type="button" 
                  class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                  data-action="cancel">
            Cancel
          </button>
          <button type="button" 
                  class="px-4 py-2 text-sm font-medium text-white bg-orange-600 dark:bg-orange-600 rounded-md hover:bg-orange-700 dark:hover:bg-orange-700"
                  data-action="save">
            Save
          </button>
        </div>
      `
      
      overlay.appendChild(modal)
      document.body.appendChild(overlay)
      
      // Focus input and select only the basename (not the extension)
      const input = modal.querySelector('input')
      input.focus()
      
      // Select only the basename part
      const baseName = normalizedDefault.replace('.yml', '')
      input.setSelectionRange(0, baseName.length)
      
      // Ensure .yml extension on every input change
      input.addEventListener('input', (e) => {
        const cursorPos = e.target.selectionStart
        let value = e.target.value
        
        // Remove any .yaml or .yml the user might have typed
        value = value.replace(/\.(yaml|yml)$/i, '')
        
        // Always append .yml
        value = value + '.yml'
        
        // Set the new value
        e.target.value = value
        
        // Restore cursor position (but not past the basename)
        const newCursorPos = Math.min(cursorPos, value.length - 4) // -4 for '.yml'
        e.target.setSelectionRange(newCursorPos, newCursorPos)
      })
      
      // Handle actions
      const handleSave = () => {
        let filename = input.value.trim()
        
        // The filename should already have .yml, but ensure it
        if (!filename.endsWith('.yml')) {
          filename = filename.replace(/\.(yaml|yml)$/i, '') + '.yml'
        }
        
        // Get just the basename for validation
        const basename = filename.replace('.yml', '')
        
        // Validate filename (not empty and not just dots/spaces)
        if (!basename || basename === '' || /^\.+$/.test(basename)) {
          input.classList.add('ring-2', 'ring-red-500')
          setTimeout(() => input.classList.remove('ring-2', 'ring-red-500'), 2000)
          return
        }
        
        document.body.removeChild(overlay)
        resolve(filename)
      }
      
      const handleCancel = () => {
        document.body.removeChild(overlay)
        resolve(null)
      }
      
      modal.querySelector('[data-action="save"]').addEventListener('click', handleSave)
      modal.querySelector('[data-action="cancel"]').addEventListener('click', handleCancel)
      
      // Handle enter key
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleSave()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          handleCancel()
        }
      })
      
      // Handle clicking outside
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleCancel()
      })
    })
  }

  async confirmOverwrite(filename) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      
      const modal = document.createElement('div')
      modal.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4'
      modal.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">File Already Exists</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The file <span class="font-mono font-semibold">${filename}</span> already exists.
          <br/>
          Do you want to overwrite it?
        </p>
        <div class="flex justify-end gap-3 mt-6">
          <button type="button" 
                  class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                  data-action="cancel">
            Cancel
          </button>
          <button type="button" 
                  class="px-4 py-2 text-sm font-medium text-white bg-red-600 dark:bg-red-600 rounded-md hover:bg-red-700 dark:hover:bg-red-700"
                  data-action="overwrite">
            Overwrite
          </button>
        </div>
      `
      
      overlay.appendChild(modal)
      document.body.appendChild(overlay)
      
      const handleOverwrite = () => {
        document.body.removeChild(overlay)
        resolve(true)
      }
      
      const handleCancel = () => {
        document.body.removeChild(overlay)
        resolve(false)
      }
      
      modal.querySelector('[data-action="overwrite"]').addEventListener('click', handleOverwrite)
      modal.querySelector('[data-action="cancel"]').addEventListener('click', handleCancel)
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleCancel()
      })
    })
  }
}