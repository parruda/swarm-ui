// Layout and auto-arrangement functionality
export default class LayoutManager {
  constructor(controller) {
    this.controller = controller
  }
  
  // Auto-layout nodes using hierarchical layout
  autoLayout(nodes, connections) {
    if (nodes.length === 0) return
    
    const nodeWidth = 250
    const nodeHeight = 120
    const horizontalSpacing = 100
    const verticalSpacing = 80
    
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
    let currentY = -this.controller.canvasCenter + 50
    
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
    
    // Center the layout
    this.centerLayout(nodes)
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