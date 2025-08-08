// Layout and auto-arrangement functionality
export default class LayoutManager {
  constructor(controller) {
    this.controller = controller
  }

  // Auto-layout nodes using hierarchical algorithm
  autoLayout(nodes, connections) {
    if (!nodes || nodes.length === 0) return
    if (!connections) connections = []

    // Use hierarchical layout
    this.hierarchicalLayout(nodes, connections)

    // Center the layout
    this.centerLayout(nodes)
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

    // Sort levels
    const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b)

    // Position nodes level by level, considering source socket positions
    const positionedNodes = new Set()

    sortedLevels.forEach((level, levelIndex) => {
      const nodesAtLevel = nodesByLevel.get(level)

      if (levelIndex === 0) {
        // First level (roots) - distribute horizontally
        const totalWidth = nodesAtLevel.length * nodeWidth + (nodesAtLevel.length - 1) * horizontalSpacing
        let currentX = -totalWidth / 2

        nodesAtLevel.forEach(node => {
          node.data.x = currentX
          node.data.y = 0
          currentX += nodeWidth + horizontalSpacing
          positionedNodes.add(node.id)
        })
      } else {
        // Subsequent levels - position based on parent socket positions
        const nodesToPosition = []

        nodesAtLevel.forEach(node => {
          // Find all incoming connections
          const incomingConns = connections.filter(c => c.to === node.id)

          if (incomingConns.length > 0) {
            // Calculate position based on source sockets
            const positions = incomingConns.map(conn => {
              const sourceNode = nodes.find(n => n.id === conn.from)
              if (!sourceNode || !positionedNodes.has(sourceNode.id)) return null

              // Get the source socket side from the connection manager
              const socketPair = this.controller.connectionManager.findBestSocketPair(sourceNode, node)
              conn.fromSide = socketPair.fromSide
              conn.toSide = socketPair.toSide

              // Calculate position based on source socket
              return this.calculateDestinationPosition(
                sourceNode.data.x,
                sourceNode.data.y,
                socketPair.fromSide,
                nodeWidth,
                nodeHeight,
                horizontalSpacing,
                verticalSpacing
              )
            }).filter(p => p !== null)

            if (positions.length > 0) {
              // Average the suggested positions
              const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length
              const avgY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length

              nodesToPosition.push({
                node,
                x: avgX,
                y: avgY,
                hasPosition: true
              })
            } else {
              nodesToPosition.push({ node, hasPosition: false })
            }
          } else {
            // No incoming connections - position independently
            nodesToPosition.push({ node, hasPosition: false })
          }
        })

        // Position nodes with calculated positions first
        const positioned = nodesToPosition.filter(n => n.hasPosition)
        const unpositioned = nodesToPosition.filter(n => !n.hasPosition)

        // Apply calculated positions and resolve overlaps
        positioned.forEach(({ node, x, y }) => {
          node.data.x = x
          node.data.y = y
          positionedNodes.add(node.id)
        })

        // Resolve overlaps among positioned nodes
        this.resolveOverlaps(positioned.map(p => p.node), nodeWidth, nodeHeight, horizontalSpacing / 2)

        // Position any remaining nodes
        if (unpositioned.length > 0) {
          // Find the y position for this level
          const levelY = level * (nodeHeight + verticalSpacing)

          // Distribute unpositioned nodes horizontally
          const totalWidth = unpositioned.length * nodeWidth + (unpositioned.length - 1) * horizontalSpacing
          let currentX = -totalWidth / 2

          unpositioned.forEach(({ node }) => {
            node.data.x = currentX
            node.data.y = levelY
            currentX += nodeWidth + horizontalSpacing
            positionedNodes.add(node.id)
          })
        }
      }
    })
  }

  calculateDestinationPosition(sourceX, sourceY, fromSide, nodeWidth, nodeHeight, hSpacing, vSpacing) {
    const halfWidth = nodeWidth / 2
    const halfHeight = nodeHeight / 2

    switch (fromSide) {
      case 'right':
        // Position to the right
        return {
          x: sourceX + nodeWidth + hSpacing,
          y: sourceY
        }
      case 'left':
        // Position to the left
        return {
          x: sourceX - nodeWidth - hSpacing,
          y: sourceY
        }
      case 'bottom':
        // Position below
        return {
          x: sourceX,
          y: sourceY + nodeHeight + vSpacing
        }
      case 'top':
        // Position above
        return {
          x: sourceX,
          y: sourceY - nodeHeight - vSpacing
        }
      default:
        // Default to right
        return {
          x: sourceX + nodeWidth + hSpacing,
          y: sourceY
        }
    }
  }

  resolveOverlaps(nodes, nodeWidth, nodeHeight, minSpacing) {
    const padding = minSpacing
    let resolved = false
    let iterations = 0
    const maxIterations = 50

    while (!resolved && iterations < maxIterations) {
      resolved = true
      iterations++

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i]
          const node2 = nodes[j]

          const dx = Math.abs(node2.data.x - node1.data.x)
          const dy = Math.abs(node2.data.y - node1.data.y)

          const minX = nodeWidth + padding
          const minY = nodeHeight + padding

          if (dx < minX && dy < minY) {
            // Nodes overlap - push them apart
            resolved = false

            // Calculate overlap amounts
            const overlapX = minX - dx
            const overlapY = minY - dy

            // Determine push direction based on which overlap is smaller
            if (overlapX < overlapY) {
              // Push horizontally
              const pushX = overlapX / 2 + 5
              if (node1.data.x < node2.data.x) {
                node1.data.x -= pushX
                node2.data.x += pushX
              } else {
                node1.data.x += pushX
                node2.data.x -= pushX
              }
            } else {
              // Push vertically
              const pushY = overlapY / 2 + 5
              if (node1.data.y < node2.data.y) {
                node1.data.y -= pushY
                node2.data.y += pushY
              } else {
                node1.data.y += pushY
                node2.data.y -= pushY
              }
            }
          }
        }
      }
    }
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