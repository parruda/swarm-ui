import { Controller } from "@hotwired/stimulus"
import jsyaml from "js-yaml"

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
    
    // Create viewport with a transform layer for smooth panning
    this.viewport = document.createElement('div')
    this.viewport.style.position = 'relative'
    this.viewport.style.minWidth = '100%'
    this.viewport.style.minHeight = '100%'
    this.viewport.style.boxSizing = 'border-box'
    // Start with container size, will expand as nodes are added
    this.viewport.style.width = '100%'
    this.viewport.style.height = '100%'
    this.viewport.style.willChange = 'transform' // Optimize for transform changes
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
        <marker id="arrow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z" fill="#f97316" />
        </marker>
        <marker id="arrow-selected" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z" fill="#ea580c" />
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
    
    // Use a large canvas with origin at center
    this.canvasSize = 10000 // Large enough for most use cases
    this.canvasCenter = this.canvasSize / 2
    this.viewport.style.width = this.canvasSize + 'px'
    this.viewport.style.height = this.canvasSize + 'px'
    
    // Start with view centered
    setTimeout(() => {
      this.container.scrollLeft = this.canvasCenter - this.container.clientWidth / 2
      this.container.scrollTop = this.canvasCenter - this.container.clientHeight / 2
    }, 0)
    
    // Setup drag and drop
    this.setupDragAndDrop()
    
    // Setup canvas panning
    this.setupCanvasPanning()
    
    // Setup zoom with mouse wheel
    this.setupMouseWheelZoom()
    
    // Click on viewport to deselect
    this.viewport.addEventListener('click', (e) => {
      if (e.target === this.viewport || e.target === this.svg) {
        this.deselectAll()
      }
    })
  }
  
  setupMouseWheelZoom() {
    this.container.addEventListener('wheel', (e) => {
      // Only zoom with ctrl/cmd + wheel
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        const oldZoom = this.zoomLevel
        
        // Calculate new zoom
        this.zoomLevel = Math.min(Math.max(this.zoomLevel * delta, 0.1), 5)
        
        if (this.zoomLevel !== oldZoom) {
          // Get mouse position relative to container
          const rect = this.container.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          
          // Calculate scroll adjustment to zoom toward mouse position
          const scrollX = this.container.scrollLeft
          const scrollY = this.container.scrollTop
          
          const newScrollX = (scrollX + x) * (this.zoomLevel / oldZoom) - x
          const newScrollY = (scrollY + y) * (this.zoomLevel / oldZoom) - y
          
          this.updateZoom()
          
          // Adjust scroll to keep mouse position stable
          this.container.scrollLeft = newScrollX
          this.container.scrollTop = newScrollY
        }
      }
    })
  }
  
  setupCanvasPanning() {
    let isPanning = false
    let startX = 0
    let startY = 0
    let scrollLeft = 0
    let scrollTop = 0
    
    // Use mousedown on viewport for panning
    this.viewport.addEventListener('mousedown', (e) => {
      // Only pan with middle mouse or left mouse + space/shift
      if (e.button === 1 || (e.button === 0 && (e.shiftKey || e.target === this.viewport || e.target === this.svg))) {
        // Don't pan if clicking on a node or socket
        if (e.target.closest('.swarm-node') || e.target.closest('.socket')) return
        
        e.preventDefault()
        isPanning = true
        this.container.classList.add('panning')
        
        startX = e.pageX - this.container.offsetLeft
        startY = e.pageY - this.container.offsetTop
        scrollLeft = this.container.scrollLeft
        scrollTop = this.container.scrollTop
      }
    })
    
    document.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false
        this.container.classList.remove('panning')
      }
    })
    
    document.addEventListener('mousemove', (e) => {
      if (!isPanning) return
      
      e.preventDefault()
      const x = e.pageX - this.container.offsetLeft
      const y = e.pageY - this.container.offsetTop
      const walkX = (x - startX) * 1.5 // Increase pan speed
      const walkY = (y - startY) * 1.5
      
      this.container.scrollLeft = scrollLeft - walkX
      this.container.scrollTop = scrollTop - walkY
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
      
      // Convert to node coordinates relative to canvas center
      const x = (scrolledX - this.canvasCenter) / this.zoomLevel
      const y = (scrolledY - this.canvasCenter) / this.zoomLevel
      
      await this.addNodeFromTemplate(templateName, templateConfig, { x, y })
    })
  }
  
  addBlankInstance() {
    // Calculate center of visible viewport relative to canvas center
    const scrollX = this.container.scrollLeft
    const scrollY = this.container.scrollTop
    const viewCenterX = scrollX + this.container.clientWidth / 2
    const viewCenterY = scrollY + this.container.clientHeight / 2
    
    // Convert to node coordinates (relative to canvas center)
    const centerX = (viewCenterX - this.canvasCenter) / this.zoomLevel
    const centerY = (viewCenterY - this.canvasCenter) / this.zoomLevel
    
    // Create a blank instance with minimal configuration
    const blankConfig = {
      description: "",
      provider: "claude",
      model: "",
      directory: ".",
      system_prompt: "",
      allowed_tools: []
    }
    
    this.addNodeFromTemplate("", blankConfig, { x: centerX, y: centerY })
    
    // Select the newly created node and focus on name field
    setTimeout(() => {
      const newNodeId = this.nextNodeId - 1
      this.selectNode(newNodeId)
      
      // Focus on the instance name field
      setTimeout(() => {
        const nameInput = this.propertiesPanelTarget.querySelector('[data-property="label"]')
        if (nameInput) {
          nameInput.focus()
          nameInput.select()
        }
      }, 50)
    }, 100)
  }
  
  updateViewportSize() {
    // With pre-allocated canvas, we don't need to resize
    // Just update node positions
    this.nodes.forEach((node) => {
      node.element.style.left = (node.data.x + this.canvasCenter) + 'px'
      node.element.style.top = (node.data.y + this.canvasCenter) + 'px'
    })
    
    // Update connections after position updates
    this.updateConnections()
  }
  
  async addNodeFromTemplate(name, config, position) {
    // Hide empty state
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.add('hidden')
    }
    
    // Generate unique key - convert to lowercase with underscores
    const baseKey = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : `instance_${this.nextNodeId}`
    let nodeKey = baseKey || `instance_${this.nextNodeId}` // Fallback if name becomes empty after conversion
    let counter = 1
    
    // Check against all existing node labels (not just keys) to ensure uniqueness
    const usedNames = Array.from(this.nodes.values()).map(node => node.data.label)
    while (usedNames.includes(nodeKey)) {
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
      label: nodeKey,  // Use the converted key as the label
      x: position.x - nodeWidth / 2,
      y: position.y - nodeHeight / 2,
      description: config.description || "",
      model: config.model || "",
      provider: config.provider || "claude",
      directory: config.directory || ".",
      system_prompt: config.system_prompt || "",
      temperature: config.temperature || null,
      allowed_tools: config.allowed_tools || [],
      vibe: config.vibe || (config.provider === 'openai') || false, // OpenAI is always vibe mode
      saved_allowed_tools: config.allowed_tools || []  // Keep a copy for when vibe is toggled off
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
    node.style.left = (nodeData.x + this.canvasCenter) + 'px'
    node.style.top = (nodeData.y + this.canvasCenter) + 'px'
    node.style.width = '200px'
    node.dataset.nodeId = nodeData.id
    
    node.innerHTML = `
      ${this.mainNodeId === nodeData.id ? '<span class="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded z-10">Main</span>' : ''}
      <div class="node-header">
        <h4 class="node-title">${nodeData.label || 'instance_' + nodeData.id}</h4>
      </div>
      <div class="node-content">
        <p class="node-description">${nodeData.description || 'No description'}</p>
        <div class="node-tags">
          ${nodeData.model ? `<span class="node-tag model-tag">${nodeData.model}</span>` : ''}
          ${nodeData.provider !== 'claude' ? `<span class="node-tag provider-tag">${nodeData.provider}</span>` : ''}
          ${nodeData.vibe ? '<span class="node-tag vibe-tag">Vibe</span>' : ''}
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
        startX: (rect.left - containerRect.left + rect.width/2) / this.zoomLevel,
        startY: (rect.top - containerRect.top + rect.height/2) / this.zoomLevel
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
      const x = (e.clientX - rect.left) / this.zoomLevel
      const y = (e.clientY - rect.top) / this.zoomLevel
      
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
  
  getNodeConnections(nodeId) {
    // Get all connections where this node is either the source or destination
    return this.connections.filter(c => c.from === nodeId || c.to === nodeId)
  }
  
  clearNodeConnections(event) {
    const nodeId = parseInt(event.currentTarget.dataset.nodeId)
    
    // Remove all connections involving this node
    this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
    
    // Update the visual connections
    this.updateConnections()
    this.updateYamlPreview()
    
    // Refresh the properties panel to show updated connection state
    if (this.selectedNode && this.selectedNode.data.id === nodeId) {
      this.showNodeProperties(this.selectedNode.data)
    }
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
    let animationFrameId = null
    let lastMouseX = 0
    let lastMouseY = 0
    
    element.addEventListener('mousedown', (e) => {
      // Don't drag if clicking on socket or connection-related elements
      if (e.target.classList.contains('socket')) return
      
      e.preventDefault()
      isDragging = true
      
      // Add dragging class to container
      this.container.classList.add('dragging-node')
      
      // Store the initial mouse position in client coordinates
      const startMouseX = e.clientX
      const startMouseY = e.clientY
      
      // Store the initial node position
      const startNodeX = nodeData.x
      const startNodeY = nodeData.y
      
      element.style.zIndex = 1000
      element.style.cursor = 'grabbing'
      
      // Smooth animation frame-based update
      const updateNodePosition = () => {
        if (!isDragging) return
        
        // Calculate the delta from the start position
        const deltaX = (lastMouseX - startMouseX) / this.zoomLevel
        const deltaY = (lastMouseY - startMouseY) / this.zoomLevel
        
        // Update node position (relative to center)
        nodeData.x = startNodeX + deltaX
        nodeData.y = startNodeY + deltaY
        
        // Update element position
        element.style.left = (nodeData.x + this.canvasCenter) + 'px'
        element.style.top = (nodeData.y + this.canvasCenter) + 'px'
        
        // Update connections
        this.updateConnections()
        
        // Check for auto-scroll with smooth acceleration
        const containerRect = this.container.getBoundingClientRect()
        const edgeSize = 80 // Larger detection zone
        const maxScrollSpeed = 25
        
        const distanceFromLeft = lastMouseX - containerRect.left
        const distanceFromRight = containerRect.right - lastMouseX
        const distanceFromTop = lastMouseY - containerRect.top
        const distanceFromBottom = containerRect.bottom - lastMouseY
        
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
        animationFrameId = requestAnimationFrame(updateNodePosition)
      }
      
      // Create handlers specific to this drag
      const handleMouseMove = (e) => {
        if (!isDragging) return
        
        lastMouseX = e.clientX
        lastMouseY = e.clientY
        
        // Start animation if not already running
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(updateNodePosition)
        }
      }
      
      const handleMouseUp = () => {
        isDragging = false
        element.style.zIndex = ''
        element.style.cursor = ''
        
        // Remove dragging class
        this.container.classList.remove('dragging-node')
        
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        
        // Update connections after drag complete
        this.updateConnections()
        
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
      
      // Initialize mouse position
      lastMouseX = e.clientX
      lastMouseY = e.clientY
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      // Start the animation loop
      animationFrameId = requestAnimationFrame(updateNodePosition)
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
        // When zoomed, we need to account for the scale transform
        const x1 = (fromRect.left - viewportRect.left + fromRect.width/2) / this.zoomLevel
        const y1 = (fromRect.top - viewportRect.top + fromRect.height/2) / this.zoomLevel
        const x2 = (toRect.left - viewportRect.left + toRect.width/2) / this.zoomLevel
        const y2 = (toRect.top - viewportRect.top + toRect.height/2) / this.zoomLevel
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
        path.dataset.connectionIndex = index
        
        // Get all node positions for collision detection
        const nodeObstacles = []
        this.nodes.forEach((node, nodeId) => {
          if (nodeId !== conn.from && nodeId !== conn.to) {
            const rect = node.element.getBoundingClientRect()
            nodeObstacles.push({
              id: nodeId,
              left: (rect.left - viewportRect.left) / this.zoomLevel,
              top: (rect.top - viewportRect.top) / this.zoomLevel,
              right: (rect.left - viewportRect.left + rect.width) / this.zoomLevel,
              bottom: (rect.top - viewportRect.top + rect.height) / this.zoomLevel,
              centerX: (rect.left - viewportRect.left + rect.width / 2) / this.zoomLevel,
              centerY: (rect.top - viewportRect.top + rect.height / 2) / this.zoomLevel
            })
          }
        })
        
        // Generate path based on socket sides for better curves
        let d
        const dx = x2 - x1
        const dy = y2 - y1
        let offset = 50 // Control point offset
        
        // Check if direct path would intersect any nodes
        const hasObstacles = this.checkPathObstacles(x1, y1, x2, y2, nodeObstacles)
        if (hasObstacles) {
          // Increase offset to route around obstacles
          offset = 100
        }
        
        // Adjust endpoint to account for arrow size
        const arrowOffset = 8 // Pixels to stop before the target so arrow tip touches the dot
        let adjustedX2 = x2
        let adjustedY2 = y2
        
        if (conn.fromSide === 'right' && conn.toSide === 'left') {
          // Calculate point slightly before the end for proper arrow orientation
          const preFinalX = x2 - arrowOffset - 5
          adjustedX2 = x2 - arrowOffset
          // Horizontal connection
          const cx1 = x1 + Math.min(offset, Math.abs(dx) / 3)
          const cx2 = preFinalX - Math.min(offset, Math.abs(dx) / 3)
          // Add a small straight segment at the end for proper arrow orientation
          d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${preFinalX} ${y2} L ${adjustedX2} ${adjustedY2}`
        } else if (conn.fromSide === 'left' && conn.toSide === 'right') {
          const preFinalX = x2 + arrowOffset + 5
          adjustedX2 = x2 + arrowOffset
          // Reverse horizontal
          const cx1 = x1 - Math.min(offset, Math.abs(dx) / 3)
          const cx2 = preFinalX + Math.min(offset, Math.abs(dx) / 3)
          d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${preFinalX} ${y2} L ${adjustedX2} ${adjustedY2}`
        } else if (conn.fromSide === 'bottom' && conn.toSide === 'top') {
          const preFinalY = y2 - arrowOffset - 5
          adjustedY2 = y2 - arrowOffset
          // Vertical connection
          const cy1 = y1 + Math.min(offset, Math.abs(dy) / 3)
          const cy2 = preFinalY - Math.min(offset, Math.abs(dy) / 3)
          d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${preFinalY} L ${adjustedX2} ${adjustedY2}`
        } else if (conn.fromSide === 'top' && conn.toSide === 'bottom') {
          const preFinalY = y2 + arrowOffset + 5
          adjustedY2 = y2 + arrowOffset
          // Reverse vertical
          const cy1 = y1 - Math.min(offset, Math.abs(dy) / 3)
          const cy2 = preFinalY + Math.min(offset, Math.abs(dy) / 3)
          d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${preFinalY} L ${adjustedX2} ${adjustedY2}`
        } else {
          // Mixed connections - use adaptive bezier
          // Calculate angle to adjust endpoint
          const angle = Math.atan2(dy, dx)
          adjustedX2 = x2 - Math.cos(angle) * arrowOffset
          adjustedY2 = y2 - Math.sin(angle) * arrowOffset
          const cx = (x1 + adjustedX2) / 2
          const cy = (y1 + adjustedY2) / 2
          d = `M ${x1} ${y1} Q ${cx} ${cy}, ${adjustedX2} ${adjustedY2}`
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
  
  checkPathObstacles(x1, y1, x2, y2, obstacles) {
    // Check if a straight line between two points intersects any obstacle
    const padding = 20 // Add padding around nodes
    
    for (const obstacle of obstacles) {
      // Expand obstacle bounds by padding
      const left = obstacle.left - padding
      const right = obstacle.right + padding
      const top = obstacle.top - padding
      const bottom = obstacle.bottom + padding
      
      // Check if line segment intersects with expanded rectangle
      if (this.lineIntersectsRect(x1, y1, x2, y2, left, top, right, bottom)) {
        return true
      }
    }
    return false
  }
  
  lineIntersectsRect(x1, y1, x2, y2, left, top, right, bottom) {
    // Check if line segment (x1,y1)-(x2,y2) intersects rectangle
    // First, check if either endpoint is inside the rectangle
    if ((x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) ||
        (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)) {
      return true
    }
    
    // Check if line intersects any of the four rectangle edges
    return this.lineIntersectsLine(x1, y1, x2, y2, left, top, right, top) ||    // Top edge
           this.lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom) || // Right edge
           this.lineIntersectsLine(x1, y1, x2, y2, left, bottom, right, bottom) || // Bottom edge
           this.lineIntersectsLine(x1, y1, x2, y2, left, top, left, bottom)      // Left edge
  }
  
  lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
    // Check if two line segments intersect
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (Math.abs(denom) < 0.0001) return false // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
    
    return t >= 0 && t <= 1 && u >= 0 && u <= 1
  }
  
  selectConnection(index) {
    // Clear previous selection
    this.svg.querySelectorAll('.connection').forEach(path => {
      path.setAttribute('stroke', '#f97316')
      path.setAttribute('stroke-width', '2')
      path.setAttribute('marker-end', 'url(#arrow)')
    })
    
    // Select new connection
    const path = this.svg.querySelector(`[data-connection-index="${index}"]`)
    if (path) {
      path.setAttribute('stroke', '#ea580c')
      path.setAttribute('stroke-width', '3')
      path.setAttribute('marker-end', 'url(#arrow-selected)')
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
      path.setAttribute('marker-end', 'url(#arrow)')
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
      path.setAttribute('marker-end', 'url(#arrow)')
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
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Instance Name <span class="text-red-500">*</span></label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
              Use only letters, numbers, and underscores (e.g., my_instance)
            </p>
            <input type="text" 
                   value="${nodeData.label || ''}" 
                   data-property="label"
                   data-node-id="${nodeData.id}"
                   placeholder="my_instance"
                   pattern="^[a-zA-Z0-9_]+$"
                   class="mt-1 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm focus:outline-none">
            <span class="text-xs text-red-500 dark:text-red-400 mt-1 hidden" data-validation-error>
              Invalid name. Use only letters, numbers, and underscores.
            </span>
          </div>
          
          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Description <span class="text-red-500">*</span></label>
            <input type="text" 
                   value="${nodeData.description || ''}" 
                   data-property="description"
                   data-node-id="${nodeData.id}"
                   placeholder="Brief description of this instance's purpose"
                   required
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
          
          <!-- Vibe Mode -->
          <div id="vibe-mode-field" style="display: ${isClaude || isOpenAI ? 'block' : 'none'};">
            <label class="flex items-start ${isOpenAI ? 'cursor-default' : 'cursor-pointer'}">
              <input type="checkbox" 
                     ${nodeData.vibe || isOpenAI ? 'checked' : ''}
                     ${isOpenAI ? 'disabled' : ''}
                     data-property="vibe"
                     data-node-id="${nodeData.id}"
                     data-action="change->swarm-visual-builder#toggleVibeMode"
                     class="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-0 focus:outline-none ${isOpenAI ? 'opacity-50 cursor-default' : 'cursor-pointer'}">
              <div class="ml-3">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Vibe Mode</span>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  ${isOpenAI ? 'OpenAI instances are always in vibe mode with access to all tools' : 'When enabled, this instance skips all permissions and has access to all available tools'}
                </p>
              </div>
            </label>
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
          
          <!-- Connections -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Connections</h4>
            ${this.getNodeConnections(nodeData.id).length > 0 ? `
              <div class="space-y-2 mb-3">
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  This instance has ${this.getNodeConnections(nodeData.id).length} connection(s)
                </p>
                <button type="button"
                        data-action="click->swarm-visual-builder#clearNodeConnections"
                        data-node-id="${nodeData.id}"
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
      // Add blur event for instance name to convert and ensure uniqueness
      if (input.dataset.property === 'label') {
        input.addEventListener('blur', (e) => this.updateNodeProperty(e))
      }
    })
    
    // Add change listeners for tool checkboxes
    this.propertiesPanelTarget.querySelectorAll('[data-tool-checkbox]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.updateAllowedTools(e))
    })
  }
  
  updateNodeProperty(event) {
    const nodeId = parseInt(event.target.dataset.nodeId)
    const property = event.target.dataset.property
    let value = event.target.value
    
    const node = this.nodes.get(nodeId)
    if (node) {
      // Validate and convert instance name
      if (property === 'label') {
        const validationError = event.target.parentElement.querySelector('[data-validation-error]')
        
        // Convert to lowercase with underscores on blur
        if (event.type === 'blur' || event.type === 'change') {
          // Convert spaces and special chars to underscores, remove leading/trailing underscores
          const converted = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
          
          // Check for uniqueness
          const usedNames = Array.from(this.nodes.values())
            .filter(n => n.data.id !== nodeId)
            .map(n => n.data.label)
          
          let finalName = converted || 'instance'
          let counter = 1
          while (usedNames.includes(finalName)) {
            finalName = `${converted}_${counter}`
            counter++
          }
          
          value = finalName
          event.target.value = finalName
        }
        
        // Real-time validation
        const isValid = /^[a-zA-Z0-9_]+$/.test(value)
        
        if (!isValid && value !== '') {
          event.target.classList.add('ring-red-500', 'dark:ring-red-500')
          event.target.classList.remove('ring-gray-300', 'dark:ring-gray-600')
          if (validationError) validationError.classList.remove('hidden')
          return // Don't update if invalid
        } else {
          event.target.classList.remove('ring-red-500', 'dark:ring-red-500')
          event.target.classList.add('ring-gray-300', 'dark:ring-gray-600')
          if (validationError) validationError.classList.add('hidden')
        }
      }
      
      node.data[property] = value
      
      // Update visual elements
      if (property === 'model') {
        const badge = node.element.querySelector('.node-tag.model-tag')
        if (badge) badge.textContent = value
      } else if (property === 'label') {
        const titleEl = node.element.querySelector('.node-title')
        if (titleEl) titleEl.textContent = value || 'instance_' + nodeId
        // Update the key in nodeKeyMap
        this.nodeKeyMap.set(nodeId, value || 'instance_' + nodeId)
        // Update the header in properties panel too
        const header = this.propertiesPanelTarget.querySelector('h3')
        if (header) header.textContent = `Instance: ${value || 'instance_' + nodeId}`
      } else if (property === 'description') {
        const descEl = node.element.querySelector('.node-description')
        if (descEl) descEl.textContent = value || 'No description'
      } else if (property === 'provider') {
        // Toggle fields based on provider
        const temperatureField = this.propertiesPanelTarget.querySelector('#temperature-field')
        const toolsField = this.propertiesPanelTarget.querySelector('#tools-field')
        const vibeModeField = this.propertiesPanelTarget.querySelector('#vibe-mode-field')
        
        if (value === 'openai') {
          if (temperatureField) temperatureField.style.display = 'block'
          if (toolsField) toolsField.style.display = 'none'
          if (vibeModeField) vibeModeField.style.display = 'block'
          // Set all tools for OpenAI
          node.data.allowed_tools = [
            "Bash", "Edit", "Glob", "Grep", "LS", "MultiEdit", "NotebookEdit", 
            "NotebookRead", "Read", "Task", "TodoWrite", "WebFetch", "WebSearch", "Write"
          ]
          // OpenAI is always vibe mode
          node.data.vibe = true
          // Update the checkbox to be checked and disabled
          const vibeCheckbox = this.propertiesPanelTarget.querySelector('[data-property="vibe"]')
          if (vibeCheckbox) {
            vibeCheckbox.checked = true
            vibeCheckbox.disabled = true
            vibeCheckbox.classList.add('opacity-50', 'cursor-default')
          }
        } else {
          if (temperatureField) temperatureField.style.display = 'none'
          if (vibeModeField) vibeModeField.style.display = 'block'
          // Show tools field only if not in vibe mode
          if (toolsField) toolsField.style.display = node.data.vibe ? 'none' : 'block'
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
      // Save for when vibe mode is toggled off
      node.data.saved_allowed_tools = checkedTools
      this.updateYamlPreview()
    }
  }
  
  toggleVibeMode(event) {
    const nodeId = parseInt(event.target.dataset.nodeId)
    const node = this.nodes.get(nodeId)
    const isChecked = event.target.checked
    
    if (node) {
      node.data.vibe = isChecked
      
      const toolsField = this.propertiesPanelTarget.querySelector('#tools-field')
      
      if (isChecked) {
        // Hide tools field when vibe is on
        if (toolsField) toolsField.style.display = 'none'
        // Save current tools selection before clearing
        if (node.data.allowed_tools && node.data.allowed_tools.length > 0) {
          node.data.saved_allowed_tools = [...node.data.allowed_tools]
        }
        // Clear allowed tools when in vibe mode
        node.data.allowed_tools = []
      } else {
        // Show tools field when vibe is off
        if (toolsField) toolsField.style.display = 'block'
        // Restore previously selected tools
        if (node.data.saved_allowed_tools && node.data.saved_allowed_tools.length > 0) {
          node.data.allowed_tools = [...node.data.saved_allowed_tools]
          // Update checkboxes
          this.propertiesPanelTarget.querySelectorAll('[data-tool-checkbox]').forEach(checkbox => {
            checkbox.checked = node.data.allowed_tools.includes(checkbox.value)
          })
        }
      }
      
      // Update the vibe tag on the node
      const tagsContainer = node.element.querySelector('.node-tags')
      const vibeTag = node.element.querySelector('.vibe-tag')
      
      if (isChecked && !vibeTag) {
        // Add vibe tag
        const newTag = document.createElement('span')
        newTag.className = 'node-tag vibe-tag'
        newTag.textContent = 'Vibe'
        tagsContainer.appendChild(newTag)
      } else if (!isChecked && vibeTag) {
        // Remove vibe tag
        vibeTag.remove()
      }
      
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
      this.updateViewportSize()
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
      if (node.data.system_prompt) instanceConfig.prompt = node.data.system_prompt
      if (node.data.temperature !== null && node.data.temperature !== undefined) instanceConfig.temperature = node.data.temperature
      
      // Handle vibe mode for Claude instances
      if (node.data.provider === 'claude' && node.data.vibe) {
        instanceConfig.vibe = true
        // Don't include allowed_tools when in vibe mode
      } else if (node.data.allowed_tools?.length > 0) {
        instanceConfig.allowed_tools = node.data.allowed_tools
      }
      
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
      
      // Show pan cursor when shift is pressed
      if (e.key === 'Shift' && !e.repeat) {
        this.container.classList.add('shift-pressed')
      }
      
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
    
    document.addEventListener('keyup', (e) => {
      // Remove pan cursor when shift is released
      if (e.key === 'Shift') {
        this.container.classList.remove('shift-pressed')
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
      if (node.data.system_prompt) instanceConfig.prompt = node.data.system_prompt
      if (node.data.temperature !== null && node.data.temperature !== undefined) instanceConfig.temperature = node.data.temperature
      
      // Handle vibe mode for Claude instances
      if (node.data.provider === 'claude' && node.data.vibe) {
        instanceConfig.vibe = true
        // Don't include allowed_tools when in vibe mode
      } else if (node.data.allowed_tools?.length > 0) {
        instanceConfig.allowed_tools = node.data.allowed_tools
      }
      
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
    
    // Collect instance data for saving
    const instancesData = []
    this.nodes.forEach((node, id) => {
      instancesData.push({
        key: this.nodeKeyMap.get(id),
        name: node.data.label,
        description: node.data.description || '',
        provider: node.data.provider || 'claude',
        model: node.data.model || 'sonnet',
        directory: node.data.directory || '.',
        system_prompt: node.data.system_prompt || '',
        temperature: node.data.temperature,
        vibe: node.data.vibe || false,
        allowed_tools: node.data.allowed_tools || []
      })
    })
    
    const formData = new FormData()
    formData.append('swarm_template[name]', name)
    formData.append('swarm_template[tags]', JSON.stringify(this.tags))
    formData.append('swarm_template[config_data]', JSON.stringify(configData))
    formData.append('swarm_template[instances_data]', JSON.stringify(instancesData))
    
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
      try {
        const yamlContent = e.target.result
        const data = jsyaml.load(yamlContent)
        
        if (!data || !data.swarm || !data.swarm.instances) {
          alert('Invalid swarm YAML format')
          return
        }
        
        // Clear existing canvas
        this.clearAll()
        
        // Set swarm name
        if (data.swarm.name && this.hasNameInputTarget) {
          this.nameInputTarget.value = data.swarm.name
        }
        
        // Import tags if present
        if (data.swarm.tags && Array.isArray(data.swarm.tags)) {
          this.tags = [...data.swarm.tags]
          this.renderTags()
        }
        
        // Create instance templates from the YAML
        const instances = data.swarm.instances
        const instanceKeys = Object.keys(instances)
        
        // First pass: create all nodes
        const keyToNodeIdMap = new Map()
        const nodePositions = this.calculateImportNodePositions(instanceKeys.length)
        
        instanceKeys.forEach((key, index) => {
          const instance = instances[key]
          const position = nodePositions[index]
          
          // Convert YAML format to internal format
          const config = {
            description: instance.description || '',
            provider: instance.provider || 'claude',
            model: instance.model || 'sonnet',
            directory: instance.directory || '.',
            system_prompt: instance.prompt || '',
            temperature: instance.temperature,
            vibe: instance.vibe || false,
            allowed_tools: instance.allowed_tools || []
          }
          
          // For OpenAI instances, ensure vibe mode is true
          if (config.provider === 'openai') {
            config.vibe = true
          }
          
          // Create the node
          this.addNodeFromTemplate(key, config, position)
          // The node ID is nextNodeId - 1 after creation
          const nodeId = this.nextNodeId - 1
          keyToNodeIdMap.set(key, nodeId)
        })
        
        // Second pass: create connections
        instanceKeys.forEach((key) => {
          const instance = instances[key]
          const fromNodeId = keyToNodeIdMap.get(key)
          
          if (instance.connections && Array.isArray(instance.connections)) {
            instance.connections.forEach(targetKey => {
              const toNodeId = keyToNodeIdMap.get(targetKey)
              if (toNodeId !== undefined) {
                // Determine best connection sides based on node positions
                const fromNode = this.nodes.get(fromNodeId)
                const toNode = this.nodes.get(toNodeId)
                
                if (fromNode && toNode) {
                  const fromX = fromNode.data.x
                  const fromY = fromNode.data.y
                  const toX = toNode.data.x
                  const toY = toNode.data.y
                  
                  // Calculate relative positions
                  const dx = toX - fromX
                  const dy = toY - fromY
                  
                  let fromSide, toSide
                  
                  // Determine connection sides based on relative positions
                  if (Math.abs(dx) > Math.abs(dy)) {
                    // Horizontal connection
                    if (dx > 0) {
                      fromSide = 'right'
                      toSide = 'left'
                    } else {
                      fromSide = 'left'
                      toSide = 'right'
                    }
                  } else {
                    // Vertical connection
                    if (dy > 0) {
                      fromSide = 'bottom'
                      toSide = 'top'
                    } else {
                      fromSide = 'top'
                      toSide = 'bottom'
                    }
                  }
                  
                  this.connections.push({
                    from: fromNodeId,
                    fromSide: fromSide,
                    to: toNodeId,
                    toSide: toSide
                  })
                }
              }
            })
          }
        })
        
        // Set main instance if specified
        if (data.swarm.main && keyToNodeIdMap.has(data.swarm.main)) {
          this.mainNodeId = keyToNodeIdMap.get(data.swarm.main)
        }
        
        // Update the display
        this.updateConnections()
        this.updateYamlPreview()
        
        // Clear file input for future imports
        event.target.value = ''
        
      } catch (error) {
        console.error('Error parsing YAML:', error)
        alert('Failed to import YAML: ' + error.message)
      }
    }
    reader.readAsText(file)
  }
  
  calculateImportNodePositions(nodeCount) {
    const positions = []
    
    // Import at center of current view (0, 0 in node coordinates is center of canvas)
    const centerX = 0
    const centerY = 0
    const radius = 200
    
    if (nodeCount === 1) {
      positions.push({ x: centerX, y: centerY })
    } else if (nodeCount <= 6) {
      // Arrange in a circle
      for (let i = 0; i < nodeCount; i++) {
        const angle = (i / nodeCount) * Math.PI * 2 - Math.PI / 2
        positions.push({
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        })
      }
    } else {
      // Grid layout for many nodes
      const cols = Math.ceil(Math.sqrt(nodeCount))
      const spacing = 250
      const rows = Math.ceil(nodeCount / cols)
      
      const startX = centerX - (cols - 1) * spacing / 2
      const startY = centerY - (rows - 1) * spacing / 2
      
      for (let i = 0; i < nodeCount; i++) {
        const row = Math.floor(i / cols)
        const col = i % cols
        positions.push({
          x: startX + col * spacing,
          y: startY + row * spacing
        })
      }
    }
    
    return positions
  }
}