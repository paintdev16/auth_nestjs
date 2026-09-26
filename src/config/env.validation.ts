type Environment = Record<string, unknown>;

export function validateEnvironment(environment: Environment) {
  const jwtSecret = environment['JWT_SECRET'];
  const frontendUrl = environment['FRONTEND_URL'] ?? 'http://localhost:3001';
  const accessTtl =
    typeof environment['JWT_ACCESS_TTL'] === 'string'
      ? environment['JWT_ACCESS_TTL']
      : '15m';

  if (
    typeof jwtSecret !== 'string' ||
    jwtSecret.length < 32 ||
    jwtSecret.includes('replace-with-')
  ) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres aleatorios');
  }

  if (typeof frontendUrl !== 'string') {
    throw new Error('FRONTEND_URL debe ser una URL o una lista de URLs');
  }

  if (!['15m', '30m', '1h'].includes(accessTtl)) {
    throw new Error('JWT_ACCESS_TTL debe ser 15m, 30m o 1h');
  }

  const rootEmail = environment['ROOT_EMAIL'];
  const rootPassword = environment['ROOT_PASSWORD'];
  if ((rootEmail && !rootPassword) || (!rootEmail && rootPassword)) {
    throw new Error('ROOT_EMAIL y ROOT_PASSWORD deben configurarse juntos');
  }
  if (rootEmail && typeof rootEmail === 'string' && !/^\S+@\S+\.\S+$/.test(rootEmail)) {
    throw new Error('ROOT_EMAIL debe ser una dirección de correo válida');
  }
  if (rootPassword && typeof rootPassword === 'string' && rootPassword.length < 12) {
    throw new Error('ROOT_PASSWORD debe tener al menos 12 caracteres');
  }

  for (const origin of frontendUrl.split(',').map((item) => item.trim())) {
    try {
      const parsed = new URL(origin);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error();
      }

      if (
        environment['NODE_ENV'] === 'production' &&
        parsed.protocol !== 'https:'
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(`FRONTEND_URL contiene un origen inválido: ${origin}`);
    }
  }

  if (environment['NODE_ENV'] === 'production') {
    if (typeof environment['FRONTEND_URL'] !== 'string') {
      throw new Error('FRONTEND_URL debe configurarse en producción');
    }

    const requiredMailSettings = [
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
    ];

    const missingMailSettings = requiredMailSettings.filter(
      (key) =>
        typeof environment[key] !== 'string' ||
        environment[key] === '' ||
        environment[key] === 'TU_PASSWORD_REAL_DE_MAILTRAP',
    );

    if (missingMailSettings.length > 0) {
      throw new Error(
        `Falta configurar el correo transaccional: ${missingMailSettings.join(', ')}`,
      );
    }

    for (const key of ['PASSWORD_RESET_URL', 'EMAIL_VERIFICATION_URL']) {
      const configuredUrl = environment[key];

      if (typeof configuredUrl !== 'string') {
        throw new Error(`${key} debe ser una URL HTTPS en producción`);
      }

      try {
        const url = new URL(configuredUrl);

        if (url.protocol !== 'https:') {
          throw new Error();
        }
      } catch {
        throw new Error(`${key} debe ser una URL HTTPS en producción`);
      }
    }
  }

  return environment;
}
