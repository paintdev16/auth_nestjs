import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { PasswordResetMailerService } from '../auth/password-reset-mailer.service.js';

const configService = new ConfigService();
const recipient =
  process.argv.slice(2).find((argument) => argument !== '--') ??
  configService.get<string>('TEST_EMAIL_TO') ??
  configService.get<string>('SMTP_FROM');

if (!recipient) {
  throw new Error(
    'Indica un destinatario: pnpm run email:test -- correo@ejemplo.com',
  );
}

const mailer = new PasswordResetMailerService(configService);

try {
  await mailer.onModuleInit();
  await mailer.sendTest(recipient);
  console.log(`Correo de prueba enviado a ${recipient}`);
} catch (error) {
  console.error('No se pudo enviar el correo de prueba', error);
  process.exitCode = 1;
} finally {
  mailer.onModuleDestroy();
}
