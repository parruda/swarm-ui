// UI Components for SwarmVisualBuilder
export default class UIComponents {
  constructor(controller) {
    this.controller = controller
  }

  // Flash message functionality
  showFlashMessage(message, type = 'success') {
    // Remove any existing flash messages
    const existingFlash = document.querySelector('.flash-message')
    if (existingFlash) {
      existingFlash.remove()
    }
    
    // Create flash message element - positioned in horizontal center
    const flash = document.createElement('div')
    flash.className = `flash-message fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-lg shadow-lg transition-all transform ${
      type === 'success' 
        ? 'bg-green-500 text-white' 
        : 'bg-red-500 text-white'
    }`
    
    flash.innerHTML = `
      <div class="flex items-center">
        ${type === 'success' 
          ? '<svg class="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>'
          : '<svg class="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>'
        }
        <span>${message}</span>
      </div>
    `
    
    document.body.appendChild(flash)
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      flash.classList.add('-translate-y-full', 'opacity-0')
      setTimeout(() => flash.remove(), 300)
    }, 5000)
  }

  // Notification for canvas refresh
  showNotification(message) {
    // Remove any existing notification
    const existingNotification = document.querySelector('.swarm-notification')
    if (existingNotification) {
      existingNotification.remove()
    }
    
    // Create notification at top of canvas
    const notification = document.createElement('div')
    notification.className = 'swarm-notification fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 transition-all duration-300 translate-y-0 opacity-100'
    notification.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span class="font-medium">${message}</span>
    `
    document.body.appendChild(notification)
    
    // Fade out and remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('translate-y-2', 'opacity-0')
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }

  // Tab switching for right sidebar
  switchToProperties() {
    this.controller.propertiesTabTarget.classList.remove('hidden')
    this.controller.yamlPreviewTabTarget.classList.add('hidden')
    if (this.controller.hasChatTabTarget) {
      this.controller.chatTabTarget.classList.add('hidden')
    }
    
    this.controller.propertiesTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.controller.propertiesTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.controller.yamlTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.controller.yamlTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    if (this.controller.hasChatTabButtonTarget) {
      this.controller.chatTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
      this.controller.chatTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    }
  }

  switchToYaml() {
    this.controller.yamlPreviewTabTarget.classList.remove('hidden')
    this.controller.propertiesTabTarget.classList.add('hidden')
    if (this.controller.hasChatTabTarget) {
      this.controller.chatTabTarget.classList.add('hidden')
    }
    
    this.controller.yamlTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.controller.yamlTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.controller.propertiesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.controller.propertiesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    if (this.controller.hasChatTabButtonTarget) {
      this.controller.chatTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
      this.controller.chatTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    }
    
    this.controller.updateYamlPreview()
  }

  // Tab switching for left sidebar
  switchToInstancesTab() {
    // Update tab buttons
    this.controller.instancesTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.controller.instancesTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    this.controller.mcpServersTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.controller.mcpServersTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    
    // Show/hide tab content
    this.controller.instancesTabTarget.classList.remove('hidden')
    this.controller.mcpServersTabTarget.classList.add('hidden')
  }

  switchToMcpServersTab() {
    // Update tab buttons
    this.controller.mcpServersTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.controller.mcpServersTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    this.controller.instancesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.controller.instancesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    
    // Show/hide tab content
    this.controller.mcpServersTabTarget.classList.remove('hidden')
    this.controller.instancesTabTarget.classList.add('hidden')
  }

  // Sidebar resize functionality
  startResize(e) {
    e.preventDefault()
    e.stopPropagation()
    this.controller.startX = e.pageX
    this.controller.startWidth = this.controller.rightSidebarTarget.offsetWidth
    
    // Store bound functions so we can remove them later
    this.controller.boundDoResize = (e) => this.doResize(e)
    this.controller.boundStopResize = (e) => this.stopResize(e)
    
    // Add temporary event listeners with capture to ensure they run first
    document.addEventListener('mousemove', this.controller.boundDoResize, true)
    document.addEventListener('mouseup', this.controller.boundStopResize, true)
    
    // Add resize cursor to body during resize
    document.body.style.cursor = 'ew-resize'
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none'
    
    // Add a transparent overlay to prevent other interactions
    this.createResizeOverlay()
  }

  doResize(e) {
    e.preventDefault()
    e.stopPropagation()
    
    const diff = this.controller.startX - e.pageX  // Reverse because we're resizing from the left edge
    const newWidth = this.controller.startWidth + diff
    
    // Respect min and max width
    const minWidth = 300
    const maxWidth = 800
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      this.controller.rightSidebarTarget.style.width = `${newWidth}px`
    }
  }

  stopResize(e) {
    e.preventDefault()
    e.stopPropagation()
    
    // Remove temporary event listeners (with capture flag)
    document.removeEventListener('mousemove', this.controller.boundDoResize, true)
    document.removeEventListener('mouseup', this.controller.boundStopResize, true)
    
    // Clean up bound functions
    this.controller.boundDoResize = null
    this.controller.boundStopResize = null
    
    // Reset cursor
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    
    // Remove overlay
    this.removeResizeOverlay()
  }

  expandSidebarToMax() {
    if (!this.controller.hasRightSidebarTarget) {
      return
    }
    
    const maxWidth = 800
    const currentWidth = this.controller.rightSidebarTarget.offsetWidth
    
    // Only expand if not already at max
    if (currentWidth >= maxWidth) {
      return
    }
    
    // Add transition for smooth animation
    this.controller.rightSidebarTarget.style.transition = 'width 0.3s ease-out'
    this.controller.rightSidebarTarget.style.width = `${maxWidth}px`
    
    // Remove transition after animation completes
    setTimeout(() => {
      this.controller.rightSidebarTarget.style.transition = ''
    }, 300)
  }

  createResizeOverlay() {
    // Create an invisible overlay to capture all mouse events during resize
    this.resizeOverlay = document.createElement('div')
    this.resizeOverlay.style.position = 'fixed'
    this.resizeOverlay.style.top = '0'
    this.resizeOverlay.style.left = '0'
    this.resizeOverlay.style.width = '100%'
    this.resizeOverlay.style.height = '100%'
    this.resizeOverlay.style.zIndex = '9999'
    this.resizeOverlay.style.cursor = 'ew-resize'
    this.resizeOverlay.style.userSelect = 'none'
    document.body.appendChild(this.resizeOverlay)
  }

  removeResizeOverlay() {
    if (this.resizeOverlay) {
      document.body.removeChild(this.resizeOverlay)
      this.resizeOverlay = null
    }
  }

  // Show multi-select message in properties panel
  showMultiSelectMessage() {
    this.controller.propertiesPanelTarget.innerHTML = `
      <div class="p-4 text-center text-gray-500 dark:text-gray-400">
        <p class="font-medium mb-2">${this.controller.selectedNodes.length} nodes selected</p>
        <p class="text-sm">Select a single node to view/edit its properties</p>
      </div>
    `
  }

  // Clear properties panel
  clearPropertiesPanel() {
    // Show global swarm properties when no node is selected
    this.showSwarmProperties()
  }
  
  showSwarmProperties() {
    const beforeCommands = this.controller.beforeCommands || []
    const swarmName = this.controller.nameInputTarget ? this.controller.nameInputTarget.value : ''
    
    this.controller.propertiesPanelTarget.innerHTML = `
      <div class="p-4 space-y-4 overflow-y-auto">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Swarm Properties</h3>
        
        <div class="space-y-4">
          <!-- Swarm Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Swarm Name <span class="text-red-500">*</span></label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
              The name of your swarm configuration
            </p>
            <input type="text" 
                   value="${swarmName || 'my_swarm'}" 
                   data-swarm-name-input
                   placeholder="my_swarm"
                   class="block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- Before Commands -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Before Commands
              <span class="text-xs text-gray-500 dark:text-gray-400 block mt-1">
                Commands to run when booting the swarm (e.g., npm install, docker-compose up)
              </span>
            </label>
            <div id="before-commands-list" class="space-y-2">
              ${beforeCommands.map((cmd, index) => `
                <div class="flex items-center gap-2">
                  <input type="text" 
                         value="${cmd}" 
                         data-before-index="${index}"
                         placeholder="Enter command..."
                         class="flex-1 rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm font-mono focus:outline-none">
                  <button type="button"
                          data-action="click->swarm-visual-builder#removeBeforeCommand"
                          data-index="${index}"
                          class="p-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
              `).join('')}
            </div>
            <button type="button"
                    data-action="click->swarm-visual-builder#addBeforeCommand"
                    class="mt-2 w-full px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm transition-colors">
              <svg class="h-4 w-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              Add Command
            </button>
          </div>
          
          <!-- Info about instances -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400 text-center">
              ${this.controller.nodeManager.getNodes().length === 0 
                ? 'Drag instances from the left panel or click "Add Blank Instance" to get started'
                : `${this.controller.nodeManager.getNodes().length} instance${this.controller.nodeManager.getNodes().length !== 1 ? 's' : ''} configured`
              }
            </p>
          </div>
        </div>
      </div>
    `
    
    // Add change listener for swarm name input
    const swarmNameInput = this.controller.propertiesPanelTarget.querySelector('[data-swarm-name-input]')
    if (swarmNameInput) {
      swarmNameInput.addEventListener('input', (e) => this.updateSwarmName(e))
    }
    
    // Add change listeners for before command inputs
    this.controller.propertiesPanelTarget.querySelectorAll('[data-before-index]').forEach(input => {
      input.addEventListener('input', (e) => this.updateBeforeCommand(e))
    })
  }
  
  updateSwarmName(e) {
    // Update the hidden nameInput target that's used by YAML generation
    if (this.controller.hasNameInputTarget) {
      this.controller.nameInputTarget.value = e.target.value
    }
    this.controller.updateYamlPreview()
  }
  
  updateBeforeCommand(e) {
    const index = parseInt(e.target.dataset.beforeIndex)
    if (!this.controller.beforeCommands) {
      this.controller.beforeCommands = []
    }
    this.controller.beforeCommands[index] = e.target.value
    this.controller.updateYamlPreview()
  }

  // Update empty state
  updateEmptyState() {
    const hasNodes = this.controller.nodeManager.getNodes().length > 0
    this.controller.emptyStateTarget.style.display = hasNodes ? 'none' : 'flex'
  }
}