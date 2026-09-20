import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class PasswordResetMailerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PasswordResetMailerService.name);
  private transporter: Transporter | null = null;
  private from: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const password = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM');

    if (
      !host ||
      !user ||
      !password ||
      !from ||
      password === 'TU_PASSWORD_REAL_DE_MAILTRAP'
    ) {
      this.handleConfigurationError(
        new Error('Configura SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM'),
      );
      return;
    }

    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 2525);

    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      this.handleConfigurationError(new Error('SMTP_PORT no es válido'));
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass: password },
    });
    this.from = from;

    try {
      await this.transporter.verify();
      this.logger.log('Conexión SMTP con Mailtrap verificada correctamente');
    } catch (error) {
      this.transporter = null;
      this.from = null;
      this.handleConfigurationError(error);
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  async send(email: string, token: string): Promise<void> {
    const resetUrl = new URL(
      this.configService.get<string>('PASSWORD_RESET_URL') ??
        'http://localhost:3000/reset-password',
    );
    resetUrl.searchParams.set('token', token);

    try {
      await this.sendMail({
        to: email,
        subject: 'Restablece tu contraseña',
        text: `Usa este enlace para restablecer tu contraseña: ${resetUrl.toString()}`,
        html: `<p>Usa el siguiente enlace para restablecer tu contraseña:</p><p><a href="${resetUrl.toString()}">Restablecer contraseña</a></p><p>Este enlace expirará pronto y solo puede utilizarse una vez.</p>`,
      });
    } catch (error) {
      this.logger.error('No se pudo enviar el correo de recuperación', error);
    }
  }

  async sendTest(email: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: '[MAILTRAP] Prueba SMTP',
      text: 'La configuración SMTP de Mailtrap funciona correctamente.',
      html: '<p>La configuración SMTP de Mailtrap funciona correctamente.</p>',
    });
  }

  private async sendMail(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    if (!this.transporter || !this.from) {
      throw new Error('SMTP no está configurado');
    }

    await this.transporter.sendMail({
      from: this.from,
      ...message,
    });
    this.logger.log('Correo enviado correctamente a Mailtrap');
  }

  private handleConfigurationError(error: unknown): void {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw error;
    }

    this.logger.warn(
      `SMTP no disponible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
