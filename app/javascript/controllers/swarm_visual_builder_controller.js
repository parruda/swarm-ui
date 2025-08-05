import { Controller } from "@hotwired/stimulus"
import jsyaml from "js-yaml"
import NodeManager from "swarm_visual_builder/node_manager"
import ConnectionManager from "swarm_visual_builder/connection_manager"
import PathRenderer from "swarm_visual_builder/path_renderer"
import LayoutManager from "swarm_visual_builder/layout_manager"
import ChatIntegration from "swarm_visual_builder/chat_integration"
import FileOperations from "swarm_visual_builder/file_operations"
import UIComponents from "swarm_visual_builder/ui_components"
import TemplateManager from "swarm_visual_builder/template_manager"
import MCPManager from "swarm_visual_builder/mcp_manager"
import YamlProcessor from "swarm_visual_builder/yaml_processor"

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
    // Initialize core managers
    this.nodeManager = new NodeManager(this)
    this.connectionManager = new ConnectionManager(this)
    this.pathRenderer = new PathRenderer(this)
    this.layoutManager = new LayoutManager(this)
    
    // Initialize feature modules
    this.chatIntegration = new ChatIntegration(this)
    this.fileOperations = new FileOperations(this)
    this.uiComponents = new UIComponents(this)
    this.templateManager = new TemplateManager(this)
    this.mcpManager = new MCPManager(this)
    this.yamlProcessor = new YamlProcessor(this)
    
    // Initialize state
    this.tags = []
    this.selectedNodes = []
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
    
    // Load existing data if editing
    if ((this.swarmIdValue && this.existingDataValue) || this.existingYamlValue || this.isFileEditValue) {
      requestAnimationFrame(() => {
        this.loadExistingSwarm()
      })
    }
    
    // Listen for canvas refresh events from Claude chat
    window.addEventListener('canvas:refresh', this.yamlProcessor.handleCanvasRefresh.bind(this.yamlProcessor))
    
    // Listen for sidebar expansion request
    this.handleSidebarExpand = this.uiComponents.expandSidebarToMax.bind(this.uiComponents)
    window.addEventListener('sidebar:expandToMax', this.handleSidebarExpand)
    
    // Listen for chat clear selection request
    this.handleClearSelection = () => this.deselectAll()
    window.addEventListener('chat:clearNodeSelection', this.handleClearSelection)
  }
  
  disconnect() {
    // Clean up event listeners
    window.removeEventListener('canvas:refresh', this.yamlProcessor.handleCanvasRefresh)
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
    this.uiComponents.updateEmptyState()
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
    
    // Initialize MCP drag and drop
    this.mcpManager.initializeMcpDragAndDrop()
    
    this.viewport.addEventListener('dragover', (e) => {
      e.preventDefault()
      this.mcpManager.handleMcpDragOver(e)
    })
    
    // Add dragend listener to clean up
    document.addEventListener('dragend', (e) => {
      if (this.isDraggingMcp) {
        this.mcpManager.cleanupMcpDrag()
      }
    })
    
    this.viewport.addEventListener('drop', (e) => {
      e.preventDefault()
      
      const dragType = e.dataTransfer.getData('type')
      
      if (dragType === 'template') {
        const templateData = JSON.parse(e.dataTransfer.getData('template'))
        if (templateData) {
          const viewportRect = this.viewport.getBoundingClientRect()
          const mouseX = e.clientX - viewportRect.left
          const mouseY = e.clientY - viewportRect.top
          const viewportX = mouseX / this.zoomLevel
          const viewportY = mouseY / this.zoomLevel
          const nodeWidth = 250
          const nodeHeight = 120
          const x = viewportX - this.canvasCenter - (nodeWidth / 2)
          const y = viewportY - this.canvasCenter - (nodeHeight / 2)
          
          this.addNode(templateData, x, y)
        }
      } else if (dragType === 'mcp') {
        const mcpData = JSON.parse(e.dataTransfer.getData('mcp'))
        if (mcpData) {
          const element = document.elementFromPoint(e.clientX, e.clientY)
          const nodeEl = element?.closest('.swarm-node')
          
          if (nodeEl) {
            const nodeId = parseInt(nodeEl.dataset.nodeId)
            this.mcpManager.addMcpToNode(nodeId, mcpData)
          }
        }
        
        this.mcpManager.cleanupMcpDrag()
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
  }
  
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && !this.shiftPressed) {
        this.shiftPressed = true
        this.viewport.classList.add('shift-pressed')
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only handle deletion if no input field is focused
        const activeElement = document.activeElement
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.contentEditable === 'true'
        )
        
        if (!isInputFocused) {
          if (this.selectedNode) {
            this.deleteSelectedNode()
          } else if (this.selectedConnection !== null) {
            this.deleteSelectedConnection()
          }
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
        this.toggleNodeSelection(nodeId)
      } else {
        if (this.selectedNodes.length > 1 && this.isNodeSelected(nodeId)) {
          this.startMultiNodeDrag(e)
        } else {
          this.selectNode(nodeId)
          this.startNodeDrag(e)
        }
      }
    } else if (e.target === this.viewport || e.target === this.svg) {
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
    this.uiComponents.updateEmptyState()
    this.updateYamlPreview()
  }
  
  renderNode(node) {
    const nodeElement = this.createNodeElement(node)
    nodeElement.style.left = `${node.data.x + this.canvasCenter}px`
    nodeElement.style.top = `${node.data.y + this.canvasCenter}px`
    this.viewport.appendChild(nodeElement)
    
    node.element = nodeElement
    
    if (!this.mainNodeId && node.data.provider !== 'openai') {
      this.setMainNode(node.id)
    }
  }
  
  createNodeElement(node) {
    const nodeEl = document.createElement('div')
    nodeEl.className = 'swarm-node absolute'
    nodeEl.dataset.nodeId = node.id
    nodeEl.style.width = '250px'
    
    const mcpCount = node.data.mcps?.length || 0
    
    const content = `
      ${node.id === this.mainNodeId ? '<div class="absolute top-1 right-1 z-10"><span class="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded">Main</span></div>' : ''}
      <div class="node-header mb-2">
        <h3 class="node-title">
          <span>${node.data.name}</span>
        </h3>
        ${node.data.description ? `<p class="node-description">${node.data.description}</p>` : ''}
      </div>
      <div class="node-tags">
        ${node.data.model ? `<span class="node-tag model-tag">${node.data.model}</span>` : ''}
        ${node.data.provider ? `<span class="node-tag provider-tag">${node.data.provider}</span>` : ''}
        ${mcpCount > 0 ? `<span class="node-tag bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300" title="${mcpCount} MCP server${mcpCount > 1 ? 's' : ''}">MCP: ${mcpCount}</span>` : ''}
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
    
    nodeEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('socket')) {
        e.stopPropagation()
      }
    })
    
    nodeEl.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      if (!this.connectionManager.hasIncomingConnections(node.id) && node.data.provider !== 'openai') {
        this.setMainNode(node.id)
      }
    })
    
    return nodeEl
  }
  
  selectNode(nodeId) {
    if (!this.shiftPressed) {
      this.deselectAll()
    }
    
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    if (!this.selectedNodes.find(n => n.id === nodeId)) {
      this.selectedNodes.push(node)
      node.element.classList.add('selected')
    }
    
    this.selectedNode = node
    
    if (this.selectedNodes.length === 1) {
      this.showNodeProperties(node)
    } else {
      this.uiComponents.showMultiSelectMessage()
    }
    
    this.chatIntegration.notifySelectionChange()
  }
  
  toggleNodeSelection(nodeId) {
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    const index = this.selectedNodes.findIndex(n => n.id === nodeId)
    
    if (index > -1) {
      this.selectedNodes.splice(index, 1)
      node.element.classList.remove('selected')
      this.selectedNode = this.selectedNodes[this.selectedNodes.length - 1] || null
    } else {
      this.selectedNodes.push(node)
      node.element.classList.add('selected')
      this.selectedNode = node
    }
    
    if (this.selectedNodes.length === 0) {
      this.uiComponents.clearPropertiesPanel()
    } else if (this.selectedNodes.length === 1) {
      this.showNodeProperties(this.selectedNodes[0])
    } else {
      this.uiComponents.showMultiSelectMessage()
    }
    
    this.chatIntegration.notifySelectionChange()
  }
  
  isNodeSelected(nodeId) {
    return this.selectedNodes.some(n => n.id === nodeId)
  }
  
  deselectAll() {
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
    
    this.uiComponents.clearPropertiesPanel()
    this.chatIntegration.notifySelectionChange()
  }
  
  showNodeProperties(node) {
    const nodeData = node.data
    const isOpenAI = nodeData.provider === 'openai'
    const isClaude = !isOpenAI
    
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
        if (!node.data.config) node.data.config = {}
        node.data.config[property] = e.target.value
        
        this.updateNodeTags(node)
        
        if (property === 'provider') {
          const tempField = this.propertiesPanelTarget.querySelector('#temperature-field')
          const toolsField = this.propertiesPanelTarget.querySelector('#tools-field')
          
          if (tempField) tempField.style.display = e.target.value === 'openai' ? 'block' : 'none'
          if (toolsField) toolsField.style.display = e.target.value === 'openai' || node.data.vibe || node.data.config?.vibe ? 'none' : 'block'
          
          if (e.target.value === 'openai' && this.mainNodeId === node.id) {
            if (node.element) {
              node.element.classList.remove('main-node')
              const badge = node.element.querySelector('.bg-orange-500')
              if (badge) badge.remove()
            }
            this.mainNodeId = null
            
            const eligibleNode = this.nodeManager.getNodes().find(n => 
              n.id !== node.id && 
              n.data.provider !== 'openai' && 
              !this.connectionManager.hasIncomingConnections(n.id)
            )
            if (eligibleNode) {
              this.setMainNode(eligibleNode.id)
            }
          }
          
          this.showNodeProperties(node)
        }
      } else if (property === 'directory' || property === 'temperature' || property === 'vibe') {
        if (!node.data.config) node.data.config = {}
        
        if (property === 'vibe') {
          node.data[property] = e.target.checked
          node.data.config[property] = e.target.checked
          const toolsField = this.propertiesPanelTarget.querySelector('#tools-field')
          if (toolsField) {
            toolsField.style.display = e.target.checked || node.data.provider === 'openai' ? 'none' : 'block'
          }
        } else {
          node.data[property] = e.target.value
          node.data.config[property] = e.target.value
        }
      } else if (property === 'system_prompt') {
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
  
  updateAllowedTools(e) {
    const nodeId = parseInt(e.currentTarget.dataset.nodeId)
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
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
    this.updateSocketStates()
    this.updateYamlPreview()
    
    const node = this.nodeManager.findNode(nodeId)
    if (node && this.selectedNode?.id === nodeId) {
      this.showNodeProperties(node)
    }
  }
  
  setMainNode(nodeId) {
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    if (node.data.provider === 'openai') {
      console.warn('OpenAI instances cannot be set as main')
      return
    }
    
    if (this.mainNodeId) {
      const prevMainNode = this.nodeManager.findNode(this.mainNodeId)
      if (prevMainNode?.element) {
        prevMainNode.element.classList.remove('main-node')
        const badge = prevMainNode.element.querySelector('.bg-orange-500')
        if (badge) badge.remove()
      }
    }
    
    this.mainNodeId = nodeId
    if (node.element) {
      node.element.classList.add('main-node')
      if (!node.element.querySelector('.bg-orange-500')) {
        node.element.insertAdjacentHTML('afterbegin', '<div class="absolute top-1 right-1 z-10"><span class="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded">Main</span></div>')
      }
    }
    
    this.updateYamlPreview()
  }
  
  deleteNode(e) {
    const nodeId = parseInt(e.target.dataset.nodeId)
    this.deleteNodeById(nodeId)
  }
  
  deleteSelectedNode() {
    if (this.selectedNodes.length > 0) {
      const nodeIds = this.selectedNodes.map(n => n.id)
      nodeIds.forEach(id => this.deleteNodeById(id))
    } else if (this.selectedNode) {
      this.deleteNodeById(this.selectedNode.id)
    }
  }
  
  deleteNodeById(nodeId) {
    const node = this.nodeManager.findNode(nodeId)
    if (!node) return
    
    this.connectionManager.clearNodeConnections(nodeId)
    node.element?.remove()
    this.nodeManager.removeNode(nodeId)
    this.updateSocketStates()
    
    if (this.selectedNode?.id === nodeId) {
      this.selectedNode = null
      this.uiComponents.clearPropertiesPanel()
    }
    
    if (this.mainNodeId === nodeId) {
      this.mainNodeId = this.nodeManager.getNodes()[0]?.id || null
      if (this.mainNodeId) {
        this.setMainNode(this.mainNodeId)
      }
    }
    
    this.updateConnections()
    this.uiComponents.updateEmptyState()
    this.updateYamlPreview()
  }
  
  deleteSelectedConnection() {
    if (this.selectedConnection !== null) {
      this.connectionManager.removeConnection(this.selectedConnection)
      this.selectedConnection = null
      this.updateConnections()
      this.updateSocketStates()
      this.updateYamlPreview()
    }
  }
  
  // Connection operations
  startConnection(e) {
    e.stopPropagation()
    const socket = e.target
    const nodeId = parseInt(socket.dataset.nodeId)
    const side = socket.dataset.socketSide
    
    if (socket.classList.contains('used-as-destination')) {
      return
    }
    
    this.pendingConnection = { nodeId, side }
    socket.classList.add('connecting')
    this.viewport.classList.add('cursor-crosshair')
    
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
    
    const element = document.elementFromPoint(e.clientX, e.clientY)
    this.highlightPotentialTarget(element)
  }
  
  endConnection(e) {
    if (!this.pendingConnection) return
    
    const element = document.elementFromPoint(e.clientX, e.clientY)
    
    if (element && element.classList.contains('socket')) {
      const targetNodeId = parseInt(element.dataset.nodeId)
      const targetSide = element.dataset.socketSide
      
      if (targetNodeId !== this.pendingConnection.nodeId && 
          targetNodeId !== this.mainNodeId) {
        
        const isDuplicate = this.connectionManager.getConnections().some(conn => 
          conn.from === this.pendingConnection.nodeId && 
          conn.to === targetNodeId
        )
        
        if (!isDuplicate) {
          const fromNode = this.nodeManager.findNode(this.pendingConnection.nodeId)
          const toNode = this.nodeManager.findNode(targetNodeId)
          
          if (fromNode && toNode) {
            this.connectionManager.createConnection(
              this.pendingConnection.nodeId, 
              this.pendingConnection.side,
              targetNodeId, 
              targetSide
            )
            
            this.updateConnections()
            this.updateSocketStates()
            this.updateYamlPreview()
          }
        }
      }
    } else {
      const targetNode = element?.closest('.swarm-node')
      if (targetNode) {
        const targetNodeId = parseInt(targetNode.dataset.nodeId)
        const fromId = this.pendingConnection.nodeId
        const fromSide = this.pendingConnection.side
        
        if (targetNodeId !== fromId && targetNodeId !== this.mainNodeId) {
          const fromNode = this.nodeManager.findNode(fromId)
          const toNode = this.nodeManager.findNode(targetNodeId)
          
          if (fromNode && toNode) {
            const { toSide } = this.connectionManager.findBestSocketPairForDrag(fromNode, toNode, fromSide)
            
            const isDuplicate = this.connectionManager.getConnections().some(conn => 
              conn.from === fromId && 
              conn.to === targetNodeId
            )
            
            if (!isDuplicate) {
              const targetSocket = targetNode.querySelector(`.socket[data-socket-side="${toSide}"]`)
              if (targetSocket) {
                this.connectionManager.createConnection(fromId, fromSide, targetNodeId, toSide)
                this.updateConnections()
                this.updateSocketStates()
                this.updateYamlPreview()
              }
            }
          }
        }
      }
    }
    
    const dragPath = this.svg.querySelector('#dragPath')
    dragPath.style.display = 'none'
    
    this.viewport.querySelectorAll('.socket.connecting').forEach(s => s.classList.remove('connecting'))
    this.viewport.querySelectorAll('.swarm-node.connection-target').forEach(n => n.classList.remove('connection-target'))
    
    this.pendingConnection = null
    this.viewport.classList.remove('cursor-crosshair')
  }
  
  highlightPotentialTarget(element) {
    this.viewport.querySelectorAll('.swarm-node.connection-target').forEach(n => n.classList.remove('connection-target'))
    
    if (!element || !this.pendingConnection) return
    
    const targetNode = element.closest('.swarm-node')
    const targetNodeId = targetNode ? parseInt(targetNode.dataset.nodeId) : null
    
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
    
    this.svg.querySelectorAll('.connection').forEach((path, index) => {
      path.addEventListener('click', (e) => {
        e.stopPropagation()
        this.selectConnection(index)
      })
    })
  }
  
  updateSocketStates() {
    this.viewport.querySelectorAll('.socket.used-as-destination').forEach(socket => {
      socket.classList.remove('used-as-destination')
    })
    
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
    
    this.draggedNode = node
    this.draggedNodes = [node]
    
    this.dragStartMouseX = e.clientX
    this.dragStartMouseY = e.clientY
    this.dragStartNodeX = node.data.x
    this.dragStartNodeY = node.data.y
    this.dragStartScrollLeft = this.container.scrollLeft
    this.dragStartScrollTop = this.container.scrollTop
    
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
    
    this.draggedNodes = [...this.selectedNodes]
    this.draggedNode = this.draggedNodes[0]
    
    this.dragStartMouseX = e.clientX
    this.dragStartMouseY = e.clientY
    this.dragStartScrollLeft = this.container.scrollLeft
    this.dragStartScrollTop = this.container.scrollTop
    
    this.dragStartPositions = new Map()
    this.draggedNodes.forEach(node => {
      this.dragStartPositions.set(node.id, {
        x: node.data.x,
        y: node.data.y
      })
      node.element.style.zIndex = '1000'
      node.element.style.cursor = 'grabbing'
    })
    
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
    
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => this.updateNodePosition())
    }
  }
  
  updateNodePosition() {
    if (!this.draggedNodes || this.draggedNodes.length === 0) return
    
    const deltaMouseX = this.lastMouseX - this.dragStartMouseX
    const deltaMouseY = this.lastMouseY - this.dragStartMouseY
    
    const deltaScrollX = this.container.scrollLeft - this.dragStartScrollLeft
    const deltaScrollY = this.container.scrollTop - this.dragStartScrollTop
    
    const deltaX = (deltaMouseX + deltaScrollX) / this.zoomLevel
    const deltaY = (deltaMouseY + deltaScrollY) / this.zoomLevel
    
    this.draggedNodes.forEach(node => {
      let startX, startY
      
      if (this.dragStartPositions && this.dragStartPositions.has(node.id)) {
        const startPos = this.dragStartPositions.get(node.id)
        startX = startPos.x
        startY = startPos.y
      } else {
        startX = this.dragStartNodeX
        startY = this.dragStartNodeY
      }
      
      const x = startX + deltaX
      const y = startY + deltaY
      
      this.nodeManager.updateNodePosition(node.id, x, y)
      
      node.element.style.left = `${x + this.canvasCenter}px`
      node.element.style.top = `${y + this.canvasCenter}px`
    })
    
    this.updateConnections()
    
    const containerRect = this.container.getBoundingClientRect()
    const edgeSize = 80
    const maxScrollSpeed = 25
    
    const distanceFromLeft = this.lastMouseX - containerRect.left
    const distanceFromRight = containerRect.right - this.lastMouseX
    const distanceFromTop = this.lastMouseY - containerRect.top
    const distanceFromBottom = containerRect.bottom - this.lastMouseY
    
    let scrollX = 0
    let scrollY = 0
    
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
    
    this.animationFrameId = requestAnimationFrame(() => this.updateNodePosition())
  }
  
  endNodeDrag() {
    if (!this.draggedNodes || this.draggedNodes.length === 0) return
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    
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
  
  // Zoom operations
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
  addBlankInstance() {
    const nodeWidth = 250
    const nodeHeight = 120
    
    const containerRect = this.container.getBoundingClientRect()
    const scrollLeft = this.container.scrollLeft
    const scrollTop = this.container.scrollTop
    
    const visibleCenterX = (scrollLeft + containerRect.width / 2) / this.zoomLevel
    const visibleCenterY = (scrollTop + containerRect.height / 2) / this.zoomLevel
    
    const x = visibleCenterX - this.canvasCenter - (nodeWidth / 2)
    const y = visibleCenterY - this.canvasCenter - (nodeHeight / 2)
    
    const templateData = {
      name: 'New Instance',
      description: '',
      config: {},
      model: '',
      provider: ''
    }
    
    const node = this.nodeManager.createNode(templateData, { x, y })
    this.renderNode(node)
    this.uiComponents.updateEmptyState()
    this.updateYamlPreview()
    
    this.selectNode(node.id)
    
    this.uiComponents.switchToProperties()
    
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
  
  // Load existing swarm
  loadExistingSwarm() {
    if (!this.existingDataValue && !this.existingYamlValue) return
    
    try {
      const data = this.existingDataValue ? JSON.parse(this.existingDataValue) : {}
      
      if (data.nodes && data.connections) {
        this.nodeManager.load(data.nodes)
        
        this.nodeManager.getNodes().forEach(node => {
          this.renderNode(node)
        })
        
        this.connectionManager.load(data.connections)
        
        if (data.mainNodeId) {
          this.mainNodeId = data.mainNodeId
          this.updateMainNodeBadge(data.mainNodeId)
        }
        
        if (data.tags) {
          this.tags = data.tags
          this.renderTags()
        }
        
        this.updateConnections()
        this.updateSocketStates()
        this.uiComponents.updateEmptyState()
        this.updateYamlPreview()
      }
      else if (this.existingYamlValue) {
        const yamlData = jsyaml.load(this.existingYamlValue)
        this.yamlProcessor.loadFromYamlData(yamlData)
      }
    } catch (error) {
      console.error('Error loading existing swarm:', error)
    }
  }
  
  updateMainNodeBadge(nodeId) {
    const node = this.nodeManager.findNode(nodeId)
    if (node?.element) {
      node.element.classList.add('main-node')
      if (!node.element.querySelector('.bg-orange-500')) {
        node.element.insertAdjacentHTML('afterbegin', '<div class="absolute top-1 right-1 z-10"><span class="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded">Main</span></div>')
      }
    }
  }
  
  // Auto-layout
  async autoLayout() {
    if (this.nodeManager.getNodes().length === 0) return
    
    this.layoutManager.autoLayout(
      this.nodeManager.getNodes(),
      this.connectionManager.getConnections()
    )
    
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
    
    this.nodeManager.getNodes().forEach(node => {
      node.element?.remove()
    })
    
    this.nodeManager.clearAll()
    this.connectionManager.init()
    
    this.selectedNodes = []
    this.selectedNode = null
    this.selectedConnection = null
    this.mainNodeId = null
    this.nodeKeyMap.clear()
    
    this.nameInputTarget.value = ''
    this.tags = []
    this.renderTags()
    
    this.updateConnections()
    this.uiComponents.updateEmptyState()
    this.updateYamlPreview()
    this.deselectAll()
  }
  
  // Delegated methods - these delegate to the modules
  
  // UI Components methods
  showFlashMessage(message, type) {
    return this.uiComponents.showFlashMessage(message, type)
  }
  
  switchToProperties() {
    return this.uiComponents.switchToProperties()
  }
  
  switchToYaml() {
    return this.uiComponents.switchToYaml()
  }
  
  switchToChat() {
    return this.chatIntegration.switchToChat()
  }
  
  switchToInstancesTab() {
    return this.uiComponents.switchToInstancesTab()
  }
  
  switchToMcpServersTab() {
    return this.uiComponents.switchToMcpServersTab()
  }
  
  startResize(e) {
    return this.uiComponents.startResize(e)
  }
  
  expandSidebarToMax() {
    return this.uiComponents.expandSidebarToMax()
  }
  
  // File Operations methods
  saveSwarm() {
    return this.fileOperations.saveSwarm()
  }
  
  exportYaml() {
    return this.fileOperations.exportYaml()
  }
  
  copyYaml() {
    return this.fileOperations.copyYaml()
  }
  
  launchSwarm() {
    return this.fileOperations.launchSwarm()
  }
  
  // Template Manager methods
  saveNodeAsTemplate(e) {
    return this.templateManager.saveNodeAsTemplate(e)
  }
  
  filterTemplates(e) {
    return this.templateManager.filterTemplates(e)
  }
  
  // MCP Manager methods
  filterMcpServers(e) {
    return this.mcpManager.filterMcpServers(e)
  }
  
  removeMcpFromNode(e) {
    return this.mcpManager.removeMcpFromNode(e)
  }
  
  // YAML Processor methods
  updateYamlPreview() {
    return this.yamlProcessor.updateYamlPreview()
  }
  
  buildSwarmData() {
    return this.yamlProcessor.buildSwarmData()
  }
  
  generateReadableYaml(data) {
    return this.yamlProcessor.generateReadableYaml(data)
  }
  
  importYaml() {
    return this.yamlProcessor.importYaml()
  }
  
  handleImportFile(e) {
    return this.yamlProcessor.handleImportFile(e)
  }
  
  handleCanvasRefresh(event) {
    return this.yamlProcessor.handleCanvasRefresh(event)
  }
}