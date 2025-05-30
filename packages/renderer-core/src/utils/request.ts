import { serializeParams } from './common'

/**
 * this is a private method, export for testing purposes only.
 *
 * @export
 * @param {*} dataAPI
 * @param {*} params
 * @returns
 */
export const buildUrl = (dataAPI: any, params: any) => {
  const paramStr = serializeParams(params)
  if (paramStr) {
    return dataAPI.indexOf('?') > 0 ? `${dataAPI}&${paramStr}` : `${dataAPI}?${paramStr}`
  }
  return dataAPI
}

/**
 * do Get request
 *
 * @export
 * @param {*} dataAPI
 * @param {*} [params={}]
 * @param {*} [headers={}]
 * @param {*} [otherProps={}]
 * @returns
 */
export const get = (dataAPI: any, params = {}, headers = {}, otherProps = {}) => {
  const processedHeaders = {
    Accept: 'application/json',
    ...headers,
  }
  const url = buildUrl(dataAPI, params)
  return request(url, 'GET', null, processedHeaders, otherProps)
}

/**
 * do Post request
 *
 * @export
 * @param {*} dataAPI
 * @param {*} [params={}]
 * @param {*} [headers={}]
 * @param {*} [otherProps={}]
 * @returns
 */
export const post = (dataAPI: any, params = {}, headers: any = {}, otherProps = {}) => {
  const processedHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  }
  const body =
    processedHeaders['Content-Type'].indexOf('application/json') > -1 || Array.isArray(params)
      ? JSON.stringify(params)
      : serializeParams(params)

  return request(dataAPI, 'POST', body, processedHeaders, otherProps)
}

/**
 * do request
 *
 * @export
 * @param {*} dataAPI
 * @param {string} [method='GET']
 * @param {*} data
 * @param {*} [headers={}]
 * @param {*} [otherProps={}]
 * @returns
 */
export const request = (dataAPI: any, method = 'GET', data: any, headers = {}, otherProps: any = {}) => {
  let processedHeaders = headers || {}
  let payload = data
  if (method === 'PUT' || method === 'DELETE') {
    processedHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...processedHeaders,
    }
    payload = JSON.stringify(payload || {})
  }
  return new Promise((resolve, reject) => {
    if (otherProps.timeout) {
      setTimeout(() => {
        reject(new Error('timeout'))
      }, otherProps.timeout)
    }
    fetch(dataAPI, {
      method,
      credentials: 'include',
      headers: processedHeaders,
      body: payload,
      ...otherProps,
    })
      .then(response => {
        switch (response.status) {
          case 200:
          case 201:
          case 202:
            return response.json()
          case 204:
            if (method === 'DELETE') {
              return {
                success: true,
              }
            } else {
              return {
                __success: false,
                code: response.status,
              }
            }
          case 400:
          case 401:
          case 403:
          case 404:
          case 406:
          case 410:
          case 422:
          case 500:
            return response
              .json()
              .then(res => {
                return {
                  __success: false,
                  code: response.status,
                  data: res,
                }
              })
              .catch(() => {
                return {
                  __success: false,
                  code: response.status,
                }
              })
          default:
        }
        return null
      })
      .then(json => {
        if (!json) {
          reject(json)
          return
        }
        if (json.__success !== false) {
          resolve(json)
        } else {
          json.__success = undefined
          reject(json)
        }
      })
      .catch(err => {
        reject(err)
      })
  })
}
