// Connection management functionality
export default class ConnectionManager {
  constructor(controller) {
    this.controller = controller
    this.connections = []
  }
  
  // Initialize connections
  init() {
    this.connections = []
  }
  
  // Get all connections
  getConnections() {
    return this.connections
  }
  
  // Find optimal socket pair for connection based on natural flow
  findBestSocketPair(fromNode, toNode) {
    const fromX = fromNode.data.x + this.controller.canvasCenter
    const fromY = fromNode.data.y + this.controller.canvasCenter
    const toX = toNode.data.x + this.controller.canvasCenter
    const toY = toNode.data.y + this.controller.canvasCenter
    
    const dx = toX - fromX
    const dy = toY - fromY
    
    let fromSide, toSide
    
    // For horizontal flow (most natural for reading order)
    if (Math.abs(dx) > 50) {
      if (dx > 0) {
        // Node is to the right - use right->left flow
        fromSide = 'right'
        toSide = 'left'
      } else {
        // Node is to the left - use left->right flow
        fromSide = 'left'
        toSide = 'right'
      }
    } else {
      // For vertical connections when nodes are aligned
      if (dy > 0) {
        fromSide = 'bottom'
        toSide = 'top'
      } else {
        fromSide = 'top'
        toSide = 'bottom'
      }
    }
    
    // Check socket availability and adjust if needed
    const toElement = toNode.element
    const targetSocket = toElement.querySelector(`.socket[data-socket-side="${toSide}"]:not(.used-as-destination)`)
    
    if (!targetSocket) {
      // Find best available alternative
      const alternatives = this.getSmartAlternatives(fromSide, dx, dy)
      for (const alt of alternatives) {
        const altSocket = toElement.querySelector(`.socket[data-socket-side="${alt}"]:not(.used-as-destination)`)
        if (altSocket) {
          toSide = alt
          break
        }
      }
    }
    
    return { fromSide, toSide }
  }
  
  getSmartAlternatives(fromSide, dx, dy) {
    // Smart alternatives based on the source direction
    if (fromSide === 'right') {
      return dy > 0 ? ['left', 'top', 'bottom'] : ['left', 'bottom', 'top']
    } else if (fromSide === 'left') {
      return dy > 0 ? ['right', 'top', 'bottom'] : ['right', 'bottom', 'top']  
    } else if (fromSide === 'bottom') {
      return dx > 0 ? ['top', 'left', 'right'] : ['top', 'right', 'left']
    } else {
      return dx > 0 ? ['bottom', 'left', 'right'] : ['bottom', 'right', 'left']
    }
  }
  
  // Find best target socket when dragging from a specific source socket
  findBestSocketPairForDrag(fromNode, toNode, fromSide) {
    // Get the natural flow-based pair
    const naturalPair = this.findBestSocketPair(fromNode, toNode)
    
    // If the from side matches, use the natural target
    if (naturalPair.fromSide === fromSide) {
      return { toSide: naturalPair.toSide }
    }
    
    // Otherwise, find the best opposite for the given fromSide
    const opposites = {
      'right': 'left',
      'left': 'right',
      'bottom': 'top',
      'top': 'bottom'
    }
    
    let toSide = opposites[fromSide]
    
    // Check if it's available
    const toElement = toNode.element
    const targetSocket = toElement.querySelector(`.socket[data-socket-side="${toSide}"]`)
    
    if (targetSocket && targetSocket.classList.contains('used-as-destination')) {
      // Find alternative based on position
      const alternatives = this.getAlternativeSockets(toSide)
      for (const alt of alternatives) {
        const altSocket = toElement.querySelector(`.socket[data-socket-side="${alt}"]`)
        if (altSocket && !altSocket.classList.contains('used-as-destination')) {
          toSide = alt
          break
        }
      }
    }
    
    return { toSide }
  }
  
  getAlternativeSockets(side) {
    // Return alternative socket sides in order of preference
    switch (side) {
      case 'left':
        return ['top', 'bottom', 'right']
      case 'right':
        return ['top', 'bottom', 'left']
      case 'top':
        return ['left', 'right', 'bottom']
      case 'bottom':
        return ['left', 'right', 'top']
      default:
        return []
    }
  }
  
  // Create a new connection
  createConnection(fromId, fromSide, toId, toSide) {
    const connection = { from: fromId, fromSide, to: toId, toSide }
    this.connections.push(connection)
    
    // Mark destination socket as used
    const toNode = this.controller.viewport.querySelector(`.swarm-node[data-node-id="${toId}"]`)
    const toSocket = toNode?.querySelector(`.socket[data-socket-side="${toSide}"]`)
    if (toSocket) {
      toSocket.classList.add('used-as-destination')
    }
    
    return connection
  }
  
  // Remove a connection
  removeConnection(index) {
    const conn = this.connections[index]
    if (!conn) return
    
    // Clear socket state
    const toNode = this.controller.viewport.querySelector(`.swarm-node[data-node-id="${conn.to}"]`)
    const toSocket = toNode?.querySelector(`.socket[data-socket-side="${conn.toSide}"]`)
    if (toSocket) {
      toSocket.classList.remove('used-as-destination')
    }
    
    this.connections.splice(index, 1)
  }
  
  // Clear all connections for a node
  clearNodeConnections(nodeId) {
    // Remove connections where this node is source or target
    for (let i = this.connections.length - 1; i >= 0; i--) {
      if (this.connections[i].from === nodeId || this.connections[i].to === nodeId) {
        this.removeConnection(i)
      }
    }
  }
  
  // Find connections for a specific node
  getNodeConnections(nodeId) {
    return this.connections.filter(c => c.from === nodeId || c.to === nodeId)
  }
  
  // Check if a node has incoming connections
  hasIncomingConnections(nodeId) {
    return this.connections.some(c => c.to === nodeId)
  }
  
  // Serialize connections for export
  serialize() {
    return this.connections.map(c => ({
      from: c.from,
      to: c.to,
      fromSide: c.fromSide,
      toSide: c.toSide
    }))
  }
  
  // Load connections from data
  load(connectionsData) {
    this.connections = connectionsData || []
  }
}