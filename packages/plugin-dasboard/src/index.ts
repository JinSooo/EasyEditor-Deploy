import {
  DESIGNER_EVENT,
  type Document,
  DragObjectType,
  type DropLocation,
  type Node,
  type PluginCreator,
  getConvertedExtraKey,
} from '@easy-editor/core'
import { GroupComponent, GroupComponentMeta } from './materials/group'

export * from './type'

interface DashboardPluginOptions {
  // TODO: 配置分组内容(schema、meta)
  xxx?: string
}

const groupSchema = {
  componentName: 'Group',
  title: '分组',
  isGroup: true,
}

const DashboardPlugin: PluginCreator<DashboardPluginOptions> = options => {
  return {
    name: 'DashboardPlugin',
    deps: [],
    init(ctx) {
      const { designer, logger, simulator, componentMetaManager } = ctx

      // add componentMeta
      componentMetaManager.createComponentMeta(GroupComponentMeta)
      simulator.addComponent('Group', GroupComponent)

      /* ---------------------------- NodeData to Node ---------------------------- */
      const startOffsetNodeData = { x: 0, y: 0 }

      designer.dragon.onDragstart(e => {
        const { dragObject } = e

        if (dragObject && dragObject.type === DragObjectType.NodeData) {
          startOffsetNodeData.x = e.globalX - e.target.offsetLeft
          startOffsetNodeData.y = e.globalY - e.target.offsetTop
        }
      })

      designer.onEvent(DESIGNER_EVENT.INSERT_NODE_BEFORE, (e: DropLocation) => {
        const { event } = e
        const { dragObject } = event

        // add dashboard rect
        if (dragObject && dragObject.type === DragObjectType.NodeData) {
          const nodeData = Array.isArray(dragObject.data) ? dragObject.data : [dragObject.data]
          for (const schema of nodeData) {
            if (!schema) continue
            if (!schema.$) {
              schema.$ = {}
            }
            if (!schema.$dashboard) {
              schema.$dashboard = {}
            }
            if (!schema.$dashboard.rect) {
              schema.$dashboard.rect = {}
            }
            schema.$dashboard.rect = {
              x: event.canvasX - startOffsetNodeData.x,
              y: event.canvasY - startOffsetNodeData.y,
            }
          }
        }
      })

      /* ----------------------------------- DND ---------------------------------- */
      const startOffsetNodes: { [key: string]: { x: number; y: number } } = {}

      designer.dragon.onDragstart(e => {
        const { dragObject } = e

        if (dragObject && dragObject.type === DragObjectType.Node) {
          for (const node of dragObject.nodes!) {
            if (!node) continue
            const rect = simulator.computeRect(node)
            if (rect) {
              startOffsetNodes[node.id] = { x: e.globalX - rect.x, y: e.globalY - rect.y }
            }
          }
        }
      })

      const getNodeOffset = (node: Node) => {
        const groupNodes = node.getAllGroups()
        if (groupNodes.length === 0) return { x: 0, y: 0 }

        let x = 0
        let y = 0
        for (const groupNode of groupNodes) {
          x += groupNode.getExtraPropValue('$dashboard.rect.x') as number
          y += groupNode.getExtraPropValue('$dashboard.rect.y') as number
        }
        return { x, y }
      }

      designer.dragon.onDrag(e => {
        const { dragObject } = e
        if (dragObject && dragObject.type === DragObjectType.Node) {
          for (const node of dragObject.nodes!) {
            if (!node) continue
            const { x = 0, y = 0 } = startOffsetNodes[node.id]
            const offset = getNodeOffset(node)
            // TODO: 想一下名字，对应插件的可以放在特地的位置
            node?.setExtraPropValue('$dashboard.rect.x', e.canvasX - x - offset.x)
            node?.setExtraPropValue('$dashboard.rect.y', e.canvasY - y - offset.y)
          }
        }
      })

      // designer.dragon.onDragend(e => {
      //   const { dragObject } = e

      //   if (dragObject && dragObject.type === DragObjectType.Node) {
      //     for (const node of dragObject.nodes!) {
      //       if (!node) continue
      //       const { x = 0, y = 0 } = startOffsetNodes[node.id]
      //       node?.setExtraPropValue('$dashboard.rect.x', e.canvasX - x)
      //       node?.setExtraPropValue('$dashboard.rect.y', e.canvasY - y)
      //     }
      //   }
      // })
    },
    extend(ctx) {
      const { Document, Node } = ctx

      Object.defineProperties(Document.prototype, {
        group: {
          value(this: Document, nodeIdList: Node[] | string[]) {
            if (nodeIdList.length === 0) return

            let nodeList: Node[] = []
            if (typeof nodeIdList[0] === 'string') {
              nodeList = (nodeIdList as string[]).map(id => this.getNode(id)!)
            }

            const groupNode = this.createNode(groupSchema)

            // 计算所有节点的 index，确定分组的插入位置
            let maxZIndex = Number.POSITIVE_INFINITY
            for (const node of nodeList) {
              if (node.index < maxZIndex) {
                maxZIndex = node.index
              }
              if (node && !node.isRoot) {
                this.migrateNode(node, groupNode)
              }
            }

            this.rootNode?.insert(groupNode, maxZIndex)

            return groupNode
          },
        },
        ungroup: {
          value(this: Document, group: Node | string) {
            let groupNode: Node | null
            if (typeof group === 'string') {
              groupNode = this.getNode(group)
            } else {
              groupNode = group
            }

            if (!groupNode || !groupNode.isGroup || !groupNode.children) return

            const nodes = groupNode.childrenNodes
            // TODO: 这里写法很奇怪，因为children是响应式的，所以迁移之后，children也会更新
            while (nodes.length > 0) {
              if (groupNode.parent) {
                this.migrateNode(nodes[0], groupNode.parent)
              }
            }

            this.removeNode(groupNode)
          },
        },
      })

      const originalInitProps = Node.prototype.initBuiltinProps
      Object.defineProperties(Node.prototype, {
        isGroup: {
          get(this: Node) {
            return this.getExtraProp('isGroup')
          },
        },
        getCurrentGroup: {
          value(this: Node) {
            let parent = this.parent
            while (parent && !parent.isGroup) {
              parent = parent.parent
            }
            return parent
          },
        },
        getTopGroup: {
          value(this: Node) {
            let parent = this.parent
            let topGroup: Node | null = null
            while (parent) {
              if (parent.isGroup) {
                topGroup = parent
              }
              parent = parent.parent
            }
            return topGroup
          },
        },
        getAllGroups: {
          value(this: Node) {
            const groups: Node[] = []
            let parent = this.parent
            while (parent) {
              if (parent.isGroup) {
                groups.push(parent)
              }
              parent = parent.parent
            }
            return groups
          },
        },
        getAllNodesInGroup: {
          value(this: Node) {
            if (!this.isGroup) return [this]

            const nodes: Node[] = []
            for (const node of this.childrenNodes) {
              nodes.push(...node.getAllNodesInGroup())
            }
            return nodes
          },
        },
        // override
        initBuiltinProps: {
          value(this: Node) {
            // 实现类似 super.initBuiltinProps 的效果
            // 调用父类的 initBuiltinProps 方法
            originalInitProps.call(this)

            this.props.has(getConvertedExtraKey('isGroup')) || this.props.add(getConvertedExtraKey('isGroup'), false)
          },
        },
      })
    },
  }
}

export default DashboardPlugin
