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
    const node = {
      id: nodeId,
      data: {
        x: position.x,
        y: position.y,
        name: templateData.name || 'Instance',
        description: templateData.description || '',
        config: templateData.config || {},
        model: templateData.model,
        provider: templateData.provider
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
      
      // Map the swarm YAML format to the visual builder format
      const mappedConfig = {
        ...config,
        system_prompt: config.prompt || config.system_prompt || '',  // Map 'prompt' to 'system_prompt'
        temperature: config.temperature,
        allowed_tools: config.allowed_tools,
        parallel_tool_calls: config.parallel_tool_calls,
        response_format: config.response_format,
        vibe: config.vibe,
        directory: config.directory
      }
      
      const node = this.createNode({
        name: name,
        description: config.description || '',
        config: mappedConfig,
        model: config.model || 'opus',
        provider: config.provider || 'claude'  // Default to claude if not specified
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
        model: node.data.model,
        provider: node.data.provider
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