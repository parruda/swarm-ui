import { Controller } from "@hotwired/stimulus"
import jsyaml from "js-yaml"
import NodeManager from "swarm_visual_builder/node_manager"
import ConnectionManager from "swarm_visual_builder/connection_manager"
import PathRenderer from "swarm_visual_builder/path_renderer"
import LayoutManager from "swarm_visual_builder/layout_manager"

export default class extends Controller {
  static targets = [
    "canvas",
    "nameInput",
    "tagInput",
    "tagsContainer",
    "searchInput",
    "instanceTemplates",
    "propertiesPanel",
    "yamlPreview",
    "yamlPreviewTab",
    "propertiesTab",
    "propertiesTabButton",
    "yamlTabButton",
    "zoomLevel",
    "emptyState",
    "importInput"
  ]
  
  async connect() {
    console.log("Swarm visual builder connected")
    
    // Initialize managers
    this.nodeManager = new NodeManager(this)
    this.connectionManager = new ConnectionManager(this)
    this.pathRenderer = new PathRenderer(this)
    this.layoutManager = new LayoutManager(this)
    
    // Initialize state
    this.tags = []
    this.selectedNode = null
    this.selectedConnection = null
    this.mainNodeId = null
    this.nodeKeyMap = new Map()
    
    // Canvas properties
    this.canvasSize = 10000
    this.canvasCenter = this.canvasSize / 2
    this.zoomLevel = 1
    this.minZoom = 0.1
    this.maxZoom = 2
    this.isPanning = false
    this.panStartX = 0
    this.panStartY = 0
    this.dragStartX = 0
    this.dragStartY = 0
    this.draggedNode = null
    this.pendingConnection = null
    this.shiftPressed = false
    
    await this.initializeVisualBuilder()
    this.setupEventListeners()
    this.setupKeyboardShortcuts()
  }
  
  async initializeVisualBuilder() {
    // Create container
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.position = 'relative'
    container.style.overflow = 'auto'
    container.style.boxSizing = 'border-box'
    container.className = 'visual-builder-canvas bg-gray-100 dark:bg-gray-900'
    this.canvasTarget.appendChild(container)
    
    // Create viewport with pre-allocated size
    this.viewport = document.createElement('div')
    this.viewport.style.position = 'relative'
    this.viewport.style.width = `${this.canvasSize}px`
    this.viewport.style.height = `${this.canvasSize}px`
    this.viewport.style.transformOrigin = 'top left'
    this.viewport.style.transform = `scale(${this.zoomLevel})`
    
    container.appendChild(this.viewport)
    this.container = container
    
    // Create SVG for connections
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    this.svg.style.position = 'absolute'
    this.svg.style.top = '0'
    this.svg.style.left = '0'
    this.svg.style.width = '100%'
    this.svg.style.height = '100%'
    this.svg.style.pointerEvents = 'none'
    this.svg.style.overflow = 'visible'
    
    // Create connections group
    const connectionsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g")
    connectionsGroup.id = 'connections'
    this.svg.appendChild(connectionsGroup)
    
    // Create drag path
    const dragPath = document.createElementNS("http://www.w3.org/2000/svg", "path")
    dragPath.id = 'dragPath'
    dragPath.style.display = 'none'
    dragPath.setAttribute('stroke', '#10b981')
    dragPath.setAttribute('stroke-width', '2')
    dragPath.setAttribute('fill', 'none')
    dragPath.setAttribute('stroke-dasharray', '5,5')
    this.svg.appendChild(dragPath)
    
    this.viewport.appendChild(this.svg)
    
    // Initialize path renderer
    this.pathRenderer.init(this.svg, this.viewport)
    
    // Center viewport initially
    this.centerViewport()
    this.updateEmptyState()
  }
  
  centerViewport() {
    const containerRect = this.container.getBoundingClientRect()
    const centerX = this.canvasCenter - (containerRect.width / 2 / this.zoomLevel)
    const centerY = this.canvasCenter - (containerRect.height / 2 / this.zoomLevel)
    this.container.scrollLeft = centerX * this.zoomLevel
    this.container.scrollTop = centerY * this.zoomLevel
  }
  
  setupEventListeners() {
    // Canvas click handler
    this.viewport.addEventListener('click', (e) => {
      if (e.target === this.viewport || e.target === this.svg) {
        this.deselectAll()
      }
    })
    
    // Container scroll event for dynamic canvas expansion
    this.container.addEventListener('scroll', (e) => {
      // No longer needed with pre-allocated canvas
    })
    
    // Drag and drop from library
    this.instanceTemplatesTarget.addEventListener('dragstart', (e) => {
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
      }
    })
    
    this.viewport.addEventListener('dragover', (e) => {
      e.preventDefault()
    })
    
    this.viewport.addEventListener('drop', (e) => {
      e.preventDefault()
      const templateData = JSON.parse(e.dataTransfer.getData('template'))
      if (templateData) {
        // Get the viewport's bounding rect (which is scaled)
        const viewportRect = this.viewport.getBoundingClientRect()
        
        // Mouse position relative to the scaled viewport
        const mouseX = e.clientX - viewportRect.left
        const mouseY = e.clientY - viewportRect.top
        
        // Convert from scaled pixels to actual viewport pixels
        const viewportX = mouseX / this.zoomLevel
        const viewportY = mouseY / this.zoomLevel
        
        // Node dimensions (matching what's set in createNodeElement)
        const nodeWidth = 250
        const nodeHeight = 120 // Approximate height based on content
        
        // Convert to canvas coordinates (relative to center)
        // Center the node on the mouse cursor
        const x = viewportX - this.canvasCenter - (nodeWidth / 2)
        const y = viewportY - this.canvasCenter - (nodeHeight / 2)
        
        this.addNode(templateData, x, y)
      }
    })
    
    // Mouse events for panning and node dragging
    this.viewport.addEventListener('mousedown', (e) => this.handleMouseDown(e))
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e))
    document.addEventListener('mouseup', (e) => this.handleMouseUp(e))
    
    // Wheel event for zooming
    this.container.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel * delta))
        
        if (newZoom !== this.zoomLevel) {
          const rect = this.container.getBoundingClientRect()
          const mouseX = e.clientX - rect.left
          const mouseY = e.clientY - rect.top
          
          const scrollLeft = this.container.scrollLeft
          const scrollTop = this.container.scrollTop
          
          const worldX = (scrollLeft + mouseX) / this.zoomLevel
          const worldY = (scrollTop + mouseY) / this.zoomLevel
          
          this.zoomLevel = newZoom
          this.viewport.style.transform = `scale(${this.zoomLevel})`
          this.zoomLevelTarget.textContent = Math.round(this.zoomLevel * 100) + '%'
          
          const newScrollLeft = worldX * this.zoomLevel - mouseX
          const newScrollTop = worldY * this.zoomLevel - mouseY
          
          this.container.scrollLeft = newScrollLeft
          this.container.scrollTop = newScrollTop
          
          this.updateConnections()
        }
      }
    }, { passive: false })
    
    // Touch events for mobile
    let touchStartDistance = 0
    let lastTouchZoom = 1
    
    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        touchStartDistance = Math.sqrt(dx * dx + dy * dy)
        lastTouchZoom = this.zoomLevel
        e.preventDefault()
      }
    })
    
    this.container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchStartDistance > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const currentDistance = Math.sqrt(dx * dx + dy * dy)
        
        const scale = currentDistance / touchStartDistance
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, lastTouchZoom * scale))
        
        if (newZoom !== this.zoomLevel) {
          this.zoomLevel = newZoom
          this.viewport.style.transform = `scale(${this.zoomLevel})`
          this.zoomLevelTarget.textContent = Math.round(this.zoomLevel * 100) + '%'
          this.updateConnections()
        }
        e.preventDefault()
      }
    })
  }
  
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && !this.shiftPressed) {
        this.shiftPressed = true
        this.viewport.classList.add('shift-pressed')
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedNode) {
          this.deleteSelectedNode()
        } else if (this.selectedConnection !== null) {
          this.deleteSelectedConnection()
        }
      }
    })
    
    document.addEventListener('keyup', (e) => {
      if (!e.shiftKey && this.shiftPressed) {
        this.shiftPressed = false
        this.viewport.classList.remove('shift-pressed')
      }
    })
  }
  
  handleMouseDown(e) {
    const target = e.target
    
    if (target.classList.contains('socket')) {
      this.startConnection(e)
    } else if (target.closest('.swarm-node')) {
      if (!this.shiftPressed) {
        this.startNodeDrag(e)
      }
    } else if (this.shiftPressed || e.target === this.viewport) {
      this.startPanning(e)
    }
  }
  
  handleMouseMove(e) {
    if (this.isPanning) {
      this.continuePanning(e)
    } else if (this.draggedNode) {
      this.continueNodeDrag(e)
    } else if (this.pendingConnection) {
      this.updateDragPath(e)
    }
  }
  
  handleMouseUp(e) {
    if (this.isPanning) {
      this.endPanning()
    } else if (this.draggedNode) {
      this.endNodeDrag()
    } else if (this.pendingConnection) {
      this.endConnection(e)
    }
  }
  
  // Node operations
  addNode(templateData, x, y) {
    const node = this.nodeManager.createNode(templateData, { x, y })
    this.renderNode(node)
    this.updateEmptyState()
    this.updateYamlPreview()
  }
  
  renderNode(node) {
    const nodeElement = this.createNodeElement(node)
    nodeElement.style.left = `${node.data.x + this.canvasCenter}px`
    nodeElement.style.top = `${node.data.y + this.canvasCenter}px`
    this.viewport.appendChild(nodeElement)
    
    // Store reference
    node.element = nodeElement
    
    // Set as main if it's the first node and not OpenAI
    if (!this.mainNodeId && node.data.provider !== 'openai') {
      this.setMainNode(node.id)
    }
  }
  
  createNodeElement(node) {
    const nodeEl = document.createElement('div')
    nodeEl.className = 'swarm-node absolute'
    nodeEl.dataset.nodeId = node.id
    nodeEl.style.width = '250px'
    
    // Create node content
    const content = `
      <div class="node-header mb-2">
        <h3 class="node-title flex items-center justify-between">
          <span>${node.data.name}</span>
          ${node.id === this.mainNodeId ? '<span class="text-xs bg-orange-500 text-white px-2 py-1 rounded">Main</span>' : ''}
        </h3>
        ${node.data.description ? `<p class="node-description">${node.data.description}</p>` : ''}
      </div>
      <div class="node-tags">
        ${node.data.model ? `<span class="node-tag model-tag">${node.data.model}</span>` : ''}
        ${node.data.provider ? `<span class="node-tag provider-tag">${node.data.provider}</span>` : ''}
        ${node.data.config?.vibecheck ? '<span class="node-tag vibe-tag">Vibecheck</span>' : ''}
      </div>
      <div class="output-sockets">
        <div class="socket socket-top" data-socket-side="top" data-node-id="${node.id}"></div>
        <div class="socket socket-right" data-socket-side="right" data-node-id="${node.id}"></div>
        <div class="socket socket-bottom" data-socket-side="bottom" data-node-id="${node.id}"></div>
        <div class="socket socket-left" data-socket-side="left" data-node-id="${node.id}"></div>
      </div>
    `
    
    nodeEl.innerHTML = content
    
    // Add click handler
    nodeEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('socket')) {
        e.stopPropagation()
        this.selectNode(node.id)
      }
    })
    
    // Add double-click handler for main node
    nodeEl.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      // Only allow setting as main if no incoming connections and not OpenAI
      if (!this.connectionManager.hasIncomingConnections(node.id) && node.data.provider !== 'openai') {
        this.setMainNode(node.id)
      }
    })
    
    return nodeEl
  }
  
  selectNode(nodeId) {
    this.deselectAll()
    
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    this.selectedNode = node
    node.element.classList.add('selected')
    this.showNodeProperties(node)
  }
  
  deselectAll() {
    if (this.selectedNode) {
      this.selectedNode.element?.classList.remove('selected')
      this.selectedNode = null
    }
    
    if (this.selectedConnection !== null) {
      const connections = this.svg.querySelectorAll('.connection.selected')
      connections.forEach(c => c.classList.remove('selected'))
      this.selectedConnection = null
    }
    
    this.propertiesPanelTarget.innerHTML = `
      <div class="p-4 text-center text-gray-500 dark:text-gray-400">
        <p>Select an instance to edit its properties</p>
      </div>
    `
  }
  
  clearPropertiesPanel() {
    this.propertiesPanelTarget.innerHTML = `
      <div class="p-4 text-center text-gray-500 dark:text-gray-400">
        <p>Select an instance to edit its properties</p>
      </div>
    `
  }
  
  showNodeProperties(node) {
    const nodeData = node.data
    const isOpenAI = nodeData.provider === 'openai'
    const isClaude = !isOpenAI
    
    // Get available tools list
    const availableTools = [
      "Bash", "Edit", "Glob", "Grep", "LS", "MultiEdit", "NotebookEdit", 
      "NotebookRead", "Read", "Task", "TodoWrite", "WebFetch", "WebSearch", "Write"
    ]
    
    this.propertiesPanelTarget.innerHTML = `
      <div class="p-4 space-y-4 overflow-y-auto">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Instance: ${nodeData.name}</h3>
        
        <div class="space-y-4">
          <!-- Name/Label -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Instance Name <span class="text-red-500">*</span></label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
              Use only letters, numbers, and underscores (e.g., my_instance)
            </p>
            <input type="text" 
                   value="${nodeData.name || ''}" 
                   data-property="name"
                   data-node-id="${node.id}"
                   placeholder="my_instance"
                   pattern="^[a-zA-Z0-9_]+$"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Description <span class="text-red-500">*</span></label>
            <input type="text" 
                   value="${nodeData.description || ''}" 
                   data-property="description"
                   data-node-id="${node.id}"
                   placeholder="Brief description of this instance's purpose"
                   required
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- Provider -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            <select data-property="provider" 
                    data-node-id="${node.id}"
                    data-action="change->swarm-visual-builder#updateNodeProperty"
                    class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
              <option value="claude" ${isClaude ? 'selected' : ''}>Claude</option>
              <option value="openai" ${isOpenAI ? 'selected' : ''}>OpenAI</option>
            </select>
          </div>
          
          <!-- Model -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Model <span class="text-red-500">*</span></label>
            <input type="text" 
                   value="${nodeData.model || 'sonnet'}" 
                   data-property="model"
                   data-node-id="${node.id}"
                   placeholder="e.g., claude-3-5-sonnet-20241022"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- Directory -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Working Directory <span class="text-red-500">*</span></label>
            <input type="text" 
                   value="${nodeData.directory || nodeData.config?.directory || '.'}" 
                   data-property="directory"
                   data-node-id="${node.id}"
                   placeholder="e.g., . or ./frontend"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm font-mono focus:outline-none">
          </div>
          
          <!-- Temperature (only for OpenAI) -->
          <div id="temperature-field" style="display: ${isOpenAI ? 'block' : 'none'};">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Temperature</label>
            <input type="number" 
                   value="${nodeData.temperature || nodeData.config?.temperature || ''}" 
                   data-property="temperature"
                   data-node-id="${node.id}"
                   min="0"
                   max="2"
                   step="0.1"
                   placeholder="e.g., 0.7"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- System Prompt -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">System Prompt <span class="text-red-500">*</span></label>
            <textarea data-property="system_prompt"
                      data-node-id="${node.id}"
                      rows="4"
                      placeholder="Define the behavior and capabilities of this AI instance..."
                      class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">${nodeData.system_prompt || nodeData.config?.system_prompt || ''}</textarea>
          </div>
          
          <!-- Vibe Mode -->
          <div id="vibe-mode-field" style="display: ${isClaude || isOpenAI ? 'block' : 'none'};">
            ${isOpenAI ? `
              <div class="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3">
                <div class="flex items-start">
                  <svg class="h-5 w-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                  </svg>
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Vibe Mode</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      OpenAI instances always run in vibe mode with full access to all tools
                    </p>
                  </div>
                </div>
              </div>
            ` : `
              <label class="flex items-start cursor-pointer">
                <input type="checkbox" 
                       ${nodeData.vibe || nodeData.config?.vibe ? 'checked' : ''}
                       data-property="vibe"
                       data-node-id="${node.id}"
                       class="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-0 focus:outline-none cursor-pointer">
                <div class="ml-3">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Vibe Mode</span>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    When enabled, this instance skips all permissions and has access to all available tools
                  </p>
                </div>
              </label>
            `}
          </div>
          
          <!-- Allowed Tools (only for Claude and not in vibe mode) -->
          <div id="tools-field" style="display: ${isClaude && !nodeData.vibe && !nodeData.config?.vibe ? 'block' : 'none'};">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Allowed Tools
              <span class="text-xs text-gray-500 dark:text-gray-400">(OpenAI has access to all tools)</span>
            </label>
            <div class="border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-gray-50 dark:bg-gray-800 max-h-48 overflow-y-auto">
              <div class="grid grid-cols-2 gap-2">
                ${availableTools.map(tool => `
                  <label class="flex items-center cursor-pointer hover:text-gray-900 dark:hover:text-gray-100">
                    <input type="checkbox"
                           value="${tool}"
                           ${nodeData.allowed_tools?.includes(tool) || nodeData.config?.allowed_tools?.includes(tool) ? 'checked' : ''}
                           data-tool-checkbox
                           data-node-id="${node.id}"
                           class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-0 focus:outline-none cursor-pointer">
                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">${tool}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
          
          <!-- Main Instance Toggle -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              <input type="checkbox" 
                     ${this.mainNodeId === node.id ? 'checked' : ''}
                     ${this.connectionManager.hasIncomingConnections(node.id) || isOpenAI ? 'disabled' : ''}
                     data-action="change->swarm-visual-builder#toggleMainNode"
                     data-node-id="${node.id}"
                     class="mr-2 disabled:opacity-50 disabled:cursor-not-allowed">
              Main Instance
              ${this.connectionManager.hasIncomingConnections(node.id) ? '<span class="text-xs text-gray-500 dark:text-gray-400 block ml-6">Cannot be main (has incoming connections)</span>' : ''}
              ${isOpenAI ? '<span class="text-xs text-gray-500 dark:text-gray-400 block ml-6">OpenAI instances cannot be main</span>' : ''}
            </label>
          </div>
          
          <!-- Connections -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Connections</h4>
            ${this.connectionManager.getNodeConnections(node.id).length > 0 ? `
              <div class="space-y-2 mb-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  This instance has ${this.connectionManager.getNodeConnections(node.id).length} connection(s)
                </p>
                <button type="button"
                        data-action="click->swarm-visual-builder#clearNodeConnections"
                        data-node-id="${node.id}"
                        class="w-full px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm transition-colors">
                  Clear All Connections
                </button>
              </div>
            ` : `
              <p class="text-xs text-gray-500 dark:text-gray-400 italic">No connections</p>
            `}
          </div>
          
          <!-- Delete Button -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button"
                    data-action="click->swarm-visual-builder#deleteNode"
                    data-node-id="${node.id}"
                    class="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm transition-colors">
              Delete Instance
            </button>
          </div>
        </div>
      </div>
    `
    
    // Add change listeners for regular inputs
    this.propertiesPanelTarget.querySelectorAll('input:not([type="checkbox"]):not([data-tool-checkbox]), select, textarea').forEach(input => {
      input.addEventListener('input', (e) => this.updateNodeProperty(e))
      // Add blur event for instance name to convert and ensure uniqueness
      if (input.dataset.property === 'name') {
        input.addEventListener('blur', (e) => this.updateNodeProperty(e))
      }
    })
    
    // Add change listeners for checkboxes
    this.propertiesPanelTarget.querySelectorAll('input[type="checkbox"]:not([data-tool-checkbox])').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.updateNodeProperty(e))
    })
    
    // Add listeners for tool checkboxes
    this.propertiesPanelTarget.querySelectorAll('[data-tool-checkbox]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.updateAllowedTools(e))
    })
  }
  
  updateNodeProperty(e) {
    const nodeId = parseInt(e.target.dataset.nodeId)
    const property = e.target.dataset.property
    const configProperty = e.target.dataset.configProperty
    
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    if (property) {
      node.data[property] = e.target.value
      
      // Update visual representation
      if (property === 'name') {
        node.element.querySelector('.node-title span').textContent = e.target.value
      } else if (property === 'description') {
        const descEl = node.element.querySelector('.node-description')
        if (descEl) {
          descEl.textContent = e.target.value
        } else if (e.target.value) {
          const headerEl = node.element.querySelector('.node-header')
          const desc = document.createElement('p')
          desc.className = 'node-description'
          desc.textContent = e.target.value
          headerEl.appendChild(desc)
        }
      } else if (property === 'model' || property === 'provider') {
        // Update config as well
        if (!node.data.config) node.data.config = {}
        node.data.config[property] = e.target.value
        
        // Update tags
        this.updateNodeTags(node)
        
        // Show/hide fields based on provider
        if (property === 'provider') {
          const tempField = this.propertiesPanelTarget.querySelector('#temperature-field')
          const toolsField = this.propertiesPanelTarget.querySelector('#tools-field')
          
          if (tempField) tempField.style.display = e.target.value === 'openai' ? 'block' : 'none'
          if (toolsField) toolsField.style.display = e.target.value === 'openai' || node.data.vibe || node.data.config?.vibe ? 'none' : 'block'
          
          // If changing to OpenAI and this node is currently main, unset it
          if (e.target.value === 'openai' && this.mainNodeId === node.id) {
            // Remove main node styling
            if (node.element) {
              node.element.classList.remove('main-node')
              const badge = node.element.querySelector('.bg-orange-500')
              if (badge) badge.remove()
            }
            this.mainNodeId = null
            
            // Try to find another eligible node to be main
            const eligibleNode = this.nodeManager.getNodes().find(n => 
              n.id !== node.id && 
              n.data.provider !== 'openai' && 
              !this.connectionManager.hasIncomingConnections(n.id)
            )
            if (eligibleNode) {
              this.setMainNode(eligibleNode.id)
            }
          }
          
          // Refresh the entire properties panel to update vibe mode display
          this.showNodeProperties(node)
        }
      } else if (property === 'directory' || property === 'temperature' || property === 'system_prompt' || property === 'vibe') {
        // Store these in config
        if (!node.data.config) node.data.config = {}
        
        if (property === 'vibe') {
          node.data[property] = e.target.checked
          node.data.config[property] = e.target.checked
          // Show/hide tools field
          const toolsField = this.propertiesPanelTarget.querySelector('#tools-field')
          if (toolsField) {
            toolsField.style.display = e.target.checked || node.data.provider === 'openai' ? 'none' : 'block'
          }
        } else {
          node.data[property] = e.target.value
          node.data.config[property] = e.target.value
        }
      }
    } else if (configProperty) {
      if (!node.data.config) node.data.config = {}
      
      if (e.target.type === 'checkbox') {
        node.data.config[configProperty] = e.target.checked
      } else if (e.target.type === 'number') {
        node.data.config[configProperty] = parseFloat(e.target.value)
      } else {
        node.data.config[configProperty] = e.target.value
      }
      
      // Update vibecheck tag if needed
      if (configProperty === 'vibecheck') {
        this.updateNodeTags(node)
      }
    }
    
    this.updateYamlPreview()
  }
  
  updateNodeTags(node) {
    const tagsEl = node.element.querySelector('.node-tags')
    tagsEl.innerHTML = ''
    
    if (node.data.model) {
      tagsEl.innerHTML += `<span class="node-tag model-tag">${node.data.model}</span>`
    }
    if (node.data.provider) {
      tagsEl.innerHTML += `<span class="node-tag provider-tag">${node.data.provider}</span>`
    }
    if (node.data.config?.vibecheck) {
      tagsEl.innerHTML += '<span class="node-tag vibe-tag">Vibecheck</span>'
    }
  }
  
  humanizeKey(key) {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  
  updateAllowedTools(e) {
    const nodeId = parseInt(e.currentTarget.dataset.nodeId)
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Get all checked tool checkboxes
    const checkedTools = []
    this.propertiesPanelTarget.querySelectorAll('[data-tool-checkbox]:checked').forEach(checkbox => {
      checkedTools.push(checkbox.value)
    })
    
    if (!node.data.config) node.data.config = {}
    node.data.config.allowed_tools = checkedTools
    node.data.allowed_tools = checkedTools
    
    this.updateYamlPreview()
  }
  
  toggleMainNode(e) {
    const nodeId = parseInt(e.target.dataset.nodeId)
    if (e.target.checked) {
      this.setMainNode(nodeId)
    } else {
      this.mainNodeId = null
      this.updateYamlPreview()
    }
  }
  
  clearNodeConnections(e) {
    const nodeId = parseInt(e.currentTarget.dataset.nodeId)
    this.connectionManager.clearNodeConnections(nodeId)
    this.updateConnections()
    this.updateYamlPreview()
    
    // Refresh properties panel
    const node = this.nodeManager.findNode(nodeId)
    if (node && this.selectedNode?.id === nodeId) {
      this.showNodeProperties(node)
    }
  }
  
  setAsMain(e) {
    const nodeId = parseInt(e.target.dataset.nodeId)
    this.setMainNode(nodeId)
  }
  
  setMainNode(nodeId) {
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Prevent OpenAI instances from being main
    if (node.data.provider === 'openai') {
      console.warn('OpenAI instances cannot be set as main')
      return
    }
    
    // Remove previous main node styling
    if (this.mainNodeId) {
      const prevMainNode = this.nodeManager.findNode(this.mainNodeId)
      if (prevMainNode?.element) {
        prevMainNode.element.classList.remove('main-node')
        const badge = prevMainNode.element.querySelector('.bg-orange-500')
        if (badge) badge.remove()
      }
    }
    
    // Set new main node
    this.mainNodeId = nodeId
    if (node.element) {
      node.element.classList.add('main-node')
      const titleEl = node.element.querySelector('.node-title span')
      if (titleEl && !node.element.querySelector('.bg-orange-500')) {
        titleEl.insertAdjacentHTML('afterend', '<span class="text-xs bg-orange-500 text-white px-2 py-1 rounded ml-2">Main</span>')
      }
    }
    
    this.updateYamlPreview()
  }
  
  deleteNode(e) {
    const nodeId = parseInt(e.target.dataset.nodeId)
    this.deleteNodeById(nodeId)
  }
  
  deleteSelectedNode() {
    if (this.selectedNode) {
      this.deleteNodeById(this.selectedNode.id)
    }
  }
  
  deleteNodeById(nodeId) {
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Remove connections
    this.connectionManager.clearNodeConnections(nodeId)
    
    // Remove element
    node.element?.remove()
    
    // Remove from nodes
    this.nodeManager.removeNode(nodeId)
    
    // Clear selection and properties panel if this was the selected node
    if (this.selectedNode?.id === nodeId) {
      this.selectedNode = null
      this.clearPropertiesPanel()
    }
    
    // Update main node if needed
    if (this.mainNodeId === nodeId) {
      this.mainNodeId = this.nodeManager.getNodes()[0]?.id || null
      if (this.mainNodeId) {
        this.setMainNode(this.mainNodeId)
      }
    }
    
    this.updateConnections()
    this.updateEmptyState()
    this.updateYamlPreview()
  }
  
  deleteSelectedConnection() {
    if (this.selectedConnection !== null) {
      this.connectionManager.removeConnection(this.selectedConnection)
      this.selectedConnection = null
      this.updateConnections()
      this.updateYamlPreview()
    }
  }
  
  // Connection operations
  startConnection(e) {
    e.stopPropagation()
    const socket = e.target
    const nodeId = parseInt(socket.dataset.nodeId)
    const side = socket.dataset.socketSide
    
    // Check if socket is already used as destination
    if (socket.classList.contains('used-as-destination')) {
      return
    }
    
    this.pendingConnection = { nodeId, side }
    socket.classList.add('connecting')
    this.viewport.classList.add('cursor-crosshair')
    
    // Show drag path
    const dragPath = this.svg.querySelector('#dragPath')
    dragPath.style.display = 'block'
  }
  
  updateDragPath(e) {
    if (!this.pendingConnection) return
    
    const fromNode = this.nodeManager.findNode(this.pendingConnection.nodeId)
    if (!fromNode) return
    
    const viewportRect = this.viewport.getBoundingClientRect()
    const fromSocket = this.viewport.querySelector(`.swarm-node[data-node-id="${this.pendingConnection.nodeId}"] .socket[data-socket-side="${this.pendingConnection.side}"]`)
    
    if (!fromSocket) return
    
    const fromRect = fromSocket.getBoundingClientRect()
    const fromX = (fromRect.left - viewportRect.left + fromRect.width/2) / this.zoomLevel
    const fromY = (fromRect.top - viewportRect.top + fromRect.height/2) / this.zoomLevel
    const toX = (e.clientX - viewportRect.left) / this.zoomLevel
    const toY = (e.clientY - viewportRect.top) / this.zoomLevel
    
    const pathData = this.pathRenderer.createDragPath(fromX, fromY, this.pendingConnection.side, toX, toY)
    const dragPath = this.svg.querySelector('#dragPath')
    this.pathRenderer.updateDragPath(dragPath, pathData)
    
    // Highlight potential target
    const element = document.elementFromPoint(e.clientX, e.clientY)
    this.highlightPotentialTarget(element)
  }
  
  endConnection(e) {
    if (!this.pendingConnection) return
    
    const element = document.elementFromPoint(e.clientX, e.clientY)
    
    if (element && element.classList.contains('socket')) {
      const targetNodeId = parseInt(element.dataset.nodeId)
      const targetSide = element.dataset.socketSide
      
      // Don't connect to self or to used destination socket
      if (targetNodeId !== this.pendingConnection.nodeId && 
          !element.classList.contains('used-as-destination')) {
        
        const fromNode = this.nodeManager.findNode(this.pendingConnection.nodeId)
        const toNode = this.nodeManager.findNode(targetNodeId)
        
        if (fromNode && toNode) {
          // Create connection
          this.connectionManager.createConnection(
            this.pendingConnection.nodeId, 
            this.pendingConnection.side,
            targetNodeId, 
            targetSide
          )
          
          // Mark socket as used
          element.classList.add('used-as-destination')
          
          this.updateConnections()
          this.updateYamlPreview()
        }
      }
    } else {
      // Try to find the closest node
      const targetNode = element?.closest('.swarm-node')
      if (targetNode) {
        const targetNodeId = parseInt(targetNode.dataset.nodeId)
        const fromId = this.pendingConnection.nodeId
        const fromSide = this.pendingConnection.side
        
        if (targetNodeId !== fromId) {
          const fromNode = this.nodeManager.findNode(fromId)
          const toNode = this.nodeManager.findNode(targetNodeId)
          
          if (fromNode && toNode) {
            // Use intelligent socket selection
            const { toSide } = this.connectionManager.findBestSocketPairForDrag(fromNode, toNode, fromSide)
            
            // Check if target socket is available
            const targetSocket = targetNode.querySelector(`.socket[data-socket-side="${toSide}"]:not(.used-as-destination)`)
            if (targetSocket) {
              this.connectionManager.createConnection(fromId, fromSide, targetNodeId, toSide)
              targetSocket.classList.add('used-as-destination')
              this.updateConnections()
              this.updateYamlPreview()
            }
          }
        }
      }
    }
    
    // Hide drag path and remove connecting class
    const dragPath = this.svg.querySelector('#dragPath')
    dragPath.style.display = 'none'
    
    // Remove connecting class from all sockets
    this.viewport.querySelectorAll('.socket.connecting').forEach(s => s.classList.remove('connecting'))
    
    // Clear highlight
    this.viewport.querySelectorAll('.swarm-node.connection-target').forEach(n => n.classList.remove('connection-target'))
    
    this.pendingConnection = null
    this.viewport.classList.remove('cursor-crosshair')
  }
  
  highlightPotentialTarget(element) {
    // Clear previous highlights
    this.viewport.querySelectorAll('.swarm-node.connection-target').forEach(n => n.classList.remove('connection-target'))
    
    if (!element || !this.pendingConnection) return
    
    const targetNode = element.closest('.swarm-node')
    if (targetNode && parseInt(targetNode.dataset.nodeId) !== this.pendingConnection.nodeId) {
      targetNode.classList.add('connection-target')
    }
  }
  
  updateConnections() {
    this.pathRenderer.renderConnections(
      this.connectionManager.getConnections(), 
      this.nodeManager.getNodes()
    )
    
    // Re-add event listeners
    this.svg.querySelectorAll('.connection').forEach((path, index) => {
      path.addEventListener('click', (e) => {
        e.stopPropagation()
        this.selectConnection(index)
      })
    })
  }
  
  selectConnection(index) {
    this.deselectAll()
    
    const connection = this.connectionManager.getConnections()[index]
    if (!connection) return
    
    this.selectedConnection = index
    const path = this.svg.querySelector(`.connection[data-connection-index="${index}"]`)
    if (path) {
      path.classList.add('selected')
      path.setAttribute('stroke', '#ea580c')
      path.setAttribute('stroke-width', '3')
    }
  }
  
  // Node dragging operations
  startNodeDrag(e) {
    const nodeEl = e.target.closest('.swarm-node')
    if (!nodeEl) return
    
    const nodeId = parseInt(nodeEl.dataset.nodeId)
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    this.draggedNode = node
    
    // Store initial positions
    this.dragStartMouseX = e.clientX
    this.dragStartMouseY = e.clientY
    this.dragStartNodeX = node.data.x
    this.dragStartNodeY = node.data.y
    this.dragStartScrollLeft = this.container.scrollLeft
    this.dragStartScrollTop = this.container.scrollTop
    
    // Animation state
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
    this.animationFrameId = null
    
    nodeEl.style.zIndex = '1000'
    nodeEl.style.cursor = 'grabbing'
    this.container.classList.add('dragging-node')
    
    e.preventDefault()
  }
  
  continueNodeDrag(e) {
    if (!this.draggedNode) return
    
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
    
    // Start animation if not already running
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => this.updateNodePosition())
    }
  }
  
  updateNodePosition() {
    if (!this.draggedNode) return
    
    // Calculate mouse delta
    const deltaMouseX = this.lastMouseX - this.dragStartMouseX
    const deltaMouseY = this.lastMouseY - this.dragStartMouseY
    
    // Calculate scroll delta
    const deltaScrollX = this.container.scrollLeft - this.dragStartScrollLeft
    const deltaScrollY = this.container.scrollTop - this.dragStartScrollTop
    
    // Calculate final position accounting for both mouse movement and scroll
    const deltaX = (deltaMouseX + deltaScrollX) / this.zoomLevel
    const deltaY = (deltaMouseY + deltaScrollY) / this.zoomLevel
    
    // Update node position
    const x = this.dragStartNodeX + deltaX
    const y = this.dragStartNodeY + deltaY
    
    this.nodeManager.updateNodePosition(this.draggedNode.id, x, y)
    
    // Update element position
    this.draggedNode.element.style.left = `${x + this.canvasCenter}px`
    this.draggedNode.element.style.top = `${y + this.canvasCenter}px`
    
    // Update connections
    this.updateConnections()
    
    // Check for auto-scroll with smooth acceleration
    const containerRect = this.container.getBoundingClientRect()
    const edgeSize = 80 // Larger detection zone
    const maxScrollSpeed = 25
    
    const distanceFromLeft = this.lastMouseX - containerRect.left
    const distanceFromRight = containerRect.right - this.lastMouseX
    const distanceFromTop = this.lastMouseY - containerRect.top
    const distanceFromBottom = containerRect.bottom - this.lastMouseY
    
    let scrollX = 0
    let scrollY = 0
    
    // Smooth quadratic acceleration for more natural feel
    if (distanceFromLeft < edgeSize) {
      const factor = 1 - (distanceFromLeft / edgeSize)
      scrollX = -maxScrollSpeed * factor * factor
    } else if (distanceFromRight < edgeSize) {
      const factor = 1 - (distanceFromRight / edgeSize)
      scrollX = maxScrollSpeed * factor * factor
    }
    
    if (distanceFromTop < edgeSize) {
      const factor = 1 - (distanceFromTop / edgeSize)
      scrollY = -maxScrollSpeed * factor * factor
    } else if (distanceFromBottom < edgeSize) {
      const factor = 1 - (distanceFromBottom / edgeSize)
      scrollY = maxScrollSpeed * factor * factor
    }
    
    if (scrollX !== 0 || scrollY !== 0) {
      this.container.scrollLeft += scrollX
      this.container.scrollTop += scrollY
    }
    
    // Continue animation
    this.animationFrameId = requestAnimationFrame(() => this.updateNodePosition())
  }
  
  endNodeDrag() {
    if (!this.draggedNode) return
    
    // Cancel animation
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    
    this.draggedNode.element.style.zIndex = ''
    this.draggedNode.element.style.cursor = ''
    this.container.classList.remove('dragging-node')
    this.draggedNode = null
    
    this.updateYamlPreview()
  }
  
  // Canvas panning
  startPanning(e) {
    this.isPanning = true
    this.panStartX = e.clientX
    this.panStartY = e.clientY
    this.viewport.classList.add('panning')
    e.preventDefault()
  }
  
  continuePanning(e) {
    if (!this.isPanning) return
    
    const dx = e.clientX - this.panStartX
    const dy = e.clientY - this.panStartY
    
    this.container.scrollLeft -= dx
    this.container.scrollTop -= dy
    
    this.panStartX = e.clientX
    this.panStartY = e.clientY
  }
  
  endPanning() {
    this.isPanning = false
    this.viewport.classList.remove('panning')
  }
  
  // UI operations
  updateEmptyState() {
    const hasNodes = this.nodeManager.getNodes().length > 0
    this.emptyStateTarget.style.display = hasNodes ? 'none' : 'flex'
  }
  
  zoomIn() {
    const newZoom = Math.min(this.maxZoom, this.zoomLevel * 1.2)
    this.setZoom(newZoom)
  }
  
  zoomOut() {
    const newZoom = Math.max(this.minZoom, this.zoomLevel / 1.2)
    this.setZoom(newZoom)
  }
  
  setZoom(zoom) {
    if (zoom === this.zoomLevel) return
    
    const containerRect = this.container.getBoundingClientRect()
    const centerX = containerRect.width / 2
    const centerY = containerRect.height / 2
    
    const scrollLeft = this.container.scrollLeft
    const scrollTop = this.container.scrollTop
    
    const worldX = (scrollLeft + centerX) / this.zoomLevel
    const worldY = (scrollTop + centerY) / this.zoomLevel
    
    this.zoomLevel = zoom
    this.viewport.style.transform = `scale(${this.zoomLevel})`
    this.zoomLevelTarget.textContent = Math.round(this.zoomLevel * 100) + '%'
    
    const newScrollLeft = worldX * this.zoomLevel - centerX
    const newScrollTop = worldY * this.zoomLevel - centerY
    
    this.container.scrollLeft = newScrollLeft
    this.container.scrollTop = newScrollTop
    
    this.updateConnections()
  }
  
  // Library and search operations
  filterTemplates(e) {
    const searchTerm = e.target.value.toLowerCase()
    const templates = this.instanceTemplatesTarget.querySelectorAll('[data-template-card]')
    
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
  
  addBlankInstance() {
    // Node dimensions
    const nodeWidth = 250
    const nodeHeight = 120
    
    // Get the current visible center of the canvas
    const containerRect = this.container.getBoundingClientRect()
    const scrollLeft = this.container.scrollLeft
    const scrollTop = this.container.scrollTop
    
    // Calculate the center of the visible area in viewport coordinates
    const visibleCenterX = (scrollLeft + containerRect.width / 2) / this.zoomLevel
    const visibleCenterY = (scrollTop + containerRect.height / 2) / this.zoomLevel
    
    // Convert to canvas coordinates (relative to center) and center the node
    const x = visibleCenterX - this.canvasCenter - (nodeWidth / 2)
    const y = visibleCenterY - this.canvasCenter - (nodeHeight / 2)
    
    const templateData = {
      name: 'New Instance',
      description: '',
      config: {},
      model: '',
      provider: ''
    }
    
    // Add the node
    const node = this.nodeManager.createNode(templateData, { x, y })
    this.renderNode(node)
    this.updateEmptyState()
    this.updateYamlPreview()
    
    // Select the new node and show properties
    this.selectNode(node.id)
    
    // Switch to properties tab if not already visible
    this.switchToProperties()
    
    // Focus on the instance name field after DOM updates
    // Use requestAnimationFrame to ensure the DOM has been updated
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const nameInput = this.propertiesPanelTarget.querySelector('input[data-property="name"]')
        if (nameInput) {
          nameInput.focus()
          nameInput.select()
        }
      })
    })
  }
  
  // Tags operations
  addTag(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const tag = e.target.value.trim()
      
      if (tag && !this.tags.includes(tag)) {
        this.tags.push(tag)
        this.renderTags()
        e.target.value = ''
        this.updateYamlPreview()
      }
    }
  }
  
  renderTags() {
    this.tagsContainerTarget.innerHTML = this.tags.map(tag => `
      <span class="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
        ${tag}
        <button type="button" 
                data-tag="${tag}"
                data-action="click->swarm-visual-builder#removeTag"
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ×
        </button>
      </span>
    `).join('')
  }
  
  removeTag(e) {
    const tag = e.target.dataset.tag
    this.tags = this.tags.filter(t => t !== tag)
    this.renderTags()
    this.updateYamlPreview()
  }
  
  // YAML preview and export
  updateYamlPreview() {
    const swarmData = this.buildSwarmData()
    const yaml = jsyaml.dump(swarmData)
    this.yamlPreviewTarget.querySelector('pre').textContent = yaml
  }
  
  buildSwarmData() {
    const instances = {}
    
    // Determine main instance key first
    const mainNodeId = this.mainNodeId || (this.nodeManager.getNodes()[0]?.id)
    
    // Build instances
    this.nodeManager.getNodes().forEach(node => {
      const key = node.data.name.toLowerCase().replace(/\s+/g, '_')
      this.nodeKeyMap.set(node.id, key)
      
      // Check if this is the main instance
      const isMainInstance = node.id === mainNodeId
      
      // Create instance with proper structure
      const instance = {}
      
      // REQUIRED: description field
      instance.description = node.data.description || node.data.config?.description || `Instance for ${node.data.name}`
      
      // Optional fields only added if they have values
      const model = node.data.model || node.data.config?.model
      if (model && model !== 'sonnet') {
        instance.model = model
      }
      
      const provider = node.data.provider || node.data.config?.provider
      // IMPORTANT: Main instance cannot have provider field in the YAML (claude-swarm rule)
      if (!isMainInstance && provider && provider !== 'claude') {
        instance.provider = provider
      }
      
      if (node.data.directory || node.data.config?.directory) {
        instance.directory = node.data.directory || node.data.config.directory
      }
      
      // Use 'prompt' instead of 'system_prompt' for claude-swarm compliance
      if (node.data.system_prompt || node.data.config?.system_prompt) {
        instance.prompt = node.data.system_prompt || node.data.config.system_prompt
      }
      
      // Handle OpenAI-specific fields
      if (provider === 'openai') {
        // Check if it's an o-series model
        const isOSeries = model && /^o\d/.test(model)
        
        // Temperature not allowed for o-series models
        if (!isOSeries && (node.data.temperature || node.data.config?.temperature)) {
          instance.temperature = parseFloat(node.data.temperature || node.data.config.temperature)
        }
        
        // Reasoning effort only for o-series models
        if (isOSeries && (node.data.reasoning_effort || node.data.config?.reasoning_effort)) {
          instance.reasoning_effort = node.data.reasoning_effort || node.data.config.reasoning_effort
        }
      }
      
      // Handle vibe mode and allowed tools (not for OpenAI instances)
      if (provider !== 'openai') {
        if (node.data.vibe || node.data.config?.vibe) {
          instance.vibe = true
        } else if (node.data.allowed_tools?.length > 0 || node.data.config?.allowed_tools?.length > 0) {
          instance.allowed_tools = node.data.allowed_tools || node.data.config.allowed_tools
        }
      }
      
      instances[key] = instance
    })
    
    // Build connections - connections go on the source node listing destinations
    this.connectionManager.getConnections().forEach(conn => {
      const fromKey = this.nodeKeyMap.get(conn.from)
      const toKey = this.nodeKeyMap.get(conn.to)
      
      if (fromKey && toKey) {
        if (!instances[fromKey].connections) {
          instances[fromKey].connections = []
        }
        // Avoid duplicates
        if (!instances[fromKey].connections.includes(toKey)) {
          instances[fromKey].connections.push(toKey)
        }
      }
    })
    
    // Build final structure compliant with claude-swarm
    const swarmName = this.nameInputTarget.value || 'my_swarm'
    const mainKey = this.mainNodeId ? this.nodeKeyMap.get(this.mainNodeId) : Object.keys(instances)[0]
    
    // Create proper claude-swarm YAML structure
    const result = {
      version: 1,
      swarm: {
        name: swarmName,
        instances: instances
      }
    }
    
    // Only add main key if there are instances and a main is defined
    if (mainKey && Object.keys(instances).length > 0) {
      result.swarm.main = mainKey
    }
    
    // Note: tags are NOT included in the YAML - they're for SwarmUI database only
    
    return result
  }
  
  switchToProperties() {
    this.propertiesTabTarget.classList.remove('hidden')
    this.yamlPreviewTabTarget.classList.add('hidden')
    
    this.propertiesTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.propertiesTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.yamlTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.yamlTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
  }
  
  switchToYaml() {
    this.yamlPreviewTabTarget.classList.remove('hidden')
    this.propertiesTabTarget.classList.add('hidden')
    
    this.yamlTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.yamlTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.propertiesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.propertiesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    this.updateYamlPreview()
  }
  
  // Import/Export operations
  async importYaml() {
    this.importInputTarget.click()
  }
  
  async handleImportFile(e) {
    const file = e.target.files[0]
    if (!file) return
    
    const content = await file.text()
    
    try {
      const data = jsyaml.load(content)
      
      // Handle claude-swarm format (version: 1, swarm: {...})
      let swarmData = null
      let swarmName = null
      let tags = []
      
      if (data.version === 1 && data.swarm) {
        // Standard claude-swarm format
        swarmData = data.swarm
        swarmName = swarmData.name || 'imported_swarm'
      } else {
        // Legacy format or SwarmUI export format - look for first object with instances
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && value.instances) {
            swarmData = value
            swarmName = key
            // Extract tags if present (SwarmUI-specific)
            if (value.tags) {
              tags = value.tags
            }
            break
          }
        }
      }
      
      if (!swarmData || !swarmData.instances) {
        alert('Invalid swarm file format. File must be a valid claude-swarm YAML.')
        return
      }
      
      // Import the swarm
      this.clearAll()
      
      // Set name and tags
      this.nameInputTarget.value = swarmName
      if (tags.length > 0) {
        this.tags = tags
        this.renderTags()
      }
      
      // Import nodes
      const importedNodes = this.nodeManager.importNodes(swarmData)
      
      // Render all nodes
      importedNodes.forEach(node => {
        this.renderNode(node)
      })
      
      // Set main node if specified
      if (swarmData.main) {
        const mainNode = importedNodes.find(n => 
          n.data.name.toLowerCase().replace(/\s+/g, '_') === swarmData.main
        )
        if (mainNode) {
          this.setMainNode(mainNode.id)
        }
      }
      
      // Create connections
      Object.entries(swarmData.instances).forEach(([instanceKey, instanceData]) => {
        if (instanceData.connections) {
          const fromNode = importedNodes.find(n => 
            n.data.name.toLowerCase().replace(/\s+/g, '_') === instanceKey
          )
          
          if (fromNode) {
            instanceData.connections.forEach(toKey => {
              const toNode = importedNodes.find(n => 
                n.data.name.toLowerCase().replace(/\s+/g, '_') === toKey
              )
              
              if (toNode) {
                const { fromSide, toSide } = this.connectionManager.findBestSocketPair(fromNode, toNode)
                this.connectionManager.createConnection(fromNode.id, fromSide, toNode.id, toSide)
                
                // Mark socket as used
                const socket = toNode.element.querySelector(`.socket[data-socket-side="${toSide}"]`)
                if (socket) socket.classList.add('used-as-destination')
              }
            })
          }
        }
      })
      
      // Set main node
      if (swarmData.main) {
        const mainNode = importedNodes.find(n => 
          n.data.name.toLowerCase().replace(/\s+/g, '_') === swarmData.main
        )
        if (mainNode) {
          this.setMainNode(mainNode.id)
        }
      }
      
      // Auto-layout and update
      await this.autoLayout()
      
      // Center view on imported nodes
      const bounds = this.nodeManager.getNodesBounds()
      const centerX = (bounds.minX + bounds.maxX) / 2 + this.canvasCenter
      const centerY = (bounds.minY + bounds.maxY) / 2 + this.canvasCenter
      
      const containerRect = this.container.getBoundingClientRect()
      this.container.scrollLeft = centerX * this.zoomLevel - containerRect.width / 2
      this.container.scrollTop = centerY * this.zoomLevel - containerRect.height / 2
      
      this.updateEmptyState()
      this.updateYamlPreview()
      
    } catch (error) {
      console.error('Import error:', error)
      alert('Failed to import file: ' + error.message)
    }
    
    // Reset input
    e.target.value = ''
  }
  
  exportYaml() {
    const swarmData = this.buildSwarmData()
    const yaml = jsyaml.dump(swarmData)
    
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${this.nameInputTarget.value || 'swarm'}.yaml`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  async copyYaml() {
    const yaml = this.yamlPreviewTarget.querySelector('pre').textContent
    
    try {
      await navigator.clipboard.writeText(yaml)
      
      // Update button text temporarily to show success
      const button = this.yamlPreviewTabTarget.querySelector('[data-action="click->swarm-visual-builder#copyYaml"]')
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
  
  async saveSwarm() {
    const swarmData = this.buildSwarmData()
    const yaml = jsyaml.dump(swarmData)
    
    try {
      const response = await fetch('/swarm_templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({
          swarm_template: {
            name: this.nameInputTarget.value || 'Untitled Swarm',
            tags: this.tags.join(','),
            yaml_content: yaml,
            visual_data: JSON.stringify({
              nodes: this.nodeManager.serialize(),
              connections: this.connectionManager.serialize(),
              mainNodeId: this.mainNodeId
            })
          }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        window.location.href = result.redirect_url
      } else {
        alert('Failed to save swarm')
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('Failed to save swarm: ' + error.message)
    }
  }
  
  // Auto-layout
  async autoLayout() {
    if (this.nodeManager.getNodes().length === 0) return
    
    // Use layout manager
    this.layoutManager.autoLayout(
      this.nodeManager.getNodes(),
      this.connectionManager.getConnections()
    )
    
    // Update visual positions
    this.nodeManager.getNodes().forEach(node => {
      if (node.element) {
        node.element.style.left = `${node.data.x + this.canvasCenter}px`
        node.element.style.top = `${node.data.y + this.canvasCenter}px`
      }
    })
    
    this.updateConnections()
    this.updateYamlPreview()
  }
  
  clearAll() {
    if (this.nodeManager.getNodes().length > 0 && !confirm('Clear all nodes and connections?')) {
      return
    }
    
    // Clear all nodes
    this.nodeManager.getNodes().forEach(node => {
      node.element?.remove()
    })
    
    // Reset managers
    this.nodeManager.clearAll()
    this.connectionManager.init()
    
    // Reset state
    this.selectedNode = null
    this.selectedConnection = null
    this.mainNodeId = null
    this.nodeKeyMap.clear()
    
    // Clear UI
    this.nameInputTarget.value = ''
    this.tags = []
    this.renderTags()
    
    this.updateConnections()
    this.updateEmptyState()
    this.updateYamlPreview()
    this.deselectAll()
  }
}