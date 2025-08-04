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
    "chatTab",
    "chatTabButton",
    "zoomLevel",
    "emptyState",
    "importInput",
    "rightSidebar",
    "resizeHandle",
    "instancesTab",
    "instancesTabButton",
    "mcpServersTab",
    "mcpServersTabButton",
    "mcpSearchInput",
    "mcpServersList"
  ]
  
  static values = {
    swarmId: String,
    existingData: String,
    existingYaml: String,
    projectId: String,
    projectName: String,
    projectPath: String,
    isFileEdit: Boolean,
    isNewFile: Boolean,
    filePath: String
  }
  
  async connect() {
    
    // Initialize managers
    this.nodeManager = new NodeManager(this)
    this.connectionManager = new ConnectionManager(this)
    this.pathRenderer = new PathRenderer(this)
    this.layoutManager = new LayoutManager(this)
    
    // Initialize state
    this.tags = []
    this.selectedNodes = [] // Changed to array for multi-select
    this.selectedNode = null // Keep for backward compatibility
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
    
    // Load existing data if editing - add small delay to ensure DOM is ready
    if ((this.swarmIdValue && this.existingDataValue) || this.existingYamlValue || this.isFileEditValue) {
      // Use requestAnimationFrame to ensure DOM updates are complete
      requestAnimationFrame(() => {
        this.loadExistingSwarm()
      })
    }
    
    // Listen for canvas refresh events from Claude chat
    window.addEventListener('canvas:refresh', this.handleCanvasRefresh.bind(this))
    
    // Listen for sidebar expansion request
    this.handleSidebarExpand = this.expandSidebarToMax.bind(this)
    window.addEventListener('sidebar:expandToMax', this.handleSidebarExpand)
    
    // Listen for chat clear selection request
    this.handleClearSelection = () => this.deselectAll()
    window.addEventListener('chat:clearNodeSelection', this.handleClearSelection)
  }
  
  disconnect() {
    // Clean up event listeners
    window.removeEventListener('canvas:refresh', this.handleCanvasRefresh)
    window.removeEventListener('sidebar:expandToMax', this.handleSidebarExpand)
    window.removeEventListener('chat:clearNodeSelection', this.handleClearSelection)
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
        e.dataTransfer.setData('type', 'template')
      }
    })
    
    // Drag and drop for MCP servers
    if (this.hasMcpServersListTarget) {
      this.mcpServersListTarget.addEventListener('dragstart', (e) => {
        if (e.target.hasAttribute('data-mcp-card')) {
          const mcpData = {
            id: e.target.dataset.mcpId,
            name: e.target.dataset.mcpName,
            type: e.target.dataset.mcpType,
            config: JSON.parse(e.target.dataset.mcpConfig)
          }
          e.dataTransfer.setData('mcp', JSON.stringify(mcpData))
          e.dataTransfer.setData('type', 'mcp')
        }
      })
    }
    
    this.viewport.addEventListener('dragover', (e) => {
      e.preventDefault()
    })
    
    this.viewport.addEventListener('drop', (e) => {
      e.preventDefault()
      
      const dragType = e.dataTransfer.getData('type')
      
      if (dragType === 'template') {
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
      } else if (dragType === 'mcp') {
        const mcpData = JSON.parse(e.dataTransfer.getData('mcp'))
        if (mcpData) {
          // Find the node under the cursor
          const element = document.elementFromPoint(e.clientX, e.clientY)
          const nodeEl = element?.closest('.swarm-node')
          
          if (nodeEl) {
            const nodeId = parseInt(nodeEl.dataset.nodeId)
            this.addMcpToNode(nodeId, mcpData)
          }
        }
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
      const nodeEl = target.closest('.swarm-node')
      const nodeId = parseInt(nodeEl.dataset.nodeId)
      
      if (this.shiftPressed) {
        // Shift-click for multi-select
        this.toggleNodeSelection(nodeId)
      } else {
        // Check if clicking on already selected node in multi-select
        if (this.selectedNodes.length > 1 && this.isNodeSelected(nodeId)) {
          // Start dragging all selected nodes
          this.startMultiNodeDrag(e)
        } else {
          // Single select and drag
          this.selectNode(nodeId)
          this.startNodeDrag(e)
        }
      }
    } else if (e.target === this.viewport || e.target === this.svg) {
      // Click on canvas - deselect all and start panning
      this.deselectAll()
      this.startPanning(e)
    } else if (this.shiftPressed) {
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
        // Handler is now in handleMouseDown for better control
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
    // Clear previous selection unless shift is held
    if (!this.shiftPressed) {
      this.deselectAll()
    }
    
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Add to selected nodes array
    if (!this.selectedNodes.find(n => n.id === nodeId)) {
      this.selectedNodes.push(node)
      node.element.classList.add('selected')
    }
    
    // Keep single selectedNode for backward compatibility
    this.selectedNode = node
    
    // Show properties only for single selection
    if (this.selectedNodes.length === 1) {
      this.showNodeProperties(node)
    } else {
      this.showMultiSelectMessage()
    }
    
    // Notify chat controller about selection change
    this.notifySelectionChange()
  }
  
  toggleNodeSelection(nodeId) {
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    const index = this.selectedNodes.findIndex(n => n.id === nodeId)
    
    if (index > -1) {
      // Node is selected - deselect it
      this.selectedNodes.splice(index, 1)
      node.element.classList.remove('selected')
      
      // Update selectedNode for backward compatibility
      this.selectedNode = this.selectedNodes[this.selectedNodes.length - 1] || null
    } else {
      // Node is not selected - select it
      this.selectedNodes.push(node)
      node.element.classList.add('selected')
      this.selectedNode = node
    }
    
    // Update properties panel
    if (this.selectedNodes.length === 0) {
      this.clearPropertiesPanel()
    } else if (this.selectedNodes.length === 1) {
      this.showNodeProperties(this.selectedNodes[0])
    } else {
      this.showMultiSelectMessage()
    }
    
    // Notify chat controller about selection change
    this.notifySelectionChange()
  }
  
  isNodeSelected(nodeId) {
    return this.selectedNodes.some(n => n.id === nodeId)
  }
  
  showMultiSelectMessage() {
    this.propertiesPanelTarget.innerHTML = `
      <div class="p-4 text-center text-gray-500 dark:text-gray-400">
        <p class="font-medium mb-2">${this.selectedNodes.length} nodes selected</p>
        <p class="text-sm">Select a single node to view/edit its properties</p>
      </div>
    `
  }
  
  deselectAll() {
    // Clear all selected nodes
    this.selectedNodes.forEach(node => {
      node.element?.classList.remove('selected')
    })
    this.selectedNodes = []
    this.selectedNode = null
    
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
    
    // Notify chat controller about selection change
    this.notifySelectionChange()
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
                   value="${nodeData.directory || '.'}" 
                   data-property="directory"
                   data-node-id="${node.id}"
                   placeholder="e.g., . or ./frontend"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm font-mono focus:outline-none">
          </div>
          
          <!-- Temperature (only for OpenAI) -->
          <div id="temperature-field" style="display: ${isOpenAI ? 'block' : 'none'};">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Temperature</label>
            <input type="number" 
                   value="${nodeData.temperature || ''}" 
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
                      class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">${nodeData.system_prompt || ''}</textarea>
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
                       ${nodeData.vibe ? 'checked' : ''}
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
          <div id="tools-field" style="display: ${isClaude && !nodeData.vibe ? 'block' : 'none'};">
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
                           ${nodeData.allowed_tools?.includes(tool) ? 'checked' : ''}
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
          
          <!-- MCP Servers -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">MCP Servers</h4>
            ${nodeData.mcps && nodeData.mcps.length > 0 ? `
              <div class="space-y-2">
                ${nodeData.mcps.map(mcp => `
                  <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900 dark:text-gray-100">${mcp.name}</span>
                        <span class="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                          ${mcp.type ? mcp.type.toUpperCase() : 'UNKNOWN'}
                        </span>
                      </div>
                      ${mcp.type === 'stdio' && mcp.command ? `
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">${mcp.command}</p>
                      ` : ''}
                      ${mcp.type === 'sse' && mcp.url ? `
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">${mcp.url}</p>
                      ` : ''}
                    </div>
                    <button type="button"
                            data-action="click->swarm-visual-builder#removeMcpFromNode"
                            data-node-id="${node.id}"
                            data-mcp-name="${mcp.name}"
                            class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                `).join('')}
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Drag MCP servers from the left panel to add more
              </p>
            ` : `
              <p class="text-xs text-gray-500 dark:text-gray-400 italic">
                No MCP servers configured. Drag from the MCP Servers tab to add.
              </p>
            `}
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
          
          <!-- Save as Template Button -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button"
                    data-action="click->swarm-visual-builder#saveNodeAsTemplate"
                    data-node-id="${node.id}"
                    class="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 dark:bg-green-700 rounded-md hover:bg-green-700 dark:hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 transition-colors">
              <svg class="h-4 w-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"></path>
              </svg>
              Save as Template
            </button>
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
      } else if (property === 'directory' || property === 'temperature' || property === 'vibe') {
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
      } else if (property === 'system_prompt') {
        // Store system_prompt directly in node.data, not in config
        node.data[property] = e.target.value
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
    this.updateSocketStates() // Update socket states after clearing connections
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
  
  async saveNodeAsTemplate(e) {
    const nodeId = parseInt(e.target.dataset.nodeId)
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Create modal for template name
    const templateName = await this.promptForTemplateName(node.data.name)
    if (!templateName) return // User cancelled
    
    // Prepare template data from node
    const templateData = {
      name: templateName,
      description: node.data.description || 'Instance template created from visual builder',
      category: 'general',
      tags: [],
      system_prompt: node.data.system_prompt || node.data.config?.system_prompt || '',
      config: {
        provider: node.data.provider || 'claude',
        model: node.data.model || 'sonnet',
        directory: node.data.directory || '.',
        allowed_tools: node.data.allowed_tools || node.data.config?.allowed_tools || [],
        vibe: node.data.vibe || node.data.config?.vibe || false,
        worktree: node.data.worktree || node.data.config?.worktree || false
      }
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
        this.showFlashMessage(`Template "${templateName}" saved successfully!`, 'success')
        
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
        
        this.showFlashMessage('Failed to save template: ' + errorMessage, 'error')
      }
    } catch (error) {
      console.error('Error saving template:', error)
      this.showFlashMessage('Failed to save template: ' + error.message, 'error')
    }
  }
  
  showFlashMessage(message, type = 'info') {
    // Create flash message element
    const flash = document.createElement('div')
    flash.className = `fixed top-20 right-4 px-6 py-4 rounded-lg shadow-lg z-50 transition-all transform translate-x-0 ${
      type === 'success' ? 'bg-green-600 text-white' :
      type === 'error' ? 'bg-red-600 text-white' :
      type === 'warning' ? 'bg-yellow-500 text-white' :
      'bg-blue-600 text-white'
    }`
    flash.textContent = message
    
    // Add to DOM
    document.body.appendChild(flash)
    
    // Animate in
    setTimeout(() => {
      flash.classList.add('opacity-100')
    }, 10)
    
    // Remove after 3 seconds
    setTimeout(() => {
      flash.classList.add('opacity-0', 'translate-x-full')
      setTimeout(() => {
        flash.remove()
      }, 300)
    }, 3000)
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
        const templatesContainer = this.instanceTemplatesTarget
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
  
  deleteSelectedNode() {
    // Delete all selected nodes
    if (this.selectedNodes.length > 0) {
      const nodeIds = this.selectedNodes.map(n => n.id)
      nodeIds.forEach(id => this.deleteNodeById(id))
    } else if (this.selectedNode) {
      // Fallback for backward compatibility
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
    
    // Update socket states after removing node's connections
    this.updateSocketStates()
    
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
      this.updateSocketStates() // Update socket states after removing connection
      this.updateYamlPreview()
    }
  }
  
  // Connection operations
  startConnection(e) {
    e.stopPropagation()
    const socket = e.target
    const nodeId = parseInt(socket.dataset.nodeId)
    const side = socket.dataset.socketSide
    
    // Check if socket is already used as destination - can't use destination as source
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
      
      // Don't connect to self or to main node
      if (targetNodeId !== this.pendingConnection.nodeId && 
          targetNodeId !== this.mainNodeId) {
        
        // Check if this exact connection already exists
        const isDuplicate = this.connectionManager.getConnections().some(conn => 
          conn.from === this.pendingConnection.nodeId && 
          conn.to === targetNodeId
        )
        
        if (isDuplicate) {
          console.log('Connection already exists between these nodes')
        } else {
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
            
            this.updateConnections()
            this.updateSocketStates() // Update socket states after creating connection
            this.updateYamlPreview()
          }
        }
      }
    } else {
      // Try to find the closest node
      const targetNode = element?.closest('.swarm-node')
      if (targetNode) {
        const targetNodeId = parseInt(targetNode.dataset.nodeId)
        const fromId = this.pendingConnection.nodeId
        const fromSide = this.pendingConnection.side
        
        // Don't connect to self or to main node
        if (targetNodeId !== fromId && targetNodeId !== this.mainNodeId) {
          const fromNode = this.nodeManager.findNode(fromId)
          const toNode = this.nodeManager.findNode(targetNodeId)
          
          if (fromNode && toNode) {
            // Use intelligent socket selection
            const { toSide } = this.connectionManager.findBestSocketPairForDrag(fromNode, toNode, fromSide)
            
            // Check if this exact connection already exists
            const isDuplicate = this.connectionManager.getConnections().some(conn => 
              conn.from === fromId && 
              conn.to === targetNodeId
            )
            
            if (!isDuplicate) {
              // Get target socket - destinations can accept multiple connections
              const targetSocket = targetNode.querySelector(`.socket[data-socket-side="${toSide}"]`)
              if (targetSocket) {
                this.connectionManager.createConnection(fromId, fromSide, targetNodeId, toSide)
                this.updateConnections()
                this.updateSocketStates() // Update socket states after creating connection
                this.updateYamlPreview()
              }
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
    const targetNodeId = targetNode ? parseInt(targetNode.dataset.nodeId) : null
    
    // Don't highlight self or main node
    if (targetNode && 
        targetNodeId !== this.pendingConnection.nodeId &&
        targetNodeId !== this.mainNodeId) {
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
  
  updateSocketStates() {
    // First clear all socket states
    this.viewport.querySelectorAll('.socket.used-as-destination').forEach(socket => {
      socket.classList.remove('used-as-destination')
    })
    
    // Then mark sockets that are used as destinations
    this.connectionManager.getConnections().forEach(conn => {
      const toNode = this.viewport.querySelector(`.swarm-node[data-node-id="${conn.to}"]`)
      if (toNode) {
        const toSocket = toNode.querySelector(`.socket[data-socket-side="${conn.toSide}"]`)
        if (toSocket) {
          toSocket.classList.add('used-as-destination')
        }
      }
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
    
    // For single node drag
    this.draggedNode = node
    this.draggedNodes = [node] // Store as array for consistency
    
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
  
  startMultiNodeDrag(e) {
    const nodeEl = e.target.closest('.swarm-node')
    if (!nodeEl) return
    
    // Store all selected nodes for dragging
    this.draggedNodes = [...this.selectedNodes]
    this.draggedNode = this.draggedNodes[0] // Keep for backward compatibility
    
    // Store initial positions for all selected nodes
    this.dragStartMouseX = e.clientX
    this.dragStartMouseY = e.clientY
    this.dragStartScrollLeft = this.container.scrollLeft
    this.dragStartScrollTop = this.container.scrollTop
    
    // Store initial position for each node
    this.dragStartPositions = new Map()
    this.draggedNodes.forEach(node => {
      this.dragStartPositions.set(node.id, {
        x: node.data.x,
        y: node.data.y
      })
      node.element.style.zIndex = '1000'
      node.element.style.cursor = 'grabbing'
    })
    
    // Animation state
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
    this.animationFrameId = null
    
    this.container.classList.add('dragging-node')
    
    e.preventDefault()
  }
  
  continueNodeDrag(e) {
    if (!this.draggedNodes || this.draggedNodes.length === 0) return
    
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
    
    // Start animation if not already running
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => this.updateNodePosition())
    }
  }
  
  updateNodePosition() {
    if (!this.draggedNodes || this.draggedNodes.length === 0) return
    
    // Calculate mouse delta
    const deltaMouseX = this.lastMouseX - this.dragStartMouseX
    const deltaMouseY = this.lastMouseY - this.dragStartMouseY
    
    // Calculate scroll delta
    const deltaScrollX = this.container.scrollLeft - this.dragStartScrollLeft
    const deltaScrollY = this.container.scrollTop - this.dragStartScrollTop
    
    // Calculate final position accounting for both mouse movement and scroll
    const deltaX = (deltaMouseX + deltaScrollX) / this.zoomLevel
    const deltaY = (deltaMouseY + deltaScrollY) / this.zoomLevel
    
    // Update all dragged nodes
    this.draggedNodes.forEach(node => {
      let startX, startY
      
      if (this.dragStartPositions && this.dragStartPositions.has(node.id)) {
        // Multi-node drag
        const startPos = this.dragStartPositions.get(node.id)
        startX = startPos.x
        startY = startPos.y
      } else {
        // Single node drag (backward compatibility)
        startX = this.dragStartNodeX
        startY = this.dragStartNodeY
      }
      
      const x = startX + deltaX
      const y = startY + deltaY
      
      this.nodeManager.updateNodePosition(node.id, x, y)
      
      // Update element position
      node.element.style.left = `${x + this.canvasCenter}px`
      node.element.style.top = `${y + this.canvasCenter}px`
    })
    
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
    if (!this.draggedNodes || this.draggedNodes.length === 0) return
    
    // Cancel animation
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    
    // Reset styles for all dragged nodes
    this.draggedNodes.forEach(node => {
      node.element.style.zIndex = ''
      node.element.style.cursor = ''
    })
    
    this.container.classList.remove('dragging-node')
    this.draggedNode = null
    this.draggedNodes = []
    this.dragStartPositions = null
    
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
  
  // Tab switching for left sidebar
  switchToInstancesTab() {
    // Update tab buttons
    this.instancesTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.instancesTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    this.mcpServersTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.mcpServersTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    
    // Show/hide tab content
    this.instancesTabTarget.classList.remove('hidden')
    this.mcpServersTabTarget.classList.add('hidden')
  }
  
  switchToMcpServersTab() {
    // Update tab buttons
    this.mcpServersTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.mcpServersTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    this.instancesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-orange-600', 'dark:border-orange-400')
    this.instancesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent')
    
    // Show/hide tab content
    this.mcpServersTabTarget.classList.remove('hidden')
    this.instancesTabTarget.classList.add('hidden')
  }
  
  // MCP server filtering
  filterMcpServers(e) {
    const searchTerm = e.target.value.toLowerCase()
    const mcpServers = this.mcpServersListTarget.querySelectorAll('[data-mcp-card]')
    
    mcpServers.forEach(card => {
      const name = card.dataset.mcpName.toLowerCase()
      const type = card.dataset.mcpType.toLowerCase()
      const element = card.querySelector('p')
      const description = element ? element.textContent.toLowerCase() : ''
      
      const matches = name.includes(searchTerm) || 
                     type.includes(searchTerm) || 
                     description.includes(searchTerm)
      
      card.style.display = matches ? 'block' : 'none'
    })
  }
  
  // Add MCP server to node
  addMcpToNode(nodeId, mcpData) {
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Initialize mcps array if not exists
    if (!node.data.mcps) {
      node.data.mcps = []
    }
    
    // Check if this MCP is already added
    const exists = node.data.mcps.some(mcp => mcp.name === mcpData.name)
    if (exists) {
      this.showFlashMessage(`MCP server "${mcpData.name}" is already configured for this instance`, 'warning')
      return
    }
    
    // Convert server_type to type for claude-swarm compatibility
    const mcpConfig = {
      name: mcpData.config.name,
      type: mcpData.config.type === 'stdio' || mcpData.config.type === 'sse' ? mcpData.config.type : mcpData.type
    }
    
    // Add type-specific fields
    if (mcpConfig.type === 'stdio') {
      if (mcpData.config.command) mcpConfig.command = mcpData.config.command
      if (mcpData.config.args && mcpData.config.args.length > 0) mcpConfig.args = mcpData.config.args
      if (mcpData.config.env && Object.keys(mcpData.config.env).length > 0) mcpConfig.env = mcpData.config.env
    } else if (mcpConfig.type === 'sse') {
      if (mcpData.config.url) mcpConfig.url = mcpData.config.url
      if (mcpData.config.headers && Object.keys(mcpData.config.headers).length > 0) mcpConfig.headers = mcpData.config.headers
    }
    
    // Add to node's MCP list
    node.data.mcps.push(mcpConfig)
    
    // Update properties panel if this node is selected
    if (this.selectedNode?.id === nodeId) {
      this.showNodeProperties(node)
    }
    
    // Update YAML preview
    this.updateYamlPreview()
    
    this.showFlashMessage(`Added MCP server "${mcpData.name}" to instance`, 'success')
  }
  
  // Remove MCP server from node
  removeMcpFromNode(e) {
    const nodeId = parseInt(e.currentTarget.dataset.nodeId)
    const mcpName = e.currentTarget.dataset.mcpName
    
    const node = this.nodeManager.findNode(nodeId)
    if (!node || !node.data.mcps) return
    
    // Remove the MCP
    node.data.mcps = node.data.mcps.filter(mcp => mcp.name !== mcpName)
    
    // Update properties panel
    if (this.selectedNode?.id === nodeId) {
      this.showNodeProperties(node)
    }
    
    // Update YAML preview
    this.updateYamlPreview()
    
    this.showFlashMessage(`Removed MCP server "${mcpName}" from instance`, 'info')
  }
  
  // YAML preview and export
  updateYamlPreview() {
    const swarmData = this.buildSwarmData()
    const yaml = this.generateReadableYaml(swarmData)
    this.yamlPreviewTarget.querySelector('pre').textContent = yaml
  }
  
  // Generate readable YAML with proper multiline formatting
  generateReadableYaml(data) {
    // Use js-yaml with custom options for better formatting
    const yaml = jsyaml.dump(data, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false
    })
    
    // Post-process to ensure proper | formatting for multiline strings
    const lines = yaml.split('\n')
    const processedLines = []
    let i = 0
    
    while (i < lines.length) {
      const line = lines[i]
      
      // Check if this is a prompt or description field with a long value in quotes
      const quotedMatch = line.match(/^(\s*)(prompt|description):\s*["'](.*)["']\s*$/)
      if (quotedMatch) {
        const indent = quotedMatch[1]
        const field = quotedMatch[2]
        const value = quotedMatch[3]
        
        // If the value is long or contains special characters, use | literal style
        if (value.length > 60 || value.includes('\\n')) {
          // Unescape the string
          const unescapedValue = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'")
          
          processedLines.push(`${indent}${field}: |`)
          
          // Split into lines and add with proper indentation
          const valueLines = unescapedValue.split('\n')
          valueLines.forEach(valueLine => {
            processedLines.push(`${indent}  ${valueLine}`)
          })
          
          i++
          continue
        }
      }
      
      // Check for multiline string indicators from js-yaml (both > and |)
      const multilineMatch = line.match(/^(\s*)(prompt|description):\s*[|>]-?\s*$/)
      if (multilineMatch) {
        const indent = multilineMatch[1]
        const field = multilineMatch[2]
        
        // Replace > with | to use literal style instead of folded style
        processedLines.push(`${indent}${field}: |`)
        i++
        
        // Include the indented content lines
        while (i < lines.length && lines[i].match(/^\s+/)) {
          processedLines.push(lines[i])
          i++
        }
        continue
      }
      
      processedLines.push(line)
      i++
    }
    
    return processedLines.join('\n')
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
      const description = node.data.description || node.data.config?.description || `Instance for ${node.data.name}`
      instance.description = description
      
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
      if (node.data.system_prompt) {
        instance.prompt = node.data.system_prompt
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
      
      // Add MCP servers if present
      if (node.data.mcps && node.data.mcps.length > 0) {
        instance.mcps = node.data.mcps
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
    if (this.hasChatTabTarget) {
      this.chatTabTarget.classList.add('hidden')
    }
    
    this.propertiesTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.propertiesTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.yamlTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.yamlTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    if (this.hasChatTabButtonTarget) {
      this.chatTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
      this.chatTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    }
  }
  
  switchToYaml() {
    this.yamlPreviewTabTarget.classList.remove('hidden')
    this.propertiesTabTarget.classList.add('hidden')
    if (this.hasChatTabTarget) {
      this.chatTabTarget.classList.add('hidden')
    }
    
    this.yamlTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.yamlTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.propertiesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.propertiesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    if (this.hasChatTabButtonTarget) {
      this.chatTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
      this.chatTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    }
    
    this.updateYamlPreview()
  }
  
  switchToChat() {
    if (!this.hasChatTabTarget) return
    
    this.chatTabTarget.classList.remove('hidden')
    this.propertiesTabTarget.classList.add('hidden')
    this.yamlPreviewTabTarget.classList.add('hidden')
    
    this.chatTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.chatTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.propertiesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.propertiesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    this.yamlTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.yamlTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    // Dispatch event to notify chat controller that tab is now visible
    window.dispatchEvent(new CustomEvent('chat:tabVisible'))
  }
  
  // Handle canvas refresh when Claude modifies the file
  async handleCanvasRefresh(event) {
    const filePath = event.detail?.filePath
    if (!filePath || filePath !== this.filePathValue) return
    
    // Debounce multiple refresh requests
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
    }
    
    // Set a flag to prevent duplicate refreshes
    if (this.isRefreshing) {
      return
    }
    
    // Wait a bit to collect all refresh events, then execute once
    this.refreshTimeout = setTimeout(async () => {
      // Prevent duplicate refreshes
      if (this.isRefreshing) return
      this.isRefreshing = true
      
      // Refreshing canvas due to file modification by Claude
      
      // Reload the file content from server
      try {
        const response = await fetch(`/api/swarm_files/read?path=${encodeURIComponent(filePath)}`)
        if (!response.ok) throw new Error('Failed to read file')
        
        const data = await response.json()
        if (data.yaml_content) {
          // Parse and reload the YAML content
          const yamlData = jsyaml.load(data.yaml_content)
          this.loadFromYamlData(yamlData)
          this.updateYamlPreview()
          
          // Show a brief notification
          this.showNotification('Canvas refreshed with latest changes')
        }
      } catch (error) {
        console.error('Error refreshing canvas:', error)
      } finally {
        // Reset the flag after a delay to allow for the next refresh
        setTimeout(() => {
          this.isRefreshing = false
        }, 1000)
      }
    }, 500) // Wait 500ms to debounce multiple events
  }
  
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
  
  // Load swarm data from parsed YAML
  async loadFromYamlData(data) {
    // Handle claude-swarm format (version: 1, swarm: {...})
    let swarmData = null
    let swarmName = null
    let tags = []
    
    if (data.version === 1 && data.swarm) {
      // Standard claude-swarm format
      swarmData = data.swarm
      swarmName = swarmData.name || this.nameInputTarget.value || 'imported_swarm'
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
      console.error('Invalid swarm data format')
      return
    }
    
    // Clear existing canvas (skip confirmation for programmatic refresh)
    this.clearAll(true)
    
    // Set name and tags
    if (swarmName) {
      this.nameInputTarget.value = swarmName
    }
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
            }
          })
        }
      }
    })
    
    // Auto-layout and update
    await this.autoLayout()
    
    // Center view on imported nodes if any
    if (importedNodes.length > 0) {
      const bounds = this.nodeManager.getNodesBounds()
      const centerX = (bounds.minX + bounds.maxX) / 2 + this.canvasCenter
      const centerY = (bounds.minY + bounds.maxY) / 2 + this.canvasCenter
      
      const containerRect = this.container.getBoundingClientRect()
      this.container.scrollLeft = centerX * this.zoomLevel - containerRect.width / 2
      this.container.scrollTop = centerY * this.zoomLevel - containerRect.height / 2
    }
    
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
      
      // Import the swarm (skip confirmation for programmatic refresh)
      this.clearAll(true)
      
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
    const yaml = this.generateReadableYaml(swarmData)
    
    // Normalize filename: lowercase and replace spaces with dashes
    const filename = (this.nameInputTarget.value || 'swarm')
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
    const yaml = this.generateReadableYaml(swarmData)
    
    // Check if we're working with files (either editing or creating new)
    if (this.isFileEditValue || this.isNewFileValue) {
      if (this.isFileEditValue && this.filePathValue) {
        // Editing existing file - save to same path
        await this.saveToFile(this.filePathValue, yaml)
      } else if (this.isNewFileValue && this.projectPathValue) {
        // Creating new file - prompt for filename
        await this.saveAsNewFile(yaml)
      }
      return
    }
    
    const isUpdate = !!this.swarmIdValue
    const url = isUpdate ? `/swarm_templates/${this.swarmIdValue}` : '/swarm_templates'
    const method = isUpdate ? 'PATCH' : 'POST'
    
    try {
      const response = await fetch(url, {
        method: method,
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
              mainNodeId: this.mainNodeId,
              tags: this.tags
            })
          }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        window.location.href = result.redirect_url || '/swarm_templates'
      } else {
        alert(`Failed to ${isUpdate ? 'update' : 'save'} swarm`)
      }
    } catch (error) {
      console.error('Save error:', error)
      alert(`Failed to ${isUpdate ? 'update' : 'save'} swarm: ` + error.message)
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
        this.filePathValue = result.file_path
        this.isFileEditValue = true
        this.isNewFileValue = false
        
        // Show success message
        this.showFlashMessage(result.message || 'Swarm file saved successfully', 'success')
        
        // Enable the Launch button
        this.enableLaunchButton()
        
        // Update Save button text from "Save as..." to "Save"
        this.updateSaveButtonText()
        
        // Don't redirect - stay on the page
        if (result.redirect_url) {
          // Only redirect if explicitly requested
          window.location.href = result.redirect_url
        }
      } else {
        const error = await response.json()
        this.showFlashMessage('Failed to save swarm file: ' + (error.message || 'Unknown error'), 'error')
      }
    } catch (error) {
      console.error('Save error:', error)
      this.showFlashMessage('Failed to save swarm file: ' + error.message, 'error')
    }
  }
  
  updateSaveButtonText() {
    const saveButton = document.getElementById('save-swarm')
    if (saveButton) {
      // Find the text node (last child after the icon)
      const textNode = saveButton.childNodes[saveButton.childNodes.length - 1]
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        if (this.isFileEditValue && this.filePathValue) {
          textNode.textContent = 'Save'
        } else if (this.isNewFileValue) {
          textNode.textContent = 'Save as...'
        } else {
          // For database swarms
          textNode.textContent = saveButton.dataset.persisted === 'true' ? 'Update Swarm' : 'Save Swarm'
        }
      }
    }
  }
  
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
  
  enableLaunchButton() {
    const launchButton = document.getElementById('launch-swarm')
    if (launchButton) {
      launchButton.disabled = false
      launchButton.classList.remove('opacity-50', 'cursor-not-allowed')
      launchButton.classList.add('hover:bg-blue-700', 'dark:hover:bg-blue-700')
    }
  }
  
  async launchSwarm() {
    // Check if we have a saved file path
    if (!this.filePathValue) {
      this.showFlashMessage('Please save the swarm file first before launching', 'error')
      return
    }
    
    // Get the relative path from the project directory
    const projectPath = this.projectPathValue
    const filePath = this.filePathValue
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
    const projectId = this.projectIdValue
    if (projectId) {
      // Build the URL with the swarm config pre-selected
      const newSessionUrl = `/sessions/new?project_id=${projectId}&config=${encodeURIComponent(relativePath)}`
      window.location.href = newSessionUrl
    } else {
      this.showFlashMessage('Cannot launch swarm: project not found', 'error')
    }
  }
  
  async saveAsNewFile(yaml) {
    // Generate default filename from swarm name
    const swarmName = this.nameInputTarget.value || 'swarm'
    const defaultFilename = swarmName.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.yml'
    
    // Prompt for filename
    const filename = await this.promptForFilename(defaultFilename)
    if (!filename) return // User cancelled
    
    // Build full path
    const filePath = `${this.projectPathValue}/${filename}`
    
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
  
  async promptForFilename(defaultName) {
    return new Promise((resolve) => {
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
          <span class="text-xs">It will be saved in: ${this.projectPathValue}/</span>
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
      
      // Store cursor position for maintaining it after manipulation
      let lastCursorPos = baseName.length
      
      // Ensure .yml extension on every input change
      input.addEventListener('input', (e) => {
        // Get current cursor position
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
      
      // Prevent cursor from going into the .yml extension
      input.addEventListener('keydown', (e) => {
        const cursorPos = input.selectionStart
        const value = input.value
        const baseLength = value.length - 4 // -4 for '.yml'
        
        // If cursor is at the end of basename and user presses right arrow, prevent default
        if (e.key === 'ArrowRight' && cursorPos >= baseLength) {
          e.preventDefault()
        }
        
        // If user tries to select all (Ctrl+A or Cmd+A), select only basename
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault()
          input.setSelectionRange(0, baseLength)
        }
      })
      
      // Prevent clicking into the .yml extension
      input.addEventListener('click', (e) => {
        const cursorPos = input.selectionStart
        const value = input.value
        const baseLength = value.length - 4 // -4 for '.yml'
        
        if (cursorPos > baseLength) {
          input.setSelectionRange(baseLength, baseLength)
        }
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
  
  loadExistingSwarm() {
    
    if (!this.existingDataValue && !this.existingYamlValue) return
    
    try {
      const data = this.existingDataValue ? JSON.parse(this.existingDataValue) : {}
      
      // Load visual data if available
      if (data.nodes && data.connections) {
        // Load nodes
        this.nodeManager.load(data.nodes)
        
        // Render nodes
        this.nodeManager.getNodes().forEach(node => {
          this.renderNode(node)
        })
        
        // Load connections
        this.connectionManager.load(data.connections)
        
        // Set main node
        if (data.mainNodeId) {
          this.mainNodeId = data.mainNodeId
          this.updateMainNodeBadge(data.mainNodeId)
        }
        
        // Load tags
        if (data.tags) {
          this.tags = data.tags
          this.renderTags()
        }
        
        // Update UI - this renders the connections
        this.updateConnections()
        // NOW mark destination sockets after connections are rendered
        this.updateSocketStates()
        this.updateEmptyState()
        this.updateYamlPreview()
      }
      
      // If we have YAML but no visual data, import it
      else if (this.existingYamlValue) {
        const yamlData = jsyaml.load(this.existingYamlValue)
        
        // Handle claude-swarm format
        if (yamlData.version === 1 && yamlData.swarm) {
          const swarmData = yamlData.swarm
          this.nameInputTarget.value = swarmData.name || ''
          
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
          
          // Create connections from instance data
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
                  }
                })
              }
            }
          })
          
          // Auto-layout for better visual
          this.autoLayout()
          
          // Update connections first to render them
          this.updateConnections()
          
          // Then update socket states after connections are rendered
          this.updateSocketStates()
        }
      }
    } catch (error) {
      console.error('Error loading existing swarm:', error)
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
  
  clearAll(skipConfirm = false) {
    if (!skipConfirm && this.nodeManager.getNodes().length > 0 && !confirm('Clear all nodes and connections?')) {
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
    this.selectedNodes = []
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
  
  // Sidebar resize functionality
  startResize(e) {
    e.preventDefault()
    e.stopPropagation()
    this.startX = e.pageX
    this.startWidth = this.rightSidebarTarget.offsetWidth
    
    // Store bound functions so we can remove them later
    this.boundDoResize = (e) => this.doResize(e)
    this.boundStopResize = (e) => this.stopResize(e)
    
    // Add temporary event listeners with capture to ensure they run first
    document.addEventListener('mousemove', this.boundDoResize, true)
    document.addEventListener('mouseup', this.boundStopResize, true)
    
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
    
    const diff = this.startX - e.pageX  // Reverse because we're resizing from the left edge
    const newWidth = this.startWidth + diff
    
    // Respect min and max width
    const minWidth = 300
    const maxWidth = 800
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      this.rightSidebarTarget.style.width = `${newWidth}px`
    }
  }
  
  stopResize(e) {
    e.preventDefault()
    e.stopPropagation()
    
    // Remove temporary event listeners (with capture flag)
    document.removeEventListener('mousemove', this.boundDoResize, true)
    document.removeEventListener('mouseup', this.boundStopResize, true)
    
    // Clean up bound functions
    this.boundDoResize = null
    this.boundStopResize = null
    
    // Reset cursor
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    
    // Remove overlay
    this.removeResizeOverlay()
  }
  
  // Expand sidebar to max width with animation
  expandSidebarToMax() {
    if (!this.hasRightSidebarTarget) {
      return
    }
    
    const maxWidth = 800
    const currentWidth = this.rightSidebarTarget.offsetWidth
    
    // Only expand if not already at max
    if (currentWidth >= maxWidth) {
      return
    }
    
    // Add transition for smooth animation
    this.rightSidebarTarget.style.transition = 'width 0.3s ease-out'
    this.rightSidebarTarget.style.width = `${maxWidth}px`
    
    // Remove transition after animation completes
    setTimeout(() => {
      this.rightSidebarTarget.style.transition = ''
    }, 300)
  }
  
  notifySelectionChange() {
    // Create event with selected nodes data
    const selectedNodesData = this.selectedNodes.map(node => ({
      id: node.id,
      name: node.data.name || 'Unnamed Instance',
      model: node.data.model || 'Unknown Model',
      type: node.type
    }))
    
    // Dispatch event for chat controller to listen to
    window.dispatchEvent(new CustomEvent('nodes:selectionChanged', {
      detail: {
        selectedNodes: selectedNodesData,
        count: this.selectedNodes.length
      }
    }))
  }
  
  getSelectedNodesContext() {
    // Return context string for selected nodes
    if (this.selectedNodes.length === 0) return null
    
    const nodeDescriptions = this.selectedNodes.map(node => {
      const name = node.data.name || 'Unnamed Instance'
      const model = node.data.model || 'Unknown Model'
      return `- ${name} (${model})`
    }).join('\n')
    
    return `\n\n[Context: This message is about the following selected instance${this.selectedNodes.length > 1 ? 's' : ''}:\n${nodeDescriptions}]`
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
}