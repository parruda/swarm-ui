import { Controller } from "@hotwired/stimulus"

// Wait for Rete.js to be loaded globally
function waitForRete() {
  return new Promise((resolve) => {
    if (window.Rete && window.ReteAreaPlugin && window.ReteConnectionPlugin) {
      resolve()
    } else {
      setTimeout(() => waitForRete().then(resolve), 50)
    }
  })
}

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
    console.log("Swarm visual builder connected (waiting for Rete.js)")
    
    // Wait for Rete.js to load
    await waitForRete()
    
    console.log("Rete.js loaded, initializing...")
    
    this.tags = []
    this.selectedNode = null
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
    container.className = 'rete bg-gray-100 dark:bg-gray-900'
    this.canvasTarget.appendChild(container)
    
    // Create viewport
    this.viewport = document.createElement('div')
    this.viewport.style.position = 'relative'
    this.viewport.style.width = '4000px'
    this.viewport.style.height = '4000px'
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
    `
    this.viewport.appendChild(this.svg)
    
    // Initialize properties
    this.container = container
    this.zoomLevel = 1
    this.nextNodeId = 1
    
    // Setup drag and drop
    this.setupDragAndDrop()
  }
  
  setupDragAndDrop() {
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    })
    
    this.container.addEventListener('drop', async (e) => {
      e.preventDefault()
      
      const templateName = e.dataTransfer.getData('templateName')
      const templateConfig = JSON.parse(e.dataTransfer.getData('templateConfig') || '{}')
      
      if (!templateName) return
      
      // Calculate position
      const rect = this.container.getBoundingClientRect()
      const x = (e.clientX - rect.left + this.container.scrollLeft) / this.zoomLevel
      const y = (e.clientY - rect.top + this.container.scrollTop) / this.zoomLevel
      
      await this.addNodeFromTemplate(templateName, templateConfig, { x, y })
    })
  }
  
  async addNodeFromTemplate(name, config, position) {
    console.log('Adding node from template:', name, config, position)
    
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
    
    // Create node data
    const nodeId = this.nextNodeId++
    const nodeData = {
      id: nodeId,
      key: nodeKey,
      label: nodeKey,
      x: position.x - 100,
      y: position.y - 60,
      description: config.description || name,
      model: config.model || "sonnet",
      provider: config.provider || "claude",
      directory: config.directory || ".",
      allowed_tools: config.allowed_tools || []
    }
    
    // Create node element
    const nodeElement = this.createNodeElement(nodeData)
    this.viewport.appendChild(nodeElement)
    
    // Store node
    this.nodes.set(nodeId, {
      data: nodeData,
      element: nodeElement
    })
    this.nodeKeyMap.set(nodeId, nodeKey)
    
    // Set first node as main
    if (this.nodes.size === 1) {
      this.mainNodeId = nodeId
    }
    
    this.updateYamlPreview()
  }
  
  createNodeElement(nodeData) {
    const node = document.createElement('div')
    node.className = 'absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg border-2 border-gray-300 dark:border-gray-600 p-4 cursor-move select-none hover:shadow-xl transition-shadow swarm-node'
    node.style.left = nodeData.x + 'px'
    node.style.top = nodeData.y + 'px'
    node.style.width = '200px'
    node.dataset.nodeId = nodeData.id
    
    node.innerHTML = `
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
      <div class="socket input" data-socket="in" data-node-id="${nodeData.id}"></div>
      <div class="socket output" data-socket="out" data-node-id="${nodeData.id}"></div>
    `
    
    // Add event handlers
    this.makeDraggable(node, nodeData)
    node.addEventListener('click', () => this.selectNode(nodeData.id))
    
    // Socket handlers
    const inputSocket = node.querySelector('.socket.input')
    const outputSocket = node.querySelector('.socket.output')
    
    inputSocket.addEventListener('click', (e) => {
      e.stopPropagation()
      this.handleSocketClick(nodeData.id, 'input')
    })
    
    outputSocket.addEventListener('click', (e) => {
      e.stopPropagation()
      this.handleSocketClick(nodeData.id, 'output')
    })
    
    return node
  }
  
  makeDraggable(element, nodeData) {
    let isDragging = false
    let startX = 0
    let startY = 0
    let offsetX = 0
    let offsetY = 0
    
    element.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('socket')) return
      
      isDragging = true
      startX = e.clientX
      startY = e.clientY
      offsetX = nodeData.x
      offsetY = nodeData.y
      element.style.zIndex = 1000
    })
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return
      
      const dx = (e.clientX - startX) / this.zoomLevel
      const dy = (e.clientY - startY) / this.zoomLevel
      
      nodeData.x = offsetX + dx
      nodeData.y = offsetY + dy
      
      element.style.left = nodeData.x + 'px'
      element.style.top = nodeData.y + 'px'
      
      this.updateConnections()
    })
    
    document.addEventListener('mouseup', () => {
      isDragging = false
      element.style.zIndex = ''
    })
  }
  
  handleSocketClick(nodeId, socketType) {
    if (!this.pendingConnection) {
      // Start new connection
      this.pendingConnection = { nodeId, socketType }
      this.viewport.classList.add('cursor-crosshair')
    } else {
      // Complete connection
      const { nodeId: fromId, socketType: fromType } = this.pendingConnection
      
      if (fromId !== nodeId && fromType !== socketType) {
        if (fromType === 'output' && socketType === 'input') {
          this.createConnection(fromId, nodeId)
        } else if (fromType === 'input' && socketType === 'output') {
          this.createConnection(nodeId, fromId)
        }
      }
      
      this.pendingConnection = null
      this.viewport.classList.remove('cursor-crosshair')
    }
  }
  
  createConnection(fromId, toId) {
    // Check if connection already exists
    const exists = this.connections.some(c => c.from === fromId && c.to === toId)
    if (!exists) {
      this.connections.push({ from: fromId, to: toId })
      this.updateConnections()
      this.updateYamlPreview()
    }
  }
  
  updateConnections() {
    const connectionsGroup = this.svg.querySelector('#connections')
    connectionsGroup.innerHTML = ''
    
    this.connections.forEach((conn, index) => {
      const fromNode = this.nodes.get(conn.from)
      const toNode = this.nodes.get(conn.to)
      
      if (fromNode && toNode) {
        const x1 = fromNode.data.x + 200
        const y1 = fromNode.data.y + 40
        const x2 = toNode.data.x
        const y2 = toNode.data.y + 40
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
        const cx = (x1 + x2) / 2
        const d = `M ${x1} ${y1} Q ${cx} ${y1}, ${cx} ${(y1+y2)/2} T ${x2} ${y2}`
        
        path.setAttribute('d', d)
        path.setAttribute('stroke', '#f97316')
        path.setAttribute('stroke-width', '2')
        path.setAttribute('fill', 'none')
        path.setAttribute('marker-end', 'url(#arrow)')
        path.style.pointerEvents = 'stroke'
        path.style.cursor = 'pointer'
        
        path.addEventListener('click', () => {
          if (confirm('Remove this connection?')) {
            this.connections.splice(index, 1)
            this.updateConnections()
            this.updateYamlPreview()
          }
        })
        
        connectionsGroup.appendChild(path)
      }
    })
  }
  
  selectNode(nodeId) {
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
    this.propertiesPanelTarget.innerHTML = `
      <div class="p-4 space-y-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Instance: ${nodeData.label}</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <input type="text" 
                   value="${nodeData.description || ''}" 
                   data-property="description"
                   data-node-id="${nodeData.id}"
                   class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
            <input type="text" 
                   value="${nodeData.model || 'sonnet'}" 
                   data-property="model"
                   data-node-id="${nodeData.id}"
                   class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            <select data-property="provider" 
                    data-node-id="${nodeData.id}"
                    class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
              <option value="claude" ${nodeData.provider === 'claude' ? 'selected' : ''}>Claude</option>
              <option value="openai" ${nodeData.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Directory</label>
            <input type="text" 
                   value="${nodeData.directory || '.'}" 
                   data-property="directory"
                   data-node-id="${nodeData.id}"
                   class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              <input type="checkbox" 
                     ${this.mainNodeId === nodeData.id ? 'checked' : ''}
                     data-action="change->swarm-visual-builder#setMainNode"
                     data-node-id="${nodeData.id}"
                     class="mr-2">
              Main Instance
            </label>
          </div>
          
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button"
                    data-action="click->swarm-visual-builder#deleteNode"
                    data-node-id="${nodeData.id}"
                    class="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
              Delete Instance
            </button>
          </div>
        </div>
      </div>
    `
    
    // Add change listeners
    this.propertiesPanelTarget.querySelectorAll('input:not([type="checkbox"]), select').forEach(input => {
      input.addEventListener('change', (e) => this.updateNodeProperty(e))
    })
  }
  
  updateNodeProperty(event) {
    const nodeId = parseInt(event.target.dataset.nodeId)
    const property = event.target.dataset.property
    const value = event.target.value
    
    const node = this.nodes.get(nodeId)
    if (node) {
      node.data[property] = value
      
      // Update visual if needed
      if (property === 'model') {
        const badge = node.element.querySelector('.node-tag.model-tag')
        if (badge) badge.textContent = value
      }
      
      this.updateYamlPreview()
    }
  }
  
  setMainNode(event) {
    const nodeId = parseInt(event.target.dataset.nodeId)
    if (event.target.checked) {
      this.mainNodeId = nodeId
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
    this.viewport.style.transformOrigin = 'top left'
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
      
      if (e.key === 'Delete' && this.selectedNode) {
        this.deleteNode({ currentTarget: { dataset: { nodeId: this.selectedNode.data.id } } })
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