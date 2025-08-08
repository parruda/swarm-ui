// Node management functionality
export default class NodeManager {
  constructor(controller) {
    this.controller = controller
    this.nodes = []
    this.nodeIdCounter = 1
  }
  
  // Initialize
  init() {
    this.nodes = []
    this.nodeIdCounter = 1
  }
  
  // Get all nodes
  getNodes() {
    return this.nodes
  }
  
  // Find node by ID
  findNode(nodeId) {
    return this.nodes.find(n => n.id === nodeId)
  }
  
  // Create a new node
  createNode(templateData, position) {
    const nodeId = this.nodeIdCounter++
    
    // Extract system_prompt from config if present
    const config = templateData.config || {}
    let system_prompt = config.system_prompt || ''
    // Convert literal \n to actual newlines if they exist
    // This handles cases where the prompt was imported from JSON with escaped newlines
    if (system_prompt.includes('\\n')) {
      system_prompt = system_prompt.replace(/\\n/g, '\n')
    }
    
    // Remove system_prompt from config since it's stored separately
    const cleanConfig = { ...config }
    delete cleanConfig.system_prompt
    
    const node = {
      id: nodeId,
      data: {
        x: position.x,
        y: position.y,
        name: templateData.name || 'Instance',
        description: templateData.description || '',
        config: cleanConfig,
        system_prompt: system_prompt,
        model: templateData.model || config.model,
        provider: templateData.provider || config.provider,
        directory: config.directory,
        allowed_tools: config.allowed_tools,
        vibe: config.vibe,
        temperature: config.temperature,
        worktree: templateData.worktree !== undefined ? templateData.worktree : config.worktree,
        mcps: config.mcps || []  // Preserve MCP servers from template
      }
    }
    
    this.nodes.push(node)
    return node
  }
  
  // Update node position
  updateNodePosition(nodeId, x, y) {
    const node = this.findNode(nodeId)
    if (node) {
      node.data.x = x
      node.data.y = y
    }
  }
  
  // Update node data
  updateNodeData(nodeId, data) {
    const node = this.findNode(nodeId)
    if (node) {
      node.data = { ...node.data, ...data }
    }
  }
  
  // Remove a node
  removeNode(nodeId) {
    const index = this.nodes.findIndex(n => n.id === nodeId)
    if (index !== -1) {
      this.nodes.splice(index, 1)
    }
  }
  
  // Clear all nodes
  clearAll() {
    this.nodes = []
    this.nodeIdCounter = 1
  }
  
  // Calculate nodes bounds
  getNodesBounds() {
    if (this.nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
    }
    
    const nodeWidth = 250
    const nodeHeight = 120
    
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    
    this.nodes.forEach(node => {
      minX = Math.min(minX, node.data.x)
      minY = Math.min(minY, node.data.y)
      maxX = Math.max(maxX, node.data.x + nodeWidth)
      maxY = Math.max(maxY, node.data.y + nodeHeight)
    })
    
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    }
  }
  
  // Get obstacles for path routing
  getObstacles(excludeNodes = []) {
    const nodeWidth = 250
    const nodeHeight = 120
    
    return this.nodes
      .filter(node => !excludeNodes.includes(node.id))
      .map(node => ({
        left: node.data.x + this.controller.canvasCenter,
        top: node.data.y + this.controller.canvasCenter,
        right: node.data.x + this.controller.canvasCenter + nodeWidth,
        bottom: node.data.y + this.controller.canvasCenter + nodeHeight
      }))
  }
  
  // Import nodes from data
  importNodes(swarmData) {
    const importOffset = 100
    const bounds = this.getNodesBounds()
    const startX = bounds.maxX > 0 ? bounds.maxX + importOffset : 0
    const startY = 0
    
    const nodeSpacing = 50
    const nodesPerRow = 4
    const nodeWidth = 250
    const nodeHeight = 120
    
    const importedNodes = []
    
    Object.entries(swarmData.instances || {}).forEach(([name, config], index) => {
      const row = Math.floor(index / nodesPerRow)
      const col = index % nodesPerRow
      
      const x = startX + col * (nodeWidth + nodeSpacing) - this.controller.canvasCenter
      const y = startY + row * (nodeHeight + nodeSpacing) - this.controller.canvasCenter
      
      // Extract system_prompt from the YAML 'prompt' field
      let system_prompt = config.prompt || config.system_prompt || ''
      // Convert literal \n to actual newlines if they exist
      // This handles cases where the prompt was imported from JSON with escaped newlines
      if (system_prompt.includes('\\n')) {
        system_prompt = system_prompt.replace(/\\n/g, '\n')
      }
      
      // Create clean config without prompt fields
      const cleanConfig = { ...config }
      delete cleanConfig.prompt
      delete cleanConfig.system_prompt
      
      // Add system_prompt to the config for createNode to extract
      cleanConfig.system_prompt = system_prompt
      
      // Preserve MCPs if present
      if (config.mcps) {
        cleanConfig.mcps = config.mcps
      }
      
      // Preserve worktree if present
      if (config.worktree !== undefined) {
        cleanConfig.worktree = config.worktree
      }
      
      const node = this.createNode({
        name: name,
        description: config.description || '',
        config: cleanConfig,
        model: config.model || 'opus',
        provider: config.provider || 'claude',  // Default to claude if not specified
        worktree: config.worktree  // Include worktree at top level too
      }, { x, y })
      
      importedNodes.push(node)
    })
    
    return importedNodes
  }
  
  // Serialize nodes for export
  serialize() {
    return this.nodes.map(node => ({
      id: node.id,
      data: {
        x: node.data.x,
        y: node.data.y,
        name: node.data.name,
        description: node.data.description,
        config: node.data.config,
        system_prompt: node.data.system_prompt,
        model: node.data.model,
        provider: node.data.provider,
        directory: node.data.directory,
        allowed_tools: node.data.allowed_tools,
        vibe: node.data.vibe,
        temperature: node.data.temperature,
        worktree: node.data.worktree,
        mcps: node.data.mcps || []  // Include MCPs in serialization
      }
    }))
  }
  
  // Load nodes from data
  load(nodesData) {
    this.nodes = []
    this.nodeIdCounter = 1
    
    if (!nodesData || !Array.isArray(nodesData)) return
    
    nodesData.forEach(nodeData => {
      const node = {
        id: this.nodeIdCounter++,
        data: { ...nodeData.data },
        element: null
      }
      this.nodes.push(node)
    })
  }
}