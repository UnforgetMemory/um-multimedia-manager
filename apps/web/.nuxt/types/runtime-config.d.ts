import { RuntimeConfig as UserRuntimeConfig, PublicRuntimeConfig as UserPublicRuntimeConfig } from 'nuxt/schema'
  interface SharedRuntimeConfig {
   app: {
      buildId: string,

      baseURL: string,

      buildAssetsDir: string,

      cdnURL: string,
   },

   nitro: {
      envPrefix: string,
   },
  }
  interface SharedPublicRuntimeConfig {
   auth: {
      isEnabled: boolean,

      baseURL: string,

      disableInternalRouting: boolean,

      disableServerSideAuth: boolean,

      originEnvKey: string,

      sessionRefresh: {
         enablePeriodically: boolean,

         enableOnWindowFocus: boolean,

         handler: any,
      },

      globalAppMiddleware: {
         isEnabled: boolean,

         allow404WithoutAuth: boolean,

         addDefaultCallbackUrl: boolean,
      },

      provider: {
         type: string,

         trustHost: boolean,

         defaultProvider: string,

         addDefaultCallbackUrl: boolean,
      },
   },
  }
declare module '@nuxt/schema' {
  interface RuntimeConfig extends UserRuntimeConfig {}
  interface PublicRuntimeConfig extends UserPublicRuntimeConfig {}
}
declare module 'nuxt/schema' {
  interface RuntimeConfig extends SharedRuntimeConfig {}
  interface PublicRuntimeConfig extends SharedPublicRuntimeConfig {}
}
declare module 'vue' {
        interface ComponentCustomProperties {
          $config: UserRuntimeConfig
        }
      }