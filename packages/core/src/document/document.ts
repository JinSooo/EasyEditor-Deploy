import {
  type Designer,
  type DragNodeDataObject,
  type DragNodeObject,
  isDragNodeDataObject,
  isDragNodeObject,
} from '../designer'
import type { Project } from '../project'
import type { EventBus } from '../utils'
import type { NodeSchema } from './node/node'

import { action, observable } from 'mobx'
import type { Simulator } from '../simulator'
import { TRANSFORM_STAGE } from '../types'
import { createEventBus, uniqueId } from '../utils'
import { History } from './history'
import { NODE_EVENT, Node, insertChild, insertChildren, isNode, isNodeSchema } from './node/node'

export interface DocumentSchema {
  id?: string
  name?: string
  rootNode: NodeSchema
}

export enum DOCUMENT_EVENT {
  ADD = 'document:add',
  REMOVE = 'document:remove',
  OPEN_CHANGE = 'document:open.change',
  OPEN = 'document:open',
}

export interface LowCodeComponent {
  /**
   * 研发模式
   */
  devMode: 'lowCode'
  /**
   * 组件名称
   */
  componentName: string
}

// export type ProCodeComponent = TypeNpmInfo;
export interface ProCodeComponent {
  /**
   * 研发模式
   */
  devMode: 'proCode'
  /**
   * 组件名称
   */
  componentName: string
}
export type ComponentMap = ProCodeComponent | LowCodeComponent
export type ComponentsMap = ComponentMap[]

export class Document {
  private emitter: EventBus

  id: string

  /** document is open or not */
  @observable.ref accessor _opened = false

  /** document is blank or not */
  private _blank = true

  /** document root node */
  rootNode: Node | null = null

  get root() {
    return this.rootNode
  }

  getRoot() {
    return this.rootNode
  }

  private _nodesMap = new Map<Node['id'], Node>()

  get nodesMap() {
    return this._nodesMap
  }

  get simulator(): Simulator | null {
    return this.project.simulator
  }

  @observable.shallow private accessor nodes = new Set<Node>()

  get name() {
    return (this.rootNode?.getExtraProp('name', false)?.getValue() as string) || this.id
  }

  set name(name: string) {
    this.rootNode?.getExtraProp('name', true)?.setValue(name)
  }

  get opened() {
    return this._opened
  }

  isBlank() {
    return !!(this._blank && !this.isModified())
  }

  readonly history: History

  getHistory() {
    return this.history
  }

  readonly project: Project

  readonly designer: Designer

  constructor(project: Project, schema?: DocumentSchema) {
    this.emitter = createEventBus('Document')
    this.id = schema?.id ?? uniqueId('doc')
    this.project = project
    this.designer = project.designer
    this.history = new History(
      () => this.export(TRANSFORM_STAGE.SERIALIZE),
      schema => {
        this.import(schema, true)
        this.simulator?.rerender()
      },
      this,
    )

    if (schema) {
      this.name = schema?.name ?? ''
      if (schema?.rootNode) {
        this.rootNode = this.createNode(schema.rootNode)
        this._blank = false
      }
    }
  }

  @action
  import(schema?: DocumentSchema, checkId = false) {
    this.nodes.forEach(node => {
      if (node.isRoot()) return
      this.internalRemoveNode(node, true)
    })
    this.remove()

    this.id = schema?.id ?? uniqueId('doc')
    if (schema) {
      this.name = schema?.name ?? ''
      if (schema?.rootNode) {
        this.rootNode?.import(schema.rootNode, checkId)
        this.rootNode = this.createNode(schema.rootNode)
        this._blank = false
      }
    } else {
      this._blank = true
    }
  }

  export(stage: TRANSFORM_STAGE = TRANSFORM_STAGE.SAVE) {
    const schema: DocumentSchema = {
      id: this.id,
      name: this.name,
      rootNode: this.rootNode!.export(stage),
    }

    return schema
  }

  remove() {
    this.designer.postEvent(DOCUMENT_EVENT.REMOVE, { id: this.id })
    this.purge()
    this.project.removeDocument(this)
  }

  purge() {
    this.rootNode?.purge()
    this.nodes.clear()
    this._nodesMap.clear()
    this.rootNode = null
  }

  // TODO
  checkNesting(dropTarget: Node, dragObject: DragNodeObject | NodeSchema | Node | DragNodeDataObject): boolean {
    let items: Array<Node | NodeSchema>
    if (isDragNodeDataObject(dragObject)) {
      items = Array.isArray(dragObject.data) ? dragObject.data : [dragObject.data]
    } else if (isDragNodeObject(dragObject)) {
      items = dragObject.nodes
    } else if (isNode(dragObject) || isNodeSchema(dragObject)) {
      items = [dragObject]
    } else {
      console.warn('the dragObject is not in the correct type, dragObject:', dragObject)
      return true
    }
    return true
  }

  @action
  createNode(schema: NodeSchema) {
    if (schema?.id && this.hasNode(schema.id)) {
      schema.id = undefined
    }

    let node: Node | null = null
    if (schema.id) {
      node = this.getNode(schema.id)
      if (node && node.componentName === schema.componentName) {
        if (node.parent) {
          node.internalSetParent(null, false)
        }
        node.import(schema, true)
      } else if (node) {
        node = null
      }
    }

    if (!node) {
      node = new Node(this, schema)
    }

    this.nodes.add(node)
    this._nodesMap.set(node.id, node)
    this.emitter.emit(NODE_EVENT.ADD, node)

    return node
  }

  getNode(id: string) {
    return this._nodesMap.get(id) || null
  }

  getNodeCount(): number {
    return this._nodesMap.size
  }

  hasNode(id: string) {
    const node = this.getNode(id)
    return node ? !node.isPurged : false
  }

  removeNode(idOrNode: string | Node) {
    let node: Node | null

    if (typeof idOrNode === 'string') {
      node = this.getNode(idOrNode)
    } else {
      node = idOrNode
    }

    if (!node) {
      return
    }

    this.internalRemoveNode(node)
  }

  @action
  private internalRemoveNode(node: Node, useMutator = false) {
    if (!this.nodes.has(node)) {
      return
    }

    if (node.isRoot()) {
      this.rootNode = null
    }

    node.remove(true, useMutator)
  }

  unlinkNode(node: Node) {
    this.nodes.delete(node)
    this._nodesMap.delete(node.id)
  }

  batchRemoveNode(idOrNodeList: (string | Node)[]) {
    for (const item of idOrNodeList) {
      this.removeNode(item)
    }
  }

  insertNode(parent: Node, thing: Node | NodeSchema, at?: number, copy?: boolean) {
    return insertChild(parent, thing, at, copy)
  }

  /**
   * insert multiple nodes
   */
  insertNodes(parent: Node, nodes: Node[] | NodeSchema[], at?: number, copy?: boolean) {
    return insertChildren(parent, nodes, at, copy)
  }

  open() {
    const originState = this._opened
    this._opened = true
    // only emit when document is suspense
    if (originState === false) {
      this.designer.postEvent(DOCUMENT_EVENT.OPEN, this)
    }
    if (this._opened) {
      this.project.checkExclusive(this)
    } else {
      this.setOpened(false)
    }

    return this
  }

  close(): void {
    this.setOpened(false)
    this._opened = false
  }

  /**
   * use open a document and suspense other documents
   */
  private setOpened(flag: boolean) {
    if (!this._opened && !flag) {
      return
    }

    this._opened = flag
    // this.simulator?.setSuspense(flag);
    if (!flag) {
      this.project.checkExclusive(this)
    }
  }

  suspense() {
    this.setOpened(false)
  }

  activate() {
    this.setOpened(true)
  }

  /**
   * check if there is unsaved change for document
   */
  isModified() {
    return this.history.isSavePoint()
  }

  /**
   * get components map of all the nodes in this document
   * @param extraComps - extra components that will be added to the components map, use for custom components
   */
  getComponentsMap(extraComps?: string[]) {
    const componentsMap: ComponentsMap = []
    // use map to avoid duplicate
    const existedMap: Record<string, boolean> = {}

    for (const node of this._nodesMap.values()) {
      const { componentName } = node || {}
      if (!existedMap[componentName]) {
        existedMap[componentName] = true
        componentsMap.push({
          devMode: 'lowCode',
          componentName,
        })
      }
    }

    // combine extra components
    if (Array.isArray(extraComps)) {
      extraComps.forEach(componentName => {
        if (componentName && !existedMap[componentName]) {
          componentsMap.push({
            devMode: 'lowCode',
            componentName,
          })
        }
      })
    }

    return componentsMap
  }

  getComponent(componentName: string) {
    return this.simulator!.getComponent(componentName)
  }

  getComponentMeta(componentName: string) {
    return this.designer.componentMetaManager.getComponentMeta(componentName)
  }

  toData(extraComps?: string[]) {
    const node = this.export(TRANSFORM_STAGE.SAVE)
    const data = {
      componentsMap: this.getComponentsMap(extraComps),
      utils: this.getUtilsMap(),
      componentsTree: [node],
    }
    return data
  }

  getUtilsMap() {
    // return this.designer.editor.get('assets')?.utils?.map((item: any) => ({
    //   name: item.name,
    //   type: item.type || 'npm',
    //   // TODO 当前只有 npm 类型，content 直接设置为 item.npm，有 function 类型之后需要处理
    //   content: item.npm,
    // }));
    return {}
  }

  onReady(listener: () => void) {
    const dispose = this.designer.onEvent(DOCUMENT_EVENT.OPEN, listener)

    return () => {
      dispose()
    }
  }

  onNodeAdd(listener: (node: Node) => void) {
    const dispose = this.designer.onEvent(NODE_EVENT.ADD, listener)

    return () => {
      dispose()
    }
  }

  onNodeRemove(listener: (id: string) => void) {
    const dispose = this.designer.onEvent(NODE_EVENT.REMOVE, listener)

    return () => {
      dispose()
    }
  }
}

export function isDocument(obj: any): obj is Document {
  return obj && obj.rootNode
}
