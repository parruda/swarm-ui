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
  
  // Count connections for a specific socket
  getSocketConnectionCount(nodeId, side) {
    return this.connections.filter(c => 
      (c.from === nodeId && c.fromSide === side) ||
      (c.to === nodeId && c.toSide === side)
    ).length
  }
  
  // Find the least occupied socket on a given node
  findLeastOccupiedSocket(nodeId, preferredSides = ['right', 'bottom', 'left', 'top']) {
    let minConnections = Infinity
    let bestSide = preferredSides[0]
    
    for (const side of preferredSides) {
      const count = this.getSocketConnectionCount(nodeId, side)
      if (count < minConnections) {
        minConnections = count
        bestSide = side
      }
    }
    
    return { side: bestSide, count: minConnections }
  }
  
  // Find optimal socket pair for connection based on natural flow and connection load
  findBestSocketPair(fromNode, toNode) {
    const fromX = fromNode.data.x + this.controller.canvasCenter
    const fromY = fromNode.data.y + this.controller.canvasCenter
    const toX = toNode.data.x + this.controller.canvasCenter
    const toY = toNode.data.y + this.controller.canvasCenter
    
    const dx = toX - fromX
    const dy = toY - fromY
    
    // Determine preferred sides based on relative positions
    let fromPreferred = []
    let toPreferred = []
    
    // For horizontal flow (most natural for reading order)
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        // Node is to the right - prefer right->left flow
        fromPreferred = ['right', 'bottom', 'top', 'left']
        toPreferred = ['left', 'top', 'bottom', 'right']
      } else {
        // Node is to the left - prefer left->right flow
        fromPreferred = ['left', 'bottom', 'top', 'right']
        toPreferred = ['right', 'top', 'bottom', 'left']
      }
    } else {
      // For vertical connections when nodes are more vertically aligned
      if (dy > 0) {
        // Node is below - prefer bottom->top flow
        fromPreferred = ['bottom', 'right', 'left', 'top']
        toPreferred = ['top', 'left', 'right', 'bottom']
      } else {
        // Node is above - prefer top->bottom flow
        fromPreferred = ['top', 'right', 'left', 'bottom']
        toPreferred = ['bottom', 'left', 'right', 'top']
      }
    }
    
    // Find the least occupied socket on the source side
    const fromSocketInfo = this.findLeastOccupiedSocket(fromNode.id, fromPreferred)
    let fromSide = fromSocketInfo.side
    
    // Adjust target preferences based on selected source socket
    if (fromSide === 'right') {
      toPreferred = ['left', 'top', 'bottom', 'right']
    } else if (fromSide === 'left') {
      toPreferred = ['right', 'top', 'bottom', 'left']
    } else if (fromSide === 'bottom') {
      toPreferred = ['top', 'left', 'right', 'bottom']
    } else if (fromSide === 'top') {
      toPreferred = ['bottom', 'left', 'right', 'top']
    }
    
    // Find best socket on target side based on connection count
    const toElement = toNode.element
    let toSide = toPreferred[0]
    
    if (toElement) {
      // Find the least occupied socket
      let minConnections = Infinity
      for (const side of toPreferred) {
        const socket = toElement.querySelector(`.socket[data-socket-side="${side}"]`)
        if (socket) {
          const count = this.getSocketConnectionCount(toNode.id, side)
          if (count < minConnections) {
            minConnections = count
            toSide = side
          }
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
    // Determine preferred target sides based on the source side
    let toPreferred = []
    
    switch (fromSide) {
      case 'right':
        toPreferred = ['left', 'top', 'bottom', 'right']
        break
      case 'left':
        toPreferred = ['right', 'top', 'bottom', 'left']
        break
      case 'bottom':
        toPreferred = ['top', 'left', 'right', 'bottom']
        break
      case 'top':
        toPreferred = ['bottom', 'left', 'right', 'top']
        break
      default:
        toPreferred = ['left', 'top', 'right', 'bottom']
    }
    
    const toElement = toNode.element
    let toSide = toPreferred[0]
    
    if (toElement) {
      // Find the least occupied socket
      let minConnections = Infinity
      for (const side of toPreferred) {
        const socket = toElement.querySelector(`.socket[data-socket-side="${side}"]`)
        if (socket) {
          const count = this.getSocketConnectionCount(toNode.id, side)
          if (count < minConnections) {
            minConnections = count
            toSide = side
          }
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
    
    // Don't mark sockets here - let updateSocketStates handle it
    
    return connection
  }
  
  // Remove a connection
  removeConnection(index) {
    const conn = this.connections[index]
    if (!conn) return
    
    // Don't handle socket states here - let updateSocketStates handle it
    
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