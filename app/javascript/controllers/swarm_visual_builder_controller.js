import { Controller } from "@hotwired/stimulus"

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
    
    this.tags = []
    this.selectedNode = null
    this.selectedConnection = null
    this.mainNodeId = null
    this.nodeKeyMap = new Map()
    this.nodes = new Map()
    this.connections = []
    
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
    
    // Create viewport
    this.viewport = document.createElement('div')
    this.viewport.style.position = 'relative'
    this.viewport.style.width = '4000px'
    this.viewport.style.height = '4000px'
    this.viewport.style.boxSizing = 'border-box'
    container.appendChild(this.viewport)
    
    // Create SVG for connections
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    this.svg.style.position = 'absolute'
    this.svg.style.top = '0'
    this.svg.style.left = '0'
    this.svg.style.width = '100%'
    this.svg.style.height = '100%'
    this.svg.style.pointerEvents = 'none'
    this.svg.innerHTML = `
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#f97316" />
        </marker>
      </defs>
      <g id="connections"></g>
      <path id="dragPath" stroke="#f97316" stroke-width="2" fill="none" stroke-dasharray="5,5" style="display:none;" />
    `
    this.viewport.appendChild(this.svg)
    
    // Initialize properties
    this.container = container
    this.zoomLevel = 1
    this.nextNodeId = 1
    
    // Setup drag and drop
    this.setupDragAndDrop()
    
    // Click on viewport to deselect
    this.viewport.addEventListener('click', (e) => {
      if (e.target === this.viewport || e.target === this.svg) {
        this.deselectAll()
      }
    })
  }
  
  setupDragAndDrop() {
    // Listen for dragover on both container and viewport for better compatibility
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    })
    
    this.viewport.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    })
    
    // Handle drop on container instead of viewport to avoid transform issues
    this.container.addEventListener('drop', async (e) => {
      e.preventDefault()
      
      const templateName = e.dataTransfer.getData('templateName')
      const templateConfig = JSON.parse(e.dataTransfer.getData('templateConfig') || '{}')
      
      if (!templateName) return
      
      // Get mouse position relative to the container
      const containerRect = this.container.getBoundingClientRect()
      const mouseXInContainer = e.clientX - containerRect.left
      const mouseYInContainer = e.clientY - containerRect.top
      
      // Add the scroll offset to get the actual position in the scrollable area
      const scrolledX = mouseXInContainer + this.container.scrollLeft
      const scrolledY = mouseYInContainer + this.container.scrollTop
      
      // Since the viewport has transform: scale(), we need to convert from visual pixels to logical pixels
      const x = scrolledX / this.zoomLevel
      const y = scrolledY / this.zoomLevel
      
      await this.addNodeFromTemplate(templateName, templateConfig, { x, y })
    })
  }
  
  async addNodeFromTemplate(name, config, position) {
    // Hide empty state
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.add('hidden')
    }
    
    // Generate unique key
    const baseKey = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    let nodeKey = baseKey
    let counter = 1
    
    const usedKeys = Array.from(this.nodeKeyMap.values())
    while (usedKeys.includes(nodeKey)) {
      nodeKey = `${baseKey}_${counter}`
      counter++
    }
    
    // Create node data - center on drop position
    const nodeId = this.nextNodeId++
    const nodeWidth = 200
    const nodeHeight = 120
    const nodeData = {
      id: nodeId,
      key: nodeKey,
      label: nodeKey,
      x: position.x - nodeWidth / 2,
      y: position.y - nodeHeight / 2,
      description: config.description || name,
      model: config.model || "sonnet",
      provider: config.provider || "claude",
      directory: config.directory || ".",
      system_prompt: config.system_prompt || "",
      temperature: config.temperature || null,
      allowed_tools: config.allowed_tools || []
    }
    
    // Set first node as main BEFORE creating element
    if (this.nodes.size === 0) {
      this.mainNodeId = nodeId
    }
    
    // Create node element (will use mainNodeId to determine visual state)
    const nodeElement = this.createNodeElement(nodeData)
    this.viewport.appendChild(nodeElement)
    
    // Store node
    this.nodes.set(nodeId, {
      data: nodeData,
      element: nodeElement
    })
    this.nodeKeyMap.set(nodeId, nodeKey)
    
    this.updateYamlPreview()
  }
  
  createNodeElement(nodeData) {
    const node = document.createElement('div')
    node.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-lg border-2 border-gray-300 dark:border-gray-600 p-4 select-none hover:shadow-xl transition-shadow swarm-node'
    node.style.position = 'absolute'
    node.style.left = nodeData.x + 'px'
    node.style.top = nodeData.y + 'px'
    node.style.width = '200px'
    node.dataset.nodeId = nodeData.id
    
    node.innerHTML = `
      ${this.mainNodeId === nodeData.id ? '<span class="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded z-10">Main</span>' : ''}
      <div class="node-header">
        <h4 class="node-title">${nodeData.label}</h4>
      </div>
      <div class="node-content">
        <p class="node-description">${nodeData.description}</p>
        <div class="node-tags">
          <span class="node-tag model-tag">${nodeData.model}</span>
          ${nodeData.provider !== 'claude' ? `<span class="node-tag provider-tag">${nodeData.provider}</span>` : ''}
        </div>
      </div>
      <div class="socket socket-top" data-socket="top" data-node-id="${nodeData.id}" data-socket-side="top" title="Connect from/to top"></div>
      <div class="socket socket-right" data-socket="right" data-node-id="${nodeData.id}" data-socket-side="right" title="Connect from/to right"></div>
      <div class="socket socket-bottom" data-socket="bottom" data-node-id="${nodeData.id}" data-socket-side="bottom" title="Connect from/to bottom"></div>
      <div class="socket socket-left" data-socket="left" data-node-id="${nodeData.id}" data-socket-side="left" title="Connect from/to left"></div>
    `
    
    // Add event handlers
    this.makeDraggable(node, nodeData)
    node.addEventListener('click', () => this.selectNode(nodeData.id))
    
    // Socket handlers for drag connections
    const sockets = node.querySelectorAll('.socket')
    sockets.forEach(socket => {
      const side = socket.dataset.socketSide
      this.setupSocketDrag(socket, nodeData.id, side)
    })
    
    return node
  }
  
  setupSocketDrag(socket, nodeId, socketSide) {
    socket.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      
      const rect = socket.getBoundingClientRect()
      const containerRect = this.viewport.getBoundingClientRect()
      
      this.pendingConnection = { 
        nodeId, 
        socketSide,
        startX: rect.left - containerRect.left + rect.width/2,
        startY: rect.top - containerRect.top + rect.height/2
      }
      
      // Add connecting class to socket
      socket.classList.add('connecting')
      
      // Show drag path
      const dragPath = this.svg.querySelector('#dragPath')
      dragPath.style.display = 'block'
      
      this.viewport.classList.add('cursor-crosshair')
      
      // Add temporary mousemove and mouseup handlers
      const handleMouseMove = (e) => this.handleConnectionDragMove(e)
      const handleMouseUp = (e) => this.handleConnectionDragEnd(e)
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp, { once: true })
      
      // Store handlers for cleanup
      this.dragHandlers = { move: handleMouseMove, up: handleMouseUp }
    })
  }
  
  handleConnectionDragMove(e) {
    if (this.pendingConnection) {
      const rect = this.viewport.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      
      const dragPath = this.svg.querySelector('#dragPath')
      const d = `M ${this.pendingConnection.startX} ${this.pendingConnection.startY} L ${x} ${y}`
      dragPath.setAttribute('d', d)
      
      // Highlight potential target
      const targetElement = document.elementFromPoint(e.clientX, e.clientY)
      this.highlightPotentialTarget(targetElement)
    }
  }
  
  handleConnectionDragEnd(e) {
    if (!this.pendingConnection) return
    
    // Clean up handlers
    if (this.dragHandlers) {
      document.removeEventListener('mousemove', this.dragHandlers.move)
    }
    
    // Find what we dropped on
    const targetElement = document.elementFromPoint(e.clientX, e.clientY)
    const targetNode = targetElement?.closest('.swarm-node')
    
    if (targetNode) {
      const targetNodeId = parseInt(targetNode.dataset.nodeId)
      const { nodeId: fromId, socketSide: fromSide } = this.pendingConnection
      
      if (fromId !== targetNodeId) {
        // Check if trying to connect to main node (which only has right and bottom sockets)
        if (targetNodeId === this.mainNodeId) {
          // Main node can only receive connections - not allowed
          return
        }
        
        // Find the closest socket on the target node
        const targetSockets = targetNode.querySelectorAll('.socket:not(.used-as-destination)')
        let closestSocket = null
        let minDistance = Infinity
        
        targetSockets.forEach(socket => {
          const rect = socket.getBoundingClientRect()
          const socketX = rect.left + rect.width / 2
          const socketY = rect.top + rect.height / 2
          const distance = Math.sqrt(Math.pow(e.clientX - socketX, 2) + Math.pow(e.clientY - socketY, 2))
          
          if (distance < minDistance) {
            minDistance = distance
            closestSocket = socket
          }
        })
        
        if (closestSocket) {
          const targetSide = closestSocket.dataset.socketSide
          this.createConnection(fromId, fromSide, targetNodeId, targetSide)
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
  
  hasIncomingConnections(nodeId) {
    return this.connections.some(c => c.to === nodeId)
  }
  
  updateSocketStates() {
    // Reset all sockets to orange
    this.viewport.querySelectorAll('.socket').forEach(socket => {
      socket.classList.remove('used-as-destination')
    })
    
    // Mark destination sockets as gray
    this.connections.forEach(connection => {
      const toNode = this.nodes.get(connection.to)
      if (toNode) {
        const socket = toNode.element.querySelector(`.socket[data-socket-side="${connection.toSide}"]`)
        if (socket) {
          socket.classList.add('used-as-destination')
        }
      }
    })
  }
  
  makeDraggable(element, nodeData) {
    let isDragging = false
    let dragMouseX = 0
    let dragMouseY = 0
    
    element.addEventListener('mousedown', (e) => {
      // Don't drag if clicking on socket or connection-related elements
      if (e.target.classList.contains('socket')) return
      
      e.preventDefault()
      isDragging = true
      
      // Store the initial mouse position in client coordinates
      const startMouseX = e.clientX
      const startMouseY = e.clientY
      
      // Store the initial node position
      const startNodeX = nodeData.x
      const startNodeY = nodeData.y
      
      element.style.zIndex = 1000
      element.style.cursor = 'grabbing'
      
      // Create handlers specific to this drag
      const handleMouseMove = (e) => {
        if (!isDragging) return
        
        // Calculate the delta from the start position
        const deltaX = (e.clientX - startMouseX) / this.zoomLevel
        const deltaY = (e.clientY - startMouseY) / this.zoomLevel
        
        // Apply the delta to the original position
        nodeData.x = startNodeX + deltaX
        nodeData.y = startNodeY + deltaY
        
        element.style.left = nodeData.x + 'px'
        element.style.top = nodeData.y + 'px'
        
        this.updateConnections()
      }
      
      const handleMouseUp = () => {
        isDragging = false
        element.style.zIndex = ''
        element.style.cursor = ''
        
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    })
  }
  
  
  createConnection(fromId, fromSide, toId, toSide) {
    // Check if connection already exists
    const exists = this.connections.some(c => 
      c.from === fromId && c.to === toId && c.fromSide === fromSide && c.toSide === toSide
    )
    if (!exists) {
      this.connections.push({ 
        from: fromId, 
        fromSide: fromSide,
        to: toId,
        toSide: toSide
      })
      this.updateConnections()
      this.updateYamlPreview()
      
      // Mark the destination socket as used
      this.updateSocketStates()
      
      // Update properties panel if the target node is selected
      if (this.selectedNode && this.selectedNode.data.id === toId) {
        this.showNodeProperties(this.selectedNode.data)
      }
    }
  }
  
  updateConnections() {
    const connectionsGroup = this.svg.querySelector('#connections')
    connectionsGroup.innerHTML = ''
    
    this.connections.forEach((conn, index) => {
      const fromNode = this.nodes.get(conn.from)
      const toNode = this.nodes.get(conn.to)
      
      if (fromNode && toNode) {
        // Get socket positions based on the connection sides
        const fromSocket = fromNode.element.querySelector(`.socket[data-socket-side="${conn.fromSide}"]`)
        const toSocket = toNode.element.querySelector(`.socket[data-socket-side="${conn.toSide}"]`)
        
        // Skip if sockets don't exist
        if (!fromSocket || !toSocket) return
        
        const fromRect = fromSocket.getBoundingClientRect()
        const toRect = toSocket.getBoundingClientRect()
        const viewportRect = this.viewport.getBoundingClientRect()
        
        // Calculate actual positions relative to viewport
        const x1 = fromRect.left - viewportRect.left + fromRect.width/2
        const y1 = fromRect.top - viewportRect.top + fromRect.height/2
        const x2 = toRect.left - viewportRect.left + toRect.width/2
        const y2 = toRect.top - viewportRect.top + toRect.height/2
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
        path.dataset.connectionIndex = index
        
        // Generate path based on socket sides for better curves
        let d
        const dx = x2 - x1
        const dy = y2 - y1
        const offset = 50 // Control point offset
        
        if (conn.fromSide === 'right' && conn.toSide === 'left') {
          // Horizontal connection
          const cx1 = x1 + Math.min(offset, Math.abs(dx) / 3)
          const cx2 = x2 - Math.min(offset, Math.abs(dx) / 3)
          d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`
        } else if (conn.fromSide === 'left' && conn.toSide === 'right') {
          // Reverse horizontal
          const cx1 = x1 - Math.min(offset, Math.abs(dx) / 3)
          const cx2 = x2 + Math.min(offset, Math.abs(dx) / 3)
          d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`
        } else if (conn.fromSide === 'bottom' && conn.toSide === 'top') {
          // Vertical connection
          const cy1 = y1 + Math.min(offset, Math.abs(dy) / 3)
          const cy2 = y2 - Math.min(offset, Math.abs(dy) / 3)
          d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`
        } else if (conn.fromSide === 'top' && conn.toSide === 'bottom') {
          // Reverse vertical
          const cy1 = y1 - Math.min(offset, Math.abs(dy) / 3)
          const cy2 = y2 + Math.min(offset, Math.abs(dy) / 3)
          d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`
        } else {
          // Mixed connections - use adaptive bezier
          const cx = (x1 + x2) / 2
          const cy = (y1 + y2) / 2
          d = `M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}`
        }
        
        path.setAttribute('d', d)
        path.setAttribute('stroke', '#f97316')
        path.setAttribute('stroke-width', '2')
        path.setAttribute('fill', 'none')
        path.setAttribute('marker-end', 'url(#arrow)')
        path.style.pointerEvents = 'stroke'
        path.style.cursor = 'pointer'
        path.classList.add('connection')
        
        path.addEventListener('click', (e) => {
          e.stopPropagation()
          this.selectConnection(index)
        })
        
        connectionsGroup.appendChild(path)
      }
    })
    
    // Update socket colors after rendering connections
    this.updateSocketStates()
  }
  
  selectConnection(index) {
    // Clear previous selection
    this.svg.querySelectorAll('.connection').forEach(path => {
      path.setAttribute('stroke', '#f97316')
      path.setAttribute('stroke-width', '2')
    })
    
    // Select new connection
    const path = this.svg.querySelector(`[data-connection-index="${index}"]`)
    if (path) {
      path.setAttribute('stroke', '#ea580c')
      path.setAttribute('stroke-width', '3')
      this.selectedConnection = index
      this.selectedNode = null
    }
  }
  
  deselectAll() {
    // Deselect connections
    this.selectedConnection = null
    this.svg.querySelectorAll('.connection').forEach(path => {
      path.setAttribute('stroke', '#f97316')
      path.setAttribute('stroke-width', '2')
    })
    
    // Deselect nodes
    this.selectedNode = null
    this.nodes.forEach((node) => {
      node.element.classList.remove('selected')
      node.element.style.borderColor = ''
    })
    
    // Clear properties panel
    this.propertiesPanelTarget.innerHTML = '<div class="p-4 text-center text-gray-500">Select an instance to edit properties</div>'
  }
  
  selectNode(nodeId) {
    // Clear connection selection
    this.selectedConnection = null
    this.svg.querySelectorAll('.connection').forEach(path => {
      path.setAttribute('stroke', '#f97316')
      path.setAttribute('stroke-width', '2')
    })
    
    // Update visual selection
    this.nodes.forEach((node, id) => {
      if (id === nodeId) {
        node.element.classList.add('selected')
        node.element.style.borderColor = '#f97316'
      } else {
        node.element.classList.remove('selected')
        node.element.style.borderColor = ''
      }
    })
    
    this.selectedNode = this.nodes.get(nodeId)
    if (this.selectedNode) {
      this.showNodeProperties(this.selectedNode.data)
    }
  }
  
  showNodeProperties(nodeData) {
    const isOpenAI = nodeData.provider === 'openai'
    const isClaude = !isOpenAI
    
    // Get available tools list
    const availableTools = [
      "Bash", "Edit", "Glob", "Grep", "LS", "MultiEdit", "NotebookEdit", 
      "NotebookRead", "Read", "Task", "TodoWrite", "WebFetch", "WebSearch", "Write"
    ]
    
    this.propertiesPanelTarget.innerHTML = `
      <div class="p-4 space-y-4 overflow-y-auto">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Instance: ${nodeData.label}</h3>
        
        <div class="space-y-4">
          <!-- Name/Label -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Instance Name</label>
            <input type="text" 
                   value="${nodeData.label || ''}" 
                   data-property="label"
                   data-node-id="${nodeData.id}"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <input type="text" 
                   value="${nodeData.description || ''}" 
                   data-property="description"
                   data-node-id="${nodeData.id}"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- Provider -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            <select data-property="provider" 
                    data-node-id="${nodeData.id}"
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
                   data-node-id="${nodeData.id}"
                   placeholder="e.g., claude-3-5-sonnet-20241022"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
          </div>
          
          <!-- Directory -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Working Directory <span class="text-red-500">*</span></label>
            <input type="text" 
                   value="${nodeData.directory || '.'}" 
                   data-property="directory"
                   data-node-id="${nodeData.id}"
                   placeholder="e.g., . or ./frontend"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm font-mono focus:outline-none">
          </div>
          
          <!-- Temperature (only for OpenAI) -->
          <div id="temperature-field" style="display: ${isOpenAI ? 'block' : 'none'};">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Temperature</label>
            <input type="number" 
                   value="${nodeData.temperature || ''}" 
                   data-property="temperature"
                   data-node-id="${nodeData.id}"
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
                      data-node-id="${nodeData.id}"
                      rows="4"
                      placeholder="Define the behavior and capabilities of this AI instance..."
                      class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">${nodeData.system_prompt || ''}</textarea>
          </div>
          
          <!-- Allowed Tools (only for Claude) -->
          <div id="tools-field" style="display: ${isClaude ? 'block' : 'none'};">
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
                           data-node-id="${nodeData.id}"
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
                     ${this.mainNodeId === nodeData.id ? 'checked' : ''}
                     ${this.hasIncomingConnections(nodeData.id) ? 'disabled' : ''}
                     data-action="change->swarm-visual-builder#setMainNode"
                     data-node-id="${nodeData.id}"
                     class="mr-2 disabled:opacity-50 disabled:cursor-not-allowed">
              Main Instance
              ${this.hasIncomingConnections(nodeData.id) ? '<span class="text-xs text-gray-500 dark:text-gray-400 block ml-6">Cannot be main (has incoming connections)</span>' : ''}
            </label>
          </div>
          
          <!-- Delete Button -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button"
                    data-action="click->swarm-visual-builder#deleteNode"
                    data-node-id="${nodeData.id}"
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
    })
    
    // Add change listeners for tool checkboxes
    this.propertiesPanelTarget.querySelectorAll('[data-tool-checkbox]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.updateAllowedTools(e))
    })
  }
  
  updateNodeProperty(event) {
    const nodeId = parseInt(event.target.dataset.nodeId)
    const property = event.target.dataset.property
    const value = event.target.value
    
    const node = this.nodes.get(nodeId)
    if (node) {
      node.data[property] = value
      
      // Update visual elements
      if (property === 'model') {
        const badge = node.element.querySelector('.node-tag.model-tag')
        if (badge) badge.textContent = value
      } else if (property === 'label') {
        const titleEl = node.element.querySelector('.node-title')
        if (titleEl) titleEl.textContent = value
        // Update the header in properties panel too
        const header = this.propertiesPanelTarget.querySelector('h3')
        if (header) header.textContent = `Instance: ${value}`
      } else if (property === 'description') {
        const descEl = node.element.querySelector('.node-description')
        if (descEl) descEl.textContent = value || 'No description'
      } else if (property === 'provider') {
        // Toggle fields based on provider
        const temperatureField = this.propertiesPanelTarget.querySelector('#temperature-field')
        const toolsField = this.propertiesPanelTarget.querySelector('#tools-field')
        
        if (value === 'openai') {
          if (temperatureField) temperatureField.style.display = 'block'
          if (toolsField) toolsField.style.display = 'none'
          // Set all tools for OpenAI
          node.data.allowed_tools = [
            "Bash", "Edit", "Glob", "Grep", "LS", "MultiEdit", "NotebookEdit", 
            "NotebookRead", "Read", "Task", "TodoWrite", "WebFetch", "WebSearch", "Write"
          ]
          // Clear temperature for Claude
        } else {
          if (temperatureField) temperatureField.style.display = 'none'
          if (toolsField) toolsField.style.display = 'block'
          // Clear temperature for Claude
          node.data.temperature = null
          const tempInput = this.propertiesPanelTarget.querySelector('[data-property="temperature"]')
          if (tempInput) tempInput.value = ''
        }
        
        // Update provider badge
        const providerBadge = node.element.querySelector('.node-tag.provider-tag')
        if (providerBadge) providerBadge.textContent = value
      }
      
      this.updateYamlPreview()
    }
  }
  
  updateAllowedTools(event) {
    const nodeId = parseInt(event.target.dataset.nodeId)
    const node = this.nodes.get(nodeId)
    
    if (node) {
      // Get all checked tools
      const checkedTools = []
      this.propertiesPanelTarget.querySelectorAll('[data-tool-checkbox]:checked').forEach(checkbox => {
        checkedTools.push(checkbox.value)
      })
      
      node.data.allowed_tools = checkedTools
      this.updateYamlPreview()
    }
  }
  
  setMainNode(event) {
    const nodeId = parseInt(event.target.dataset.nodeId)
    if (event.target.checked) {
      const prevMainNodeId = this.mainNodeId
      
      // Set new main node
      this.mainNodeId = nodeId
      
      // Rebuild previous main node to add back input socket
      if (prevMainNodeId && this.nodes.has(prevMainNodeId)) {
        const prevNode = this.nodes.get(prevMainNodeId)
        const prevElement = prevNode.element
        const newPrevElement = this.createNodeElement(prevNode.data)
        prevElement.parentNode.replaceChild(newPrevElement, prevElement)
        prevNode.element = newPrevElement
      }
      
      // Rebuild new main node to remove input socket
      const newMainNode = this.nodes.get(nodeId)
      if (newMainNode) {
        const oldElement = newMainNode.element
        const newElement = this.createNodeElement(newMainNode.data)
        oldElement.parentNode.replaceChild(newElement, oldElement)
        newMainNode.element = newElement
        
        // Remove any connections TO the new main node (since main can't receive)
        this.connections = this.connections.filter(c => c.to !== nodeId)
      }
      
      this.updateConnections()
    }
    this.updateYamlPreview()
  }
  
  deleteNode(event) {
    const nodeId = parseInt(event.currentTarget.dataset.nodeId)
    const node = this.nodes.get(nodeId)
    
    if (node) {
      // Remove element
      node.element.remove()
      
      // Remove from maps
      this.nodes.delete(nodeId)
      this.nodeKeyMap.delete(nodeId)
      
      // Remove connections
      this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
      
      // Update main if needed
      if (this.mainNodeId === nodeId) {
        const firstNode = this.nodes.keys().next().value
        this.mainNodeId = firstNode || null
      }
      
      // Clear properties panel
      this.propertiesPanelTarget.innerHTML = '<div class="p-4 text-center text-gray-500">Select an instance to edit properties</div>'
      
      // Show empty state if needed
      if (this.nodes.size === 0 && this.hasEmptyStateTarget) {
        this.emptyStateTarget.classList.remove('hidden')
      }
      
      this.updateConnections()
      this.updateYamlPreview()
    }
  }
  
  setupEventListeners() {
    // Make instance template cards draggable
    const templates = this.instanceTemplatesTarget.querySelectorAll('[data-template-card]')
    templates.forEach(card => {
      card.draggable = true
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('templateName', card.dataset.templateName)
        e.dataTransfer.setData('templateConfig', card.dataset.templateConfig)
        card.classList.add('opacity-50')
      })
      card.addEventListener('dragend', () => {
        card.classList.remove('opacity-50')
      })
    })
  }
  
  // Tab switching
  switchToProperties(event) {
    event?.preventDefault()
    this.propertiesTabTarget.classList.remove('hidden')
    this.yamlPreviewTabTarget.classList.add('hidden')
    
    this.propertiesTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.propertiesTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.yamlTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.yamlTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
  }
  
  switchToYaml(event) {
    event?.preventDefault()
    this.yamlPreviewTabTarget.classList.remove('hidden')
    this.propertiesTabTarget.classList.add('hidden')
    
    this.yamlTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.yamlTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.propertiesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.propertiesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    this.updateYamlPreview()
  }
  
  // YAML generation
  updateYamlPreview() {
    const swarmName = this.hasNameInputTarget ? this.nameInputTarget.value : 'My Swarm'
    
    const config = {
      version: 1,
      swarm: {
        name: swarmName || 'My Swarm',
        instances: {}
      }
    }
    
    // Build instances
    this.nodes.forEach((node, id) => {
      const key = this.nodeKeyMap.get(id)
      const instanceConfig = {}
      
      instanceConfig.description = node.data.description || `${key} instance`
      
      if (node.data.provider && node.data.provider !== 'claude') instanceConfig.provider = node.data.provider
      if (node.data.model && node.data.model !== 'sonnet') instanceConfig.model = node.data.model
      if (node.data.directory && node.data.directory !== '.') instanceConfig.directory = node.data.directory
      if (node.data.system_prompt) instanceConfig.system_prompt = node.data.system_prompt
      if (node.data.temperature !== null && node.data.temperature !== undefined) instanceConfig.temperature = node.data.temperature
      if (node.data.allowed_tools?.length > 0) instanceConfig.allowed_tools = node.data.allowed_tools
      
      // Find connections from this node
      const nodeConnections = this.connections.filter(c => c.from === id)
      if (nodeConnections.length > 0) {
        instanceConfig.connections = nodeConnections.map(c => this.nodeKeyMap.get(c.to)).filter(Boolean)
      }
      
      config.swarm.instances[key] = instanceConfig
    })
    
    if (this.mainNodeId && this.nodeKeyMap.has(this.mainNodeId)) {
      config.swarm.main = this.nodeKeyMap.get(this.mainNodeId)
    }
    
    const yaml = this.toYaml(config)
    
    if (this.hasYamlPreviewTarget) {
      this.yamlPreviewTarget.querySelector('pre').textContent = yaml
    }
  }
  
  toYaml(obj, indent = 0) {
    let yaml = ''
    const spaces = ' '.repeat(indent)
    
    Object.entries(obj).forEach(([key, value]) => {
      if (value === null || value === undefined || 
          (Array.isArray(value) && value.length === 0) || 
          (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)) {
        return
      }
      
      if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`
        value.forEach(item => {
          yaml += `${spaces}  - ${item}\n`
        })
      } else if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`
        yaml += this.toYaml(value, indent + 2)
      } else {
        yaml += `${spaces}${key}: ${value}\n`
      }
    })
    
    return yaml
  }
  
  // Controls
  autoLayout() {
    const nodeArray = Array.from(this.nodes.values())
    const cols = Math.ceil(Math.sqrt(nodeArray.length))
    
    nodeArray.forEach((node, i) => {
      const row = Math.floor(i / cols)
      const col = i % cols
      node.data.x = 50 + col * 250
      node.data.y = 50 + row * 150
      node.element.style.left = node.data.x + 'px'
      node.element.style.top = node.data.y + 'px'
    })
    
    this.updateConnections()
  }
  
  clearAll() {
    if (!confirm('Clear all instances?')) return
    
    // Remove all nodes
    this.nodes.forEach(node => node.element.remove())
    this.nodes.clear()
    this.nodeKeyMap.clear()
    this.connections = []
    this.mainNodeId = null
    
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.remove('hidden')
    }
    
    this.propertiesPanelTarget.innerHTML = '<div class="p-4 text-center text-gray-500">Select an instance to edit properties</div>'
    this.updateConnections()
    this.updateYamlPreview()
  }
  
  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel * 1.1, 3)
    this.updateZoom()
  }
  
  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel * 0.9, 0.3)
    this.updateZoom()
  }
  
  updateZoom() {
    this.viewport.style.transform = `scale(${this.zoomLevel})`
    this.viewport.style.transformOrigin = '0 0'
    if (this.hasZoomLevelTarget) {
      this.zoomLevelTarget.textContent = `${Math.round(this.zoomLevel * 100)}%`
    }
  }
  
  // Search
  filterTemplates(event) {
    const query = event.target.value.toLowerCase()
    this.element.querySelectorAll('[data-template-card]').forEach(card => {
      const name = card.dataset.templateName.toLowerCase()
      card.style.display = name.includes(query) ? 'block' : 'none'
    })
  }
  
  // Tags
  addTag(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      const input = event.target.value
      
      // Split by comma and process each tag
      const newTags = input.split(',').map(t => t.trim()).filter(t => t && !this.tags.includes(t))
      
      if (newTags.length > 0) {
        this.tags.push(...newTags)
        this.renderTags()
        event.target.value = ''
      }
    }
  }
  
  removeTag(event) {
    const tag = event.currentTarget.dataset.tag
    this.tags = this.tags.filter(t => t !== tag)
    this.renderTags()
  }
  
  renderTags() {
    this.tagsContainerTarget.innerHTML = this.tags.map(tag => `
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800 transition-all hover:bg-orange-200 dark:hover:bg-orange-900/50">
        ${tag}
        <button type="button" 
                data-action="click->swarm-visual-builder#removeTag" 
                data-tag="${tag}" 
                class="ml-1 -mr-1 p-0.5 rounded-full hover:bg-orange-300 dark:hover:bg-orange-800 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </span>
    `).join('')
  }
  
  // Keyboard shortcuts
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return
      
      // Delete or Backspace for selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNode) {
        e.preventDefault()
        this.deleteNode({ currentTarget: { dataset: { nodeId: this.selectedNode.data.id } } })
      }
      // Delete or Backspace for selected connection
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedConnection !== null) {
        e.preventDefault()
        const deletedConnection = this.connections[this.selectedConnection]
        this.connections.splice(this.selectedConnection, 1)
        this.selectedConnection = null
        this.updateConnections()
        this.updateYamlPreview()
        
        // Update properties panel if a node involved in the connection is selected
        if (this.selectedNode && (this.selectedNode.data.id === deletedConnection.to || this.selectedNode.data.id === deletedConnection.from)) {
          this.showNodeProperties(this.selectedNode.data)
        }
      }
      
      // Cancel connection on Escape
      if (e.key === 'Escape' && this.pendingConnection) {
        const dragPath = this.svg.querySelector('#dragPath')
        dragPath.style.display = 'none'
        this.pendingConnection = null
        this.viewport.classList.remove('cursor-crosshair')
        // Remove connecting class from all sockets
        this.viewport.querySelectorAll('.socket.connecting').forEach(s => s.classList.remove('connecting'))
      }
    })
  }
  
  // Save/Export
  saveSwarm() {
    const name = this.hasNameInputTarget ? this.nameInputTarget.value : 'My Swarm'
    if (!name) {
      alert('Please enter a name')
      return
    }
    
    const configData = {
      version: 1,
      swarm: {
        name: name,
        instances: {}
      }
    }
    
    // Build instances
    this.nodes.forEach((node, id) => {
      const key = this.nodeKeyMap.get(id)
      const instanceConfig = {}
      
      instanceConfig.description = node.data.description || `${key} instance`
      
      if (node.data.provider && node.data.provider !== 'claude') instanceConfig.provider = node.data.provider
      if (node.data.model && node.data.model !== 'sonnet') instanceConfig.model = node.data.model
      if (node.data.directory && node.data.directory !== '.') instanceConfig.directory = node.data.directory
      if (node.data.system_prompt) instanceConfig.system_prompt = node.data.system_prompt
      if (node.data.temperature !== null && node.data.temperature !== undefined) instanceConfig.temperature = node.data.temperature
      if (node.data.allowed_tools?.length > 0) instanceConfig.allowed_tools = node.data.allowed_tools
      
      // Find connections from this node
      const nodeConnections = this.connections.filter(c => c.from === id)
      if (nodeConnections.length > 0) {
        instanceConfig.connections = nodeConnections.map(c => this.nodeKeyMap.get(c.to)).filter(Boolean)
      }
      
      configData.swarm.instances[key] = instanceConfig
    })
    
    if (this.mainNodeId && this.nodeKeyMap.has(this.mainNodeId)) {
      configData.swarm.main = this.nodeKeyMap.get(this.mainNodeId)
    }
    
    const formData = new FormData()
    formData.append('swarm_template[name]', name)
    formData.append('swarm_template[tags]', JSON.stringify(this.tags))
    formData.append('swarm_template[config_data]', JSON.stringify(configData))
    
    fetch('/swarm_templates', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
      },
      body: formData
    })
    .then(response => {
      if (response.ok) {
        window.location.href = '/swarm_templates'
      } else {
        alert('Failed to save')
      }
    })
  }
  
  exportYaml() {
    const yaml = this.yamlPreviewTarget.querySelector('pre').textContent
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${this.nameInputTarget?.value || 'swarm'}.yaml`
    a.click()  
    URL.revokeObjectURL(url)
  }
  
  importYaml() {
    if (this.hasImportInputTarget) {
      this.importInputTarget.click()
    }
  }
  
  handleImportFile(event) {
    const file = event.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      alert('YAML import not implemented')
    }
    reader.readAsText(file)
  }
}