import type { PluginCreator } from '@easy-editor/core'
import { createFetchHandler } from './handlers/fetch'
import createInterpret from './interpret/DataSourceEngineFactory'
import createRuntime from './runtime/RuntimeDataSourceEngineFactory'
import type { DataHandler, IDataSourceRuntimeContext, InterpretDataSource, RequestHandlersMap } from './types'

export { createInterpret, createRuntime }

export * from './types'

const defaultRequestHandlersMap = {
  fetch: createFetchHandler(),
}

interface DataSourcePluginOptions {
  /**
   * 请求处理器映射
   * @default
   * {
   *   fetch: createFetchHandler()
   * }
   */
  requestHandlersMap?: RequestHandlersMap<{ data: unknown }>

  /**
   * 默认数据处理器
   */
  defaultDataHandler?: DataHandler
}

const DataSourcePlugin: PluginCreator<DataSourcePluginOptions> = options => {
  const { requestHandlersMap = defaultRequestHandlersMap, defaultDataHandler } = options || {}

  return {
    name: 'DataSourcePlugin',
    deps: [],
    init(ctx) {
      const { config } = ctx

      config.set('dataSourceEngine', {
        createRuntime,
        createInterpret,
        createDataSourceEngine: (dataSource: InterpretDataSource, engine: IDataSourceRuntimeContext) => {
          return createInterpret(dataSource, engine, { requestHandlersMap, defaultDataHandler })
        },
      })
    },
  }
}

export default DataSourcePlugin
