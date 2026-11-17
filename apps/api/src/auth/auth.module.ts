import { Module } from '@nestjs/common';
import { createRemoteJWKSet } from 'jose';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { JWT_VERIFIER_OPTIONS, JwtVerifier, type JwtVerifierOptions } from './jwt-verifier.js';

@Module({
  providers: [
    {
      provide: JWT_VERIFIER_OPTIONS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): JwtVerifierOptions => ({
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
        keys: createRemoteJWKSet(new URL(config.jwksUrl), {
          timeoutDuration: 5_000,
          cooldownDuration: 30_000,
          cacheMaxAge: 10 * 60_000,
        }),
      }),
    },
    JwtVerifier,
  ],
  exports: [JwtVerifier],
})
export class AuthModule {}
