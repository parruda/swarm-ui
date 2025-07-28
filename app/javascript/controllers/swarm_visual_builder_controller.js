import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "canvas", 
    "instancesPanel", 
    "propertiesPanel",
    "yamlPreview",
    "yamlPreviewTab",
    "propertiesTab",
    "propertiesTabButton",
    "yamlTabButton",
    "searchInput",
    "instanceTemplates",
    "tagInput",
    "tagsContainer",
    "importInput",
    "nameInput",
    "zoomLevel",
    "emptyState"
  ]
  
  static values = {
    instances: Object,
    connections: Object,
    selectedInstance: String,
    connectionMode: Boolean,
    connectionStart: String,
    tags: Array,
    zoom: Number
  }

  connect() {
    console.log("Swarm visual builder connected")
    this.instances = {}
    this.connections = {}
    this.selectedInstance = null
    this.connectionMode = false
    this.connectionStart = null
    this.tags = []
    this.zoom = 100
    
    this.setupCanvas()
    this.setupEventListeners()
    this.setupKeyboardShortcuts()
  }

  setupCanvas() {
    // Create the SVG canvas
    this.canvasTarget.innerHTML = `
      <svg class="w-full h-full absolute inset-0" 
           xmlns="http://www.w3.org/2000/svg"
           data-action="click->swarm-visual-builder#handleCanvasClick">
        <defs>
          <!-- Arrow marker for connections -->
          <marker id="arrow" markerWidth="10" markerHeight="10" 
                  refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" class="fill-orange-500 dark:fill-orange-400" />
          </marker>
          <!-- Grid pattern -->
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" class="fill-gray-400 dark:fill-gray-600" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g id="zoom-container" transform="scale(1)">
          <g id="connections-layer"></g>
          <g id="instances-layer"></g>
        </g>
      </svg>
    `
    
    // Setup drag and drop
    this.canvasTarget.addEventListener('dragover', this.handleDragOver.bind(this))
    this.canvasTarget.addEventListener('drop', this.handleDrop.bind(this))
  }

  setupEventListeners() {
    // Instance template cards
    this.element.querySelectorAll('[data-template-card]').forEach(card => {
      card.draggable = true
      card.addEventListener('dragstart', this.handleDragStart.bind(this))
      card.addEventListener('dragend', this.handleDragEnd.bind(this))
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

  // Drag and drop handlers
  handleDragStart(event) {
    const card = event.target.closest('[data-template-card]')
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('templateId', card.dataset.templateId)
    event.dataTransfer.setData('templateName', card.dataset.templateName)
    event.dataTransfer.setData('templateConfig', card.dataset.templateConfig)
    card.classList.add('opacity-50')
  }

  handleDragEnd(event) {
    event.target.closest('[data-template-card]').classList.remove('opacity-50')
  }

  handleDragOver(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  handleDrop(event) {
    event.preventDefault()
    
    const templateId = event.dataTransfer.getData('templateId')
    const templateName = event.dataTransfer.getData('templateName')
    const templateConfig = JSON.parse(event.dataTransfer.getData('templateConfig'))
    
    // Calculate position relative to canvas
    const rect = this.canvasTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / (this.zoom / 100)
    const y = (event.clientY - rect.top) / (this.zoom / 100)
    
    // Create unique instance key
    const baseKey = templateName.toLowerCase().replace(/[^a-z0-9]/g, '_')
    let instanceKey = baseKey
    let counter = 1
    while (this.instances[instanceKey]) {
      instanceKey = `${baseKey}_${counter}`
      counter++
    }
    
    // Add instance
    this.addInstance(instanceKey, {
      ...templateConfig,
      templateId: templateId,
      x: Math.round(x),
      y: Math.round(y)
    })
  }

  // Instance management
  addInstance(key, config) {
    this.instances[key] = {
      ...config,
      connections: []
    }
    
    console.log('Added instance:', key, this.instances)
    
    // Hide empty state
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.add('hidden')
    }
    
    // Create visual node
    this.createInstanceNode(key, config)
    
    // Update YAML
    this.updateYamlPreview()
  }

  createInstanceNode(key, config) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('data-instance-key', key)
    g.setAttribute('transform', `translate(${config.x}, ${config.y})`)
    g.classList.add('cursor-pointer')
    
    // Background rectangle
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', '-75')
    rect.setAttribute('y', '-35')
    rect.setAttribute('width', '150')
    rect.setAttribute('height', '70')
    rect.setAttribute('rx', '8')
    rect.setAttribute('fill', 'white')
    rect.setAttribute('stroke', '#d1d5db')
    rect.setAttribute('stroke-width', '2')
    rect.classList.add('hover:stroke-orange-500', 'dark:fill-gray-800', 'dark:stroke-gray-600')
    
    // Instance name
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('y', '-5')
    text.setAttribute('font-size', '14')
    text.setAttribute('font-weight', '600')
    text.classList.add('fill-gray-900', 'dark:fill-gray-100')
    text.textContent = key
    
    // Model badge
    const modelText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    modelText.setAttribute('text-anchor', 'middle')
    modelText.setAttribute('y', '15')
    modelText.setAttribute('font-size', '12')
    modelText.classList.add('fill-gray-500', 'dark:fill-gray-400')
    modelText.textContent = config.model || 'sonnet'
    
    // Connection port (circle)
    const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    port.setAttribute('cx', '75')
    port.setAttribute('cy', '0')
    port.setAttribute('r', '8')
    port.setAttribute('fill', '#f97316')
    port.setAttribute('stroke', 'white')
    port.setAttribute('stroke-width', '2')
    port.setAttribute('cursor', 'pointer')
    port.setAttribute('data-port', 'true')
    port.setAttribute('data-instance-key', key)
    
    // Add hover effect manually
    port.addEventListener('mouseenter', () => {
      port.setAttribute('r', '10')
      port.setAttribute('fill', '#ea580c')
    })
    port.addEventListener('mouseleave', () => {
      port.setAttribute('r', '8')
      port.setAttribute('fill', '#f97316')
    })
    
    // Assemble
    g.appendChild(rect)
    g.appendChild(text)
    g.appendChild(modelText)
    g.appendChild(port)
    
    // Add event listeners
    g.addEventListener('click', (e) => this.handleInstanceClick(e, key))
    g.addEventListener('mousedown', (e) => this.startDrag(e, key))
    
    // Add to canvas
    const instancesLayer = this.canvasTarget.querySelector('#instances-layer')
    instancesLayer.appendChild(g)
  }

  handleInstanceClick(event, key) {
    event.stopPropagation()
    
    // Check if clicking on connection port
    if (event.target.dataset.port) {
      this.handlePortClick(key)
    } else if (!this.isDragging) {
      // Select instance
      this.selectInstance(key)
    }
  }

  handlePortClick(key) {
    console.log('Port clicked:', key)
    if (!this.connectionMode) {
      // Start connection mode
      this.connectionMode = true
      this.connectionStart = key
      
      // Visual feedback
      this.highlightAvailableTargets(key)
    } else {
      // Complete connection
      if (this.connectionStart !== key && !this.wouldCreateCycle(this.connectionStart, key)) {
        this.createConnection(this.connectionStart, key)
      }
      
      // Exit connection mode
      this.connectionMode = false
      this.connectionStart = null
      this.unhighlightTargets()
    }
  }

  highlightAvailableTargets(excludeKey) {
    // Add a visual indicator that we're in connection mode
    this.canvasTarget.style.cursor = 'crosshair'
    
    // Highlight the source port
    this.canvasTarget.querySelector(`[data-instance-key="${excludeKey}"] circle`).setAttribute('fill', '#dc2626')
    
    // Highlight available targets
    this.canvasTarget.querySelectorAll('[data-instance-key]').forEach(node => {
      const key = node.dataset.instanceKey
      if (key !== excludeKey) {
        const circle = node.querySelector('circle')
        circle.setAttribute('stroke-width', '4')
        circle.setAttribute('stroke', '#22c55e')
      }
    })
  }

  unhighlightTargets() {
    // Reset cursor
    this.canvasTarget.style.cursor = 'auto'
    
    // Reset all circles
    this.canvasTarget.querySelectorAll('[data-port="true"]').forEach(circle => {
      circle.setAttribute('fill', '#f97316')
      circle.setAttribute('stroke', 'white')
      circle.setAttribute('stroke-width', '2')
    })
  }

  createConnection(fromKey, toKey) {
    // Add to connections data
    if (!this.connections[fromKey]) {
      this.connections[fromKey] = []
    }
    if (!this.connections[fromKey].includes(toKey)) {
      this.connections[fromKey].push(toKey)
    }
    
    console.log('Created connection:', fromKey, '->', toKey, this.connections)
    
    // Draw visual connection
    this.drawConnection(fromKey, toKey)
    
    // Update YAML
    this.updateYamlPreview()
  }

  drawConnection(fromKey, toKey) {
    const fromNode = this.canvasTarget.querySelector(`[data-instance-key="${fromKey}"]`)
    const toNode = this.canvasTarget.querySelector(`[data-instance-key="${toKey}"]`)
    
    if (!fromNode || !toNode) return
    
    const fromTransform = fromNode.getAttribute('transform')
    const toTransform = toNode.getAttribute('transform')
    
    const fromMatch = fromTransform.match(/translate\(([^,]+),\s*([^)]+)\)/)
    const toMatch = toTransform.match(/translate\(([^,]+),\s*([^)]+)\)/)
    
    const x1 = parseFloat(fromMatch[1]) + 75 // Port is at x=75
    const y1 = parseFloat(fromMatch[2])
    const x2 = parseFloat(toMatch[1]) - 75
    const y2 = parseFloat(toMatch[2])
    
    // Create curved path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const d = `M ${x1} ${y1} C ${x1 + 100} ${y1}, ${x2 - 100} ${y2}, ${x2} ${y2}`
    path.setAttribute('d', d)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', '#f97316')
    path.setAttribute('stroke-width', '2')
    path.setAttribute('marker-end', 'url(#arrow)')
    path.setAttribute('data-connection', `${fromKey}-${toKey}`)
    path.classList.add('hover:stroke-orange-600')
    
    const connectionsLayer = this.canvasTarget.querySelector('#connections-layer')
    connectionsLayer.appendChild(path)
  }

  selectInstance(key) {
    this.selectedInstance = key
    
    // Update visual selection
    this.canvasTarget.querySelectorAll('[data-instance-key]').forEach(node => {
      const rect = node.querySelector('rect')
      if (node.dataset.instanceKey === key) {
        rect.setAttribute('stroke', '#f97316')
        rect.setAttribute('stroke-width', '3')
      } else {
        rect.setAttribute('stroke', '#d1d5db')
        rect.setAttribute('stroke-width', '2')
      }
    })
    
    // Show properties
    this.showProperties(key)
  }

  showProperties(key) {
    const instance = this.instances[key]
    if (!instance) return
    
    this.propertiesPanelTarget.innerHTML = `
      <div class="p-4 space-y-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Instance: ${key}</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <input type="text" 
                   value="${instance.description || ''}" 
                   data-property="description"
                   data-key="${key}"
                   class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
            <input type="text" 
                   value="${instance.model || 'sonnet'}" 
                   data-property="model"
                   data-key="${key}"
                   class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            <select data-property="provider" 
                    data-key="${key}"
                    class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
              <option value="claude" ${instance.provider === 'claude' ? 'selected' : ''}>Claude</option>
              <option value="openai" ${instance.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Directory</label>
            <input type="text" 
                   value="${instance.directory || '.'}" 
                   data-property="directory"
                   data-key="${key}"
                   class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Connections</label>
            <div class="mt-1 flex flex-wrap gap-2">
              ${(this.connections[key] || []).map(target => `
                <span class="inline-flex items-center px-2 py-1 rounded-md text-xs bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200">
                  ${target}
                  <button type="button" 
                          data-action="click->swarm-visual-builder#removeConnection"
                          data-from="${key}"
                          data-to="${target}"
                          class="ml-1 hover:text-red-600">×</button>
                </span>
              `).join('')}
            </div>
          </div>
          
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button"
                    data-action="click->swarm-visual-builder#deleteInstance"
                    data-key="${key}"
                    class="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
              Delete Instance
            </button>
          </div>
        </div>
      </div>
    `
    
    // Add change listeners
    this.propertiesPanelTarget.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('change', this.updateProperty.bind(this))
    })
  }

  updateProperty(event) {
    const key = event.target.dataset.key
    const property = event.target.dataset.property
    const value = event.target.value
    
    this.instances[key][property] = value
    
    // Update visual if needed
    if (property === 'model') {
      const node = this.canvasTarget.querySelector(`[data-instance-key="${key}"]`)
      const modelText = node.querySelectorAll('text')[1]
      modelText.textContent = value
    }
    
    this.updateYamlPreview()
  }

  removeConnection(event) {
    const from = event.currentTarget.dataset.from
    const to = event.currentTarget.dataset.to
    
    const index = this.connections[from].indexOf(to)
    if (index > -1) {
      this.connections[from].splice(index, 1)
    }
    
    // Remove visual connection
    const path = this.canvasTarget.querySelector(`[data-connection="${from}-${to}"]`)
    if (path) path.remove()
    
    // Refresh properties
    this.showProperties(from)
    this.updateYamlPreview()
  }

  deleteInstance(event) {
    const key = event.currentTarget.dataset.key
    
    // Remove from data
    delete this.instances[key]
    delete this.connections[key]
    
    // Remove connections to this instance
    Object.keys(this.connections).forEach(fromKey => {
      const index = this.connections[fromKey].indexOf(key)
      if (index > -1) {
        this.connections[fromKey].splice(index, 1)
      }
    })
    
    // Remove visual elements
    const node = this.canvasTarget.querySelector(`[data-instance-key="${key}"]`)
    if (node) node.remove()
    
    this.canvasTarget.querySelectorAll(`[data-connection*="${key}"]`).forEach(path => path.remove())
    
    // Clear properties
    this.propertiesPanelTarget.innerHTML = '<div class="p-4 text-center text-gray-500">Select an instance to edit properties</div>'
    
    // Show empty state if needed
    if (Object.keys(this.instances).length === 0 && this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.remove('hidden')
    }
    
    this.updateYamlPreview()
  }

  // Canvas interactions
  handleCanvasClick(event) {
    if (event.target.tagName === 'svg' || event.target.tagName === 'rect' && event.target.getAttribute('fill') === 'url(#grid)') {
      // Clicked on empty space - deselect
      this.selectedInstanceValue = null
      this.canvasTarget.querySelectorAll('rect').forEach(rect => {
        rect.setAttribute('stroke', '#d1d5db')
        rect.setAttribute('stroke-width', '2')
      })
      this.propertiesPanelTarget.innerHTML = '<div class="p-4 text-center text-gray-500">Select an instance to edit properties</div>'
      
      // Exit connection mode if active
      if (this.connectionMode) {
        this.connectionMode = false
        this.connectionStart = null
        this.unhighlightTargets()
      }
    }
  }

  // Dragging
  startDrag(event, key) {
    if (event.target.dataset.port) return // Don't drag when clicking port
    
    const node = event.currentTarget
    const transform = node.getAttribute('transform')
    const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
    const startX = parseFloat(match[1])
    const startY = parseFloat(match[2])
    
    const startMouseX = event.clientX
    const startMouseY = event.clientY
    
    this.isDragging = true
    
    const handleMouseMove = (e) => {
      const dx = (e.clientX - startMouseX) / (this.zoom / 100)
      const dy = (e.clientY - startMouseY) / (this.zoom / 100)
      const newX = Math.round(startX + dx)
      const newY = Math.round(startY + dy)
      
      node.setAttribute('transform', `translate(${newX}, ${newY})`)
      this.instances[key].x = newX
      this.instances[key].y = newY
      
      // Update connections
      this.updateConnections(key)
    }
    
    const handleMouseUp = () => {
      this.isDragging = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      this.updateYamlPreview()
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  updateConnections(key) {
    // Redraw all connections involving this instance
    this.canvasTarget.querySelectorAll(`[data-connection*="${key}"]`).forEach(path => {
      const [from, to] = path.dataset.connection.split('-')
      path.remove()
      this.drawConnection(from, to)
    })
  }

  // Auto-layout
  autoLayout() {
    const nodes = Object.keys(this.instances)
    if (nodes.length === 0) return
    
    // Simple grid layout
    const columns = Math.ceil(Math.sqrt(nodes.length))
    const spacing = 200
    const startX = 100
    const startY = 100
    
    nodes.forEach((key, index) => {
      const col = index % columns
      const row = Math.floor(index / columns)
      const x = startX + col * spacing
      const y = startY + row * spacing
      
      this.instances[key].x = x
      this.instances[key].y = y
      
      const node = this.canvasTarget.querySelector(`[data-instance-key="${key}"]`)
      node.setAttribute('transform', `translate(${x}, ${y})`)
    })
    
    // Redraw all connections
    Object.entries(this.connections).forEach(([from, targets]) => {
      targets.forEach(to => {
        const path = this.canvasTarget.querySelector(`[data-connection="${from}-${to}"]`)
        if (path) path.remove()
        this.drawConnection(from, to)
      })
    })
    
    this.updateYamlPreview()
  }

  // Clear all
  clearAll() {
    if (!confirm('Are you sure you want to clear all instances?')) return
    
    this.instances = {}
    this.connections = {}
    this.selectedInstance = null
    
    this.canvasTarget.querySelector('#instances-layer').innerHTML = ''
    this.canvasTarget.querySelector('#connections-layer').innerHTML = ''
    this.propertiesPanelTarget.innerHTML = '<div class="p-4 text-center text-gray-500">Select an instance to edit properties</div>'
    
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.classList.remove('hidden')
    }
    
    this.updateYamlPreview()
  }

  // Zoom controls
  zoomIn() {
    this.zoom = Math.min(200, this.zoom + 25)
    this.updateZoom()
  }

  zoomOut() {
    this.zoom = Math.max(25, this.zoom - 25)
    this.updateZoom()
  }

  updateZoom() {
    const container = this.canvasTarget.querySelector('#zoom-container')
    container.setAttribute('transform', `scale(${this.zoom / 100})`)
    this.zoomLevelTarget.textContent = `${this.zoom}%`
  }

  // YAML generation
  updateYamlPreview() {
    const swarmName = this.hasNameInputTarget ? this.nameInputTarget.value : 'My Swarm'
    
    console.log('Updating YAML preview:', this.instances)
    
    const config = {
      version: 1,
      swarm: {
        name: swarmName || 'My Swarm',
        instances: {}
      }
    }
    
    // Set main instance
    const instanceKeys = Object.keys(this.instances)
    if (instanceKeys.length > 0) {
      config.swarm.main = instanceKeys[0]
    }
    
    // Build instances
    instanceKeys.forEach(key => {
      const instance = this.instances[key]
      // Always create instance config, even if empty
      const instanceConfig = {}
      
      // Always include description
      instanceConfig.description = instance.description || `${key} instance`
      
      // Include non-default values
      if (instance.provider && instance.provider !== 'claude') instanceConfig.provider = instance.provider
      if (instance.model && instance.model !== 'sonnet') instanceConfig.model = instance.model
      if (instance.directory && instance.directory !== '.') instanceConfig.directory = instance.directory
      if (instance.allowed_tools?.length > 0) instanceConfig.allowed_tools = instance.allowed_tools
      
      // Add connections
      if (this.connections[key]?.length > 0) {
        instanceConfig.connections = this.connections[key]
      }
      
      config.swarm.instances[key] = instanceConfig
    })
    
    const yaml = this.toYaml(config)
    
    if (this.hasYamlPreviewTarget) {
      this.yamlPreviewTarget.querySelector('pre').textContent = yaml
    }
  }

  toYaml(obj, indent = 0) {
    let yaml = ''
    const spaces = ' '.repeat(indent)
    
    Object.entries(obj).forEach(([key, value]) => {
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)) {
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

  // Helpers
  wouldCreateCycle(from, to) {
    // DFS to detect cycles
    const visited = new Set()
    const stack = [to]
    
    while (stack.length > 0) {
      const current = stack.pop()
      if (current === from) return true
      
      if (!visited.has(current)) {
        visited.add(current)
        const connections = this.connections[current] || []
        stack.push(...connections)
      }
    }
    
    return false
  }

  // Search instances
  filterTemplates(event) {
    const query = event.target.value.toLowerCase()
    this.element.querySelectorAll('[data-template-card]').forEach(card => {
      const name = card.dataset.templateName.toLowerCase()
      const match = name.includes(query)
      card.style.display = match ? 'block' : 'none'
    })
  }

  // Tags
  addTag(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      const tag = event.target.value.trim()
      if (tag && !this.tags.includes(tag)) {
        this.tags.push(tag)
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
      <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
        ${tag}
        <button type="button" data-action="click->swarm-visual-builder#removeTag" data-tag="${tag}" class="ml-1">×</button>
      </span>
    `).join('')
  }

  // Keyboard shortcuts
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return
      
      if (e.key === 'Delete' && this.selectedInstance) {
        this.deleteInstance({ currentTarget: { dataset: { key: this.selectedInstance } } })
      }
    })
  }

  // Save swarm
  saveSwarm() {
    const name = this.hasNameInputTarget ? this.nameInputTarget.value : 'My Swarm'
    if (!name) {
      alert('Please enter a name for your swarm')
      return
    }
    
    const configData = {
      version: 1,
      swarm: {
        name: name,
        instances: {}
      }
    }
    
    // Set main instance
    const instanceKeys = Object.keys(this.instances)
    if (instanceKeys.length > 0) {
      configData.swarm.main = instanceKeys[0]
    }
    
    // Build instances (excluding UI-specific properties)
    instanceKeys.forEach(key => {
      const instance = this.instances[key]
      const instanceConfig = {}
      
      // Always include description
      instanceConfig.description = instance.description || `${key} instance`
      
      // Include non-default values
      if (instance.provider && instance.provider !== 'claude') instanceConfig.provider = instance.provider
      if (instance.model && instance.model !== 'sonnet') instanceConfig.model = instance.model
      if (instance.directory && instance.directory !== '.') instanceConfig.directory = instance.directory
      if (instance.allowed_tools?.length > 0) instanceConfig.allowed_tools = instance.allowed_tools
      
      // Add connections
      if (this.connections[key]?.length > 0) {
        instanceConfig.connections = this.connections[key]
      }
      
      configData.swarm.instances[key] = instanceConfig
    })
    
    // Create form data
    const formData = new FormData()
    formData.append('swarm_template[name]', name)
    formData.append('swarm_template[tags]', JSON.stringify(this.tags))
    formData.append('swarm_template[config_data]', JSON.stringify(configData))
    
    // Submit
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
        alert('Failed to save swarm')
      }
    })
  }

  // Export YAML
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

  // Import YAML
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
        // Parse YAML - for now just alert
        alert('YAML import requires a YAML parser library. This is a placeholder.')
      } catch (error) {
        alert('Invalid YAML file')
      }
    }
    reader.readAsText(file)
  }
}