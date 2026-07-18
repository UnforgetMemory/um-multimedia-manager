declare global {
  const H3Error: typeof import('../../../../node_modules/h3').H3Error
  const H3Event: typeof import('../../../../node_modules/h3').H3Event
  const __buildAssetsURL: typeof import('../../../../node_modules/@nuxt/nitro-server/dist/runtime/utils/paths').buildAssetsURL
  const __publicAssetsURL: typeof import('../../../../node_modules/@nuxt/nitro-server/dist/runtime/utils/paths').publicAssetsURL
  const apiError: typeof import('../../server/utils/api').apiError
  const apiSuccess: typeof import('../../server/utils/api').apiSuccess
  const appendCorsHeaders: typeof import('../../../../node_modules/h3').appendCorsHeaders
  const appendCorsPreflightHeaders: typeof import('../../../../node_modules/h3').appendCorsPreflightHeaders
  const appendHeader: typeof import('../../../../node_modules/h3').appendHeader
  const appendHeaders: typeof import('../../../../node_modules/h3').appendHeaders
  const appendResponseHeader: typeof import('../../../../node_modules/h3').appendResponseHeader
  const appendResponseHeaders: typeof import('../../../../node_modules/h3').appendResponseHeaders
  const applyStatements: typeof import('../../server/utils/migrate').applyStatements
  const assertMethod: typeof import('../../../../node_modules/h3').assertMethod
  const badRequest: typeof import('../../server/utils/api').badRequest
  const buildVerificationUrl: typeof import('../../server/utils/email').buildVerificationUrl
  const cachedEventHandler: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/cache').cachedEventHandler
  const cachedFunction: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/cache').cachedFunction
  const callNodeListener: typeof import('../../../../node_modules/h3').callNodeListener
  const clearResponseHeaders: typeof import('../../../../node_modules/h3').clearResponseHeaders
  const clearSession: typeof import('../../../../node_modules/h3').clearSession
  const clearSessionCookie: typeof import('../../server/utils/auth').clearSessionCookie
  const createApp: typeof import('../../../../node_modules/h3').createApp
  const createAppEventHandler: typeof import('../../../../node_modules/h3').createAppEventHandler
  const createError: typeof import('../../../../node_modules/h3').createError
  const createEvent: typeof import('../../../../node_modules/h3').createEvent
  const createEventStream: typeof import('../../../../node_modules/h3').createEventStream
  const createInviteCodeSchema: typeof import('../../server/utils/validation').createInviteCodeSchema
  const createRouter: typeof import('../../../../node_modules/h3').createRouter
  const defaultContentType: typeof import('../../../../node_modules/h3').defaultContentType
  const defineAppConfig: typeof import('../../../../node_modules/@nuxt/nitro-server/dist/runtime/utils/config').defineAppConfig
  const defineCachedEventHandler: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/cache').defineCachedEventHandler
  const defineCachedFunction: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/cache').defineCachedFunction
  const defineEventHandler: typeof import('../../../../node_modules/h3').defineEventHandler
  const defineLazyEventHandler: typeof import('../../../../node_modules/h3').defineLazyEventHandler
  const defineNitroErrorHandler: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/error/utils').defineNitroErrorHandler
  const defineNitroPlugin: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/plugin').defineNitroPlugin
  const defineNodeListener: typeof import('../../../../node_modules/h3').defineNodeListener
  const defineNodeMiddleware: typeof import('../../../../node_modules/h3').defineNodeMiddleware
  const defineRenderHandler: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/renderer').defineRenderHandler
  const defineRequestMiddleware: typeof import('../../../../node_modules/h3').defineRequestMiddleware
  const defineResponseMiddleware: typeof import('../../../../node_modules/h3').defineResponseMiddleware
  const defineRouteMeta: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/meta').defineRouteMeta
  const defineTask: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/task').defineTask
  const defineWebSocket: typeof import('../../../../node_modules/h3').defineWebSocket
  const defineWebSocketHandler: typeof import('../../../../node_modules/h3').defineWebSocketHandler
  const deleteCookie: typeof import('../../../../node_modules/h3').deleteCookie
  const dynamicEventHandler: typeof import('../../../../node_modules/h3').dynamicEventHandler
  const eventHandler: typeof import('../../../../node_modules/h3').eventHandler
  const fetchWithEvent: typeof import('../../../../node_modules/h3').fetchWithEvent
  const forbidden: typeof import('../../server/utils/api').forbidden
  const fromNodeMiddleware: typeof import('../../../../node_modules/h3').fromNodeMiddleware
  const fromPlainHandler: typeof import('../../../../node_modules/h3').fromPlainHandler
  const fromWebHandler: typeof import('../../../../node_modules/h3').fromWebHandler
  const generateSessionToken: typeof import('../../server/utils/auth').generateSessionToken
  const generateVerificationToken: typeof import('../../server/utils/email').generateVerificationToken
  const getCookie: typeof import('../../../../node_modules/h3').getCookie
  const getHeader: typeof import('../../../../node_modules/h3').getHeader
  const getHeaders: typeof import('../../../../node_modules/h3').getHeaders
  const getMethod: typeof import('../../../../node_modules/h3').getMethod
  const getProxyRequestHeaders: typeof import('../../../../node_modules/h3').getProxyRequestHeaders
  const getQuery: typeof import('../../../../node_modules/h3').getQuery
  const getRequestFingerprint: typeof import('../../../../node_modules/h3').getRequestFingerprint
  const getRequestHeader: typeof import('../../../../node_modules/h3').getRequestHeader
  const getRequestHeaders: typeof import('../../../../node_modules/h3').getRequestHeaders
  const getRequestHost: typeof import('../../../../node_modules/h3').getRequestHost
  const getRequestIP: typeof import('../../../../node_modules/h3').getRequestIP
  const getRequestPath: typeof import('../../../../node_modules/h3').getRequestPath
  const getRequestProtocol: typeof import('../../../../node_modules/h3').getRequestProtocol
  const getRequestURL: typeof import('../../../../node_modules/h3').getRequestURL
  const getRequestWebStream: typeof import('../../../../node_modules/h3').getRequestWebStream
  const getResponseHeader: typeof import('../../../../node_modules/h3').getResponseHeader
  const getResponseHeaders: typeof import('../../../../node_modules/h3').getResponseHeaders
  const getResponseStatus: typeof import('../../../../node_modules/h3').getResponseStatus
  const getResponseStatusText: typeof import('../../../../node_modules/h3').getResponseStatusText
  const getRouteRules: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/route-rules').getRouteRules
  const getRouterParam: typeof import('../../../../node_modules/h3').getRouterParam
  const getRouterParams: typeof import('../../../../node_modules/h3').getRouterParams
  const getSession: typeof import('../../../../node_modules/h3').getSession
  const getSessionCookie: typeof import('../../server/utils/auth').getSessionCookie
  const getSessionUser: typeof import('../../server/utils/auth').getSessionUser
  const getValidatedQuery: typeof import('../../../../node_modules/h3').getValidatedQuery
  const getValidatedRouterParams: typeof import('../../../../node_modules/h3').getValidatedRouterParams
  const handleApiError: typeof import('../../server/utils/api').handleApiError
  const handleCacheHeaders: typeof import('../../../../node_modules/h3').handleCacheHeaders
  const handleCors: typeof import('../../../../node_modules/h3').handleCors
  const hashPassword: typeof import('../../server/utils/auth').hashPassword
  const inviteCodeSchema: typeof import('../../server/utils/validation').inviteCodeSchema
  const isCorsOriginAllowed: typeof import('../../../../node_modules/h3').isCorsOriginAllowed
  const isError: typeof import('../../../../node_modules/h3').isError
  const isEvent: typeof import('../../../../node_modules/h3').isEvent
  const isEventHandler: typeof import('../../../../node_modules/h3').isEventHandler
  const isMethod: typeof import('../../../../node_modules/h3').isMethod
  const isPreflightRequest: typeof import('../../../../node_modules/h3').isPreflightRequest
  const isStream: typeof import('../../../../node_modules/h3').isStream
  const isWebResponse: typeof import('../../../../node_modules/h3').isWebResponse
  const lazyEventHandler: typeof import('../../../../node_modules/h3').lazyEventHandler
  const loginSchema: typeof import('../../server/utils/validation').loginSchema
  const loginUser: typeof import('../../server/utils/auth').loginUser
  const logoutUser: typeof import('../../server/utils/auth').logoutUser
  const nitroPlugin: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/plugin').nitroPlugin
  const notFound: typeof import('../../server/utils/api').notFound
  const parseCookies: typeof import('../../../../node_modules/h3').parseCookies
  const parsePagination: typeof import('../../server/utils/api').parsePagination
  const passwordSchema: typeof import('../../server/utils/validation').passwordSchema
  const promisifyNodeListener: typeof import('../../../../node_modules/h3').promisifyNodeListener
  const proxyRequest: typeof import('../../../../node_modules/h3').proxyRequest
  const readBody: typeof import('../../../../node_modules/h3').readBody
  const readFormData: typeof import('../../../../node_modules/h3').readFormData
  const readMultipartFormData: typeof import('../../../../node_modules/h3').readMultipartFormData
  const readRawBody: typeof import('../../../../node_modules/h3').readRawBody
  const readValidatedBody: typeof import('../../../../node_modules/h3').readValidatedBody
  const registerSchema: typeof import('../../server/utils/validation').registerSchema
  const removeResponseHeader: typeof import('../../../../node_modules/h3').removeResponseHeader
  const requireParam: typeof import('../../server/utils/api').requireParam
  const requireQueryParam: typeof import('../../server/utils/api').requireQueryParam
  const runMigration: typeof import('../../server/utils/migrate').runMigration
  const runTask: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/task').runTask
  const sanitizeStatusCode: typeof import('../../../../node_modules/h3').sanitizeStatusCode
  const sanitizeStatusMessage: typeof import('../../../../node_modules/h3').sanitizeStatusMessage
  const sealSession: typeof import('../../../../node_modules/h3').sealSession
  const send: typeof import('../../../../node_modules/h3').send
  const sendEmail: typeof import('../../server/utils/email').sendEmail
  const sendError: typeof import('../../../../node_modules/h3').sendError
  const sendIterable: typeof import('../../../../node_modules/h3').sendIterable
  const sendNoContent: typeof import('../../../../node_modules/h3').sendNoContent
  const sendProxy: typeof import('../../../../node_modules/h3').sendProxy
  const sendRedirect: typeof import('../../../../node_modules/h3').sendRedirect
  const sendStream: typeof import('../../../../node_modules/h3').sendStream
  const sendWebResponse: typeof import('../../../../node_modules/h3').sendWebResponse
  const serveStatic: typeof import('../../../../node_modules/h3').serveStatic
  const serverError: typeof import('../../server/utils/api').serverError
  const setCookie: typeof import('../../../../node_modules/h3').setCookie
  const setHeader: typeof import('../../../../node_modules/h3').setHeader
  const setHeaders: typeof import('../../../../node_modules/h3').setHeaders
  const setResponseHeader: typeof import('../../../../node_modules/h3').setResponseHeader
  const setResponseHeaders: typeof import('../../../../node_modules/h3').setResponseHeaders
  const setResponseStatus: typeof import('../../../../node_modules/h3').setResponseStatus
  const setSessionCookie: typeof import('../../server/utils/auth').setSessionCookie
  const splitCookiesString: typeof import('../../../../node_modules/h3').splitCookiesString
  const toEventHandler: typeof import('../../../../node_modules/h3').toEventHandler
  const toNodeListener: typeof import('../../../../node_modules/h3').toNodeListener
  const toPlainHandler: typeof import('../../../../node_modules/h3').toPlainHandler
  const toWebHandler: typeof import('../../../../node_modules/h3').toWebHandler
  const toWebRequest: typeof import('../../../../node_modules/h3').toWebRequest
  const unauthorized: typeof import('../../server/utils/api').unauthorized
  const unsealSession: typeof import('../../../../node_modules/h3').unsealSession
  const updateSession: typeof import('../../../../node_modules/h3').updateSession
  const useAppConfig: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/config').useAppConfig
  const useBase: typeof import('../../../../node_modules/h3').useBase
  const useDb: typeof import('../../server/utils/db').useDb
  const useEvent: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/context').useEvent
  const useNitroApp: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/app').useNitroApp
  const useRuntimeConfig: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/config').useRuntimeConfig
  const useSession: typeof import('../../../../node_modules/h3').useSession
  const useStorage: typeof import('../../../../node_modules/nitropack/dist/runtime/internal/storage').useStorage
  const usernameSchema: typeof import('../../server/utils/validation').usernameSchema
  const writeEarlyHints: typeof import('../../../../node_modules/h3').writeEarlyHints
}
// for type re-export
declare global {
  // @ts-ignore
  export type { EventHandler, EventHandlerRequest, EventHandlerResponse, EventHandlerObject, H3EventContext } from '../../../../node_modules/h3'
  import('../../../../node_modules/h3')
  // @ts-ignore
  export type { ApiSuccess, ApiError, ApiResponse } from '../../server/utils/api'
  import('../../server/utils/api')
  // @ts-ignore
  export type { AuthUser } from '../../server/utils/auth'
  import('../../server/utils/auth')
  // @ts-ignore
  export type { SendEmailOptions } from '../../server/utils/email'
  import('../../server/utils/email')
}
export { H3Event, H3Error, appendCorsHeaders, appendCorsPreflightHeaders, appendHeader, appendHeaders, appendResponseHeader, appendResponseHeaders, assertMethod, callNodeListener, clearResponseHeaders, clearSession, createApp, createAppEventHandler, createError, createEvent, createEventStream, createRouter, defaultContentType, defineEventHandler, defineLazyEventHandler, defineNodeListener, defineNodeMiddleware, defineRequestMiddleware, defineResponseMiddleware, defineWebSocket, defineWebSocketHandler, deleteCookie, dynamicEventHandler, eventHandler, fetchWithEvent, fromNodeMiddleware, fromPlainHandler, fromWebHandler, getCookie, getHeader, getHeaders, getMethod, getProxyRequestHeaders, getQuery, getRequestFingerprint, getRequestHeader, getRequestHeaders, getRequestHost, getRequestIP, getRequestPath, getRequestProtocol, getRequestURL, getRequestWebStream, getResponseHeader, getResponseHeaders, getResponseStatus, getResponseStatusText, getRouterParam, getRouterParams, getSession, getValidatedQuery, getValidatedRouterParams, handleCacheHeaders, handleCors, isCorsOriginAllowed, isError, isEvent, isEventHandler, isMethod, isPreflightRequest, isStream, isWebResponse, lazyEventHandler, parseCookies, promisifyNodeListener, proxyRequest, readBody, readFormData, readMultipartFormData, readRawBody, readValidatedBody, removeResponseHeader, sanitizeStatusCode, sanitizeStatusMessage, sealSession, send, sendError, sendIterable, sendNoContent, sendProxy, sendRedirect, sendStream, sendWebResponse, serveStatic, setCookie, setHeader, setHeaders, setResponseHeader, setResponseHeaders, setResponseStatus, splitCookiesString, toEventHandler, toNodeListener, toPlainHandler, toWebHandler, toWebRequest, unsealSession, updateSession, useBase, useSession, writeEarlyHints } from 'h3';
export { useNitroApp } from 'nitropack/runtime/internal/app';
export { useRuntimeConfig, useAppConfig } from 'nitropack/runtime/internal/config';
export { defineNitroPlugin, nitroPlugin } from 'nitropack/runtime/internal/plugin';
export { defineCachedFunction, defineCachedEventHandler, cachedFunction, cachedEventHandler } from 'nitropack/runtime/internal/cache';
export { useStorage } from 'nitropack/runtime/internal/storage';
export { defineRenderHandler } from 'nitropack/runtime/internal/renderer';
export { defineRouteMeta } from 'nitropack/runtime/internal/meta';
export { getRouteRules } from 'nitropack/runtime/internal/route-rules';
export { useEvent } from 'nitropack/runtime/internal/context';
export { defineTask, runTask } from 'nitropack/runtime/internal/task';
export { defineNitroErrorHandler } from 'nitropack/runtime/internal/error/utils';
export { buildAssetsURL as __buildAssetsURL, publicAssetsURL as __publicAssetsURL } from '/home/um/sourcecode/my/um-multimedia-manager/node_modules/@nuxt/nitro-server/dist/runtime/utils/paths';
export { defineAppConfig } from '/home/um/sourcecode/my/um-multimedia-manager/node_modules/@nuxt/nitro-server/dist/runtime/utils/config';
export { apiSuccess, apiError, notFound, badRequest, unauthorized, forbidden, serverError, handleApiError, requireParam, requireQueryParam, parsePagination } from '/home/um/sourcecode/my/um-multimedia-manager/apps/web/server/utils/api';
export { generateSessionToken, getSessionCookie, setSessionCookie, clearSessionCookie, getSessionUser, hashPassword, loginUser, logoutUser } from '/home/um/sourcecode/my/um-multimedia-manager/apps/web/server/utils/auth';
export { useDb } from '/home/um/sourcecode/my/um-multimedia-manager/apps/web/server/utils/db';
export { sendEmail, generateVerificationToken, buildVerificationUrl } from '/home/um/sourcecode/my/um-multimedia-manager/apps/web/server/utils/email';
export { applyStatements, runMigration } from '/home/um/sourcecode/my/um-multimedia-manager/apps/web/server/utils/migrate';
export { usernameSchema, passwordSchema, inviteCodeSchema, loginSchema, registerSchema, createInviteCodeSchema } from '/home/um/sourcecode/my/um-multimedia-manager/apps/web/server/utils/validation';