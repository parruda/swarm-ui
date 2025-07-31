// Layout and auto-arrangement functionality
export default class LayoutManager {
  constructor(controller) {
    this.controller = controller
  }
  
  // Auto-layout nodes using appropriate layout algorithm
  autoLayout(nodes, connections) {
    if (nodes.length === 0) return
    
    // Detect if this is a hub-and-spoke pattern
    const hubNode = this.detectHubNode(nodes, connections)
    
    if (hubNode && this.isHubAndSpoke(hubNode, nodes, connections)) {
      // Use radial layout for hub-and-spoke
      this.radialLayout(hubNode, nodes, connections)
    } else {
      // Use hierarchical layout for other patterns  
      this.hierarchicalLayout(nodes, connections)
    }
    
    // Center the layout
    this.centerLayout(nodes)
  }
  
  detectHubNode(nodes, connections) {
    // Find node with the most outgoing connections
    let maxOutgoing = 0
    let hubNode = null
    
    nodes.forEach(node => {
      const outgoing = connections.filter(c => c.from === node.id).length
      if (outgoing > maxOutgoing) {
        maxOutgoing = outgoing
        hubNode = node
      }
    })
    
    // Consider it a hub if it has connections to more than 30% of other nodes
    return maxOutgoing > Math.max(3, (nodes.length - 1) * 0.3) ? hubNode : null
  }
  
  isHubAndSpoke(hubNode, nodes, connections) {
    // Check if most connections originate from the hub
    const hubConnections = connections.filter(c => c.from === hubNode.id).length
    const totalConnections = connections.length
    return hubConnections > totalConnections * 0.5
  }
  
  radialLayout(hubNode, nodes, connections) {
    const nodeWidth = 250
    const nodeHeight = 120
    
    // Place hub in center
    hubNode.data.x = 0
    hubNode.data.y = 0
    
    // Get all nodes connected from hub
    const connectedNodes = []
    const hubConnections = connections.filter(conn => conn.from === hubNode.id)
    
    hubConnections.forEach(conn => {
      const node = nodes.find(n => n.id === conn.to)
      if (node) {
        connectedNodes.push({ node, connection: conn })
      }
    })
    
    // Calculate optimal radius based on number of nodes
    // We want nodes to not overlap, so calculate based on circumference
    const nodeSpacing = nodeWidth + 100 // Node width plus gap
    const minCircumference = connectedNodes.length * nodeSpacing
    const radius = Math.max(400, minCircumference / (2 * Math.PI))
    
    // Group nodes by their connections' socket sides for better organization
    const socketGroups = {
      top: [],
      right: [],
      bottom: [],
      left: []
    }
    
    // First pass: distribute nodes evenly around the circle
    connectedNodes.forEach(({ node, connection }, index) => {
      // Calculate angle for even distribution
      const angleStep = (2 * Math.PI) / connectedNodes.length
      const angle = index * angleStep - Math.PI / 2 // Start from top
      
      // Position node
      node.data.x = Math.cos(angle) * radius
      node.data.y = Math.sin(angle) * radius
      
      // Determine which socket to use based on angle
      const angleDegrees = (angle * 180 / Math.PI + 360) % 360
      let targetSocket
      
      if (angleDegrees >= 315 || angleDegrees < 45) {
        targetSocket = 'top'
      } else if (angleDegrees >= 45 && angleDegrees < 135) {
        targetSocket = 'right'
      } else if (angleDegrees >= 135 && angleDegrees < 225) {
        targetSocket = 'bottom'
      } else {
        targetSocket = 'left'
      }
      
      // Update connection to use optimal sockets
      const fromSocket = this.getRadialSocket(0, 0, node.data.x, node.data.y)
      connection.fromSide = fromSocket
      connection.toSide = this.getOppositeSocket(fromSocket)
    })
    
    // Place any unconnected nodes in outer layers
    const unconnectedNodes = nodes.filter(n => 
      n.id !== hubNode.id && !connectedNodes.find(cn => cn.node.id === n.id)
    )
    
    if (unconnectedNodes.length > 0) {
      // Check if these are second-degree connections
      const secondDegreeNodes = []
      const remainingNodes = []
      
      unconnectedNodes.forEach(node => {
        const hasConnectionToFirstDegree = connections.some(conn => {
          if (conn.from === node.id) {
            return connectedNodes.find(cn => cn.node.id === conn.to)
          }
          if (conn.to === node.id) {
            return connectedNodes.find(cn => cn.node.id === conn.from)
          }
          return false
        })
        
        if (hasConnectionToFirstDegree) {
          secondDegreeNodes.push(node)
        } else {
          remainingNodes.push(node)
        }
      })
      
      // Place second-degree nodes
      if (secondDegreeNodes.length > 0) {
        const outerRadius = radius * 1.8
        secondDegreeNodes.forEach((node, index) => {
          const angleStep = (2 * Math.PI) / secondDegreeNodes.length
          const angle = index * angleStep
          node.data.x = Math.cos(angle) * outerRadius
          node.data.y = Math.sin(angle) * outerRadius
        })
      }
      
      // Place remaining nodes even further out
      if (remainingNodes.length > 0) {
        const outerRadius = radius * 2.5
        remainingNodes.forEach((node, index) => {
          const angleStep = (2 * Math.PI) / remainingNodes.length
          const angle = index * angleStep + Math.PI / remainingNodes.length // Offset for visual balance
          node.data.x = Math.cos(angle) * outerRadius
          node.data.y = Math.sin(angle) * outerRadius
        })
      }
    }
  }
  
  getRadialSocket(fromX, fromY, toX, toY) {
    const dx = toX - fromX
    const dy = toY - fromY
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    
    // Normalize angle to 0-360
    const normalizedAngle = (angle + 360) % 360
    
    // Return socket based on angle quadrant
    if (normalizedAngle >= 315 || normalizedAngle < 45) {
      return 'right'
    } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
      return 'bottom'
    } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
      return 'left'
    } else {
      return 'top'
    }
  }
  
  getOppositeSocket(socket) {
    const opposites = {
      'top': 'bottom',
      'bottom': 'top',
      'left': 'right',
      'right': 'left'
    }
    return opposites[socket]
  }
  
  hierarchicalLayout(nodes, connections) {
    const nodeWidth = 250
    const nodeHeight = 120
    const horizontalSpacing = 150
    const verticalSpacing = 150
    
    // Build adjacency lists
    const graph = this.buildGraph(nodes, connections)
    
    // Find root nodes (no incoming connections)
    const roots = nodes.filter(node => 
      !connections.some(c => c.to === node.id)
    )
    
    if (roots.length === 0) {
      // If no clear roots, use the first node
      roots.push(nodes[0])
    }
    
    // Calculate levels using BFS
    const levels = this.calculateLevels(nodes, graph, roots)
    
    // Group nodes by level
    const nodesByLevel = new Map()
    for (const [nodeId, level] of levels.entries()) {
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, [])
      }
      nodesByLevel.get(level).push(nodes.find(n => n.id === nodeId))
    }
    
    // Position nodes
    let currentY = 0
    
    // Sort levels
    const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b)
    
    sortedLevels.forEach(level => {
      const nodesAtLevel = nodesByLevel.get(level)
      const totalWidth = nodesAtLevel.length * nodeWidth + (nodesAtLevel.length - 1) * horizontalSpacing
      let currentX = -totalWidth / 2
      
      // Sort nodes at the same level by their connections for better alignment
      nodesAtLevel.sort((a, b) => {
        const aParents = connections.filter(c => c.to === a.id).map(c => c.from)
        const bParents = connections.filter(c => c.to === b.id).map(c => c.from)
        
        if (aParents.length && bParents.length) {
          const aParentX = this.getAverageX(aParents, nodes)
          const bParentX = this.getAverageX(bParents, nodes)
          return aParentX - bParentX
        }
        return 0
      })
      
      nodesAtLevel.forEach((node, index) => {
        node.data.x = currentX
        node.data.y = currentY
        currentX += nodeWidth + horizontalSpacing
      })
      
      currentY += nodeHeight + verticalSpacing
    })
  }
  
  buildGraph(nodes, connections) {
    const graph = new Map()
    
    nodes.forEach(node => {
      graph.set(node.id, {
        incoming: [],
        outgoing: []
      })
    })
    
    connections.forEach(conn => {
      if (graph.has(conn.from)) {
        graph.get(conn.from).outgoing.push(conn.to)
      }
      if (graph.has(conn.to)) {
        graph.get(conn.to).incoming.push(conn.from)
      }
    })
    
    return graph
  }
  
  calculateLevels(nodes, graph, roots) {
    const levels = new Map()
    const visited = new Set()
    const queue = []
    
    // Start with root nodes
    roots.forEach(root => {
      queue.push({ node: root, level: 0 })
      visited.add(root.id)
    })
    
    // BFS to assign levels
    while (queue.length > 0) {
      const { node, level } = queue.shift()
      levels.set(node.id, level)
      
      const adjacency = graph.get(node.id)
      if (adjacency) {
        adjacency.outgoing.forEach(childId => {
          if (!visited.has(childId)) {
            visited.add(childId)
            const child = nodes.find(n => n.id === childId)
            if (child) {
              queue.push({ node: child, level: level + 1 })
            }
          }
        })
      }
    }
    
    // Handle any unvisited nodes (disconnected components)
    nodes.forEach(node => {
      if (!levels.has(node.id)) {
        levels.set(node.id, 0)
      }
    })
    
    return levels
  }
  
  getAverageX(nodeIds, nodes) {
    const positions = nodeIds
      .map(id => nodes.find(n => n.id === id))
      .filter(n => n)
      .map(n => n.data.x)
    
    if (positions.length === 0) return 0
    return positions.reduce((a, b) => a + b, 0) / positions.length
  }
  
  centerLayout(nodes) {
    if (nodes.length === 0) return
    
    const bounds = this.controller.nodeManager.getNodesBounds()
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    
    nodes.forEach(node => {
      node.data.x -= centerX
      node.data.y -= centerY
    })
  }
  
  // Arrange nodes in a grid
  gridLayout(nodes) {
    if (nodes.length === 0) return
    
    const nodeWidth = 250
    const nodeHeight = 120
    const padding = 50
    const nodesPerRow = Math.ceil(Math.sqrt(nodes.length))
    
    nodes.forEach((node, index) => {
      const row = Math.floor(index / nodesPerRow)
      const col = index % nodesPerRow
      
      node.data.x = col * (nodeWidth + padding) - this.controller.canvasCenter
      node.data.y = row * (nodeHeight + padding) - this.controller.canvasCenter
    })
    
    // Center the grid
    this.centerLayout(nodes)
  }
  
  // Calculate optimal arrangement to minimize connection lengths
  optimizeLayout(nodes, connections, iterations = 50) {
    if (nodes.length < 2) return
    
    const nodeWidth = 250
    const nodeHeight = 120
    const minDistance = 100
    
    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map()
      
      // Initialize forces
      nodes.forEach(node => {
        forces.set(node.id, { fx: 0, fy: 0 })
      })
      
      // Apply attractive forces for connected nodes
      connections.forEach(conn => {
        const fromNode = nodes.find(n => n.id === conn.from)
        const toNode = nodes.find(n => n.id === conn.to)
        
        if (fromNode && toNode) {
          const dx = toNode.data.x - fromNode.data.x
          const dy = toNode.data.y - fromNode.data.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          if (distance > 0) {
            const force = 0.1 * Math.log(distance / 100)
            const fx = force * dx / distance
            const fy = force * dy / distance
            
            forces.get(conn.from).fx += fx
            forces.get(conn.from).fy += fy
            forces.get(conn.to).fx -= fx
            forces.get(conn.to).fy -= fy
          }
        }
      })
      
      // Apply repulsive forces between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i]
          const node2 = nodes[j]
          
          const dx = node2.data.x - node1.data.x
          const dy = node2.data.y - node1.data.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          if (distance > 0 && distance < minDistance * 3) {
            const force = 100 / (distance * distance)
            const fx = force * dx / distance
            const fy = force * dy / distance
            
            forces.get(node1.id).fx -= fx
            forces.get(node1.id).fy -= fy
            forces.get(node2.id).fx += fx
            forces.get(node2.id).fy += fy
          }
        }
      }
      
      // Apply forces with damping
      nodes.forEach(node => {
        const force = forces.get(node.id)
        const damping = 0.5
        node.data.x += force.fx * damping
        node.data.y += force.fy * damping
      })
    }
    
    // Ensure minimum spacing
    this.ensureMinimumSpacing(nodes, nodeWidth + minDistance, nodeHeight + minDistance)
  }
  
  ensureMinimumSpacing(nodes, minX, minY) {
    let adjusted = true
    let iterations = 0
    
    while (adjusted && iterations < 20) {
      adjusted = false
      iterations++
      
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i]
          const node2 = nodes[j]
          
          const dx = Math.abs(node2.data.x - node1.data.x)
          const dy = Math.abs(node2.data.y - node1.data.y)
          
          if (dx < minX && dy < minY) {
            // Nodes overlap, push them apart
            const pushX = (minX - dx) / 2
            const pushY = (minY - dy) / 2
            
            if (node1.data.x < node2.data.x) {
              node1.data.x -= pushX
              node2.data.x += pushX
            } else {
              node1.data.x += pushX
              node2.data.x -= pushX
            }
            
            if (node1.data.y < node2.data.y) {
              node1.data.y -= pushY
              node2.data.y += pushY
            } else {
              node1.data.y += pushY
              node2.data.y -= pushY
            }
            
            adjusted = true
          }
        }
      }
    }
  }
}